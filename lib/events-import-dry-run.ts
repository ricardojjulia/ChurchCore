import "server-only";

import { parseCsv } from "@/lib/finance-import";
import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import {
  EVENT_SOURCE_ALIASES,
  pickEventField,
  normalizeEventImportSourceRow,
  type EventsImportSourceSystem,
  type NormalizedEventImportRow,
} from "@/lib/events-import-source-adapters";

export type EventsImportDryRunResult = {
  batchId: string;
  counts: { create: number; update: number; skip: number; reject: number; unmatchedMinistries: number };
  rows: EventsImportDryRunRow[];
};

export type EventsImportDryRunRow = {
  rowNumber: number;
  sourceId: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  ministryName: string | null;
  ministryResolved: boolean;
  action: "create" | "update" | "skip" | "reject";
  reason: string | null;
};

export type EventsImportCommitResult = {
  batchId: string;
  status: "committed" | "failed";
  created: number;
  updated: number;
  failed: number;
};

const ALLOWED_APPROVAL_STATUSES = new Set(["draft", "pending", "approved", "archived"]);

function isIso8601(s: string): boolean {
  return !isNaN(Date.parse(s)) && /^\d{4}-\d{2}-\d{2}/.test(s);
}

type NormalizedEventPayload = NormalizedEventImportRow & {
  ministryId: string | null;
};

async function loadExistingEventsIndex(churchId: string): Promise<Map<string, string>> {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string; source_id: string }>(
      `select id, source_id from public.events where church_id = $1 and source_id is not null`,
      [churchId],
    );

    const map = new Map<string, string>();
    for (const row of result.rows) {
      map.set(row.source_id, row.id);
    }
    return map;
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("events")
    .select("id, source_id")
    .eq("church_id", churchId)
    .not("source_id", "is", null);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.source_id) {
      map.set(row.source_id, row.id);
    }
  }
  return map;
}

async function loadExistingMinistriesIndex(churchId: string): Promise<Map<string, string>> {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string; name: string }>(
      `select id, name from public.ministries where church_id = $1`,
      [churchId],
    );

    const map = new Map<string, string>();
    for (const row of result.rows) {
      map.set(row.name.trim().toLowerCase(), row.id);
    }
    return map;
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("ministries")
    .select("id, name")
    .eq("church_id", churchId);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.name) {
      map.set((row.name as string).trim().toLowerCase(), row.id);
    }
  }
  return map;
}

function classifyEventsImportRows(
  csvRows: Record<string, string>[],
  sourceSystem: EventsImportSourceSystem,
  eventsIndex: Map<string, string>,
  ministriesIndex: Map<string, string>,
): {
  counts: EventsImportDryRunResult["counts"];
  rows: EventsImportDryRunRow[];
  normalizedPayloads: NormalizedEventPayload[];
} {
  const counts = { create: 0, update: 0, skip: 0, reject: 0, unmatchedMinistries: 0 };
  const rows: EventsImportDryRunRow[] = [];
  const normalizedPayloads: NormalizedEventPayload[] = [];
  const seenSourceIds = new Set<string>();

  for (let index = 0; index < csvRows.length; index += 1) {
    const csvRow = csvRows[index];
    const rowNumber = index + 2;
    const normalized = normalizeEventImportSourceRow(csvRow, sourceSystem, index);

    // 1. Missing title
    if (!normalized.title || normalized.title.trim().length === 0) {
      counts.reject += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        title: normalized.title,
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        ministryName: normalized.ministryName,
        ministryResolved: false,
        action: "reject",
        reason: "Missing event title.",
      });
      normalizedPayloads.push({ ...normalized, ministryId: null });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // 2. Missing or invalid starts_at
    if (!normalized.startsAt || !isIso8601(normalized.startsAt)) {
      counts.reject += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        title: normalized.title,
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        ministryName: normalized.ministryName,
        ministryResolved: false,
        action: "reject",
        reason: "Missing or invalid starts_at — ISO 8601 required.",
      });
      normalizedPayloads.push({ ...normalized, ministryId: null });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // 3. Missing or invalid ends_at
    if (!normalized.endsAt || !isIso8601(normalized.endsAt)) {
      counts.reject += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        title: normalized.title,
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        ministryName: normalized.ministryName,
        ministryResolved: false,
        action: "reject",
        reason: "Missing or invalid ends_at — ISO 8601 required.",
      });
      normalizedPayloads.push({ ...normalized, ministryId: null });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // 4. ends_at must be after starts_at
    if (new Date(normalized.endsAt) <= new Date(normalized.startsAt)) {
      counts.reject += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        title: normalized.title,
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        ministryName: normalized.ministryName,
        ministryResolved: false,
        action: "reject",
        reason: "ends_at must be after starts_at.",
      });
      normalizedPayloads.push({ ...normalized, ministryId: null });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // 5. Invalid approval_status
    if (
      normalized.approvalStatus != null &&
      !ALLOWED_APPROVAL_STATUSES.has(normalized.approvalStatus)
    ) {
      counts.reject += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        title: normalized.title,
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        ministryName: normalized.ministryName,
        ministryResolved: false,
        action: "reject",
        reason: "Invalid approval_status value.",
      });
      normalizedPayloads.push({ ...normalized, ministryId: null });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // 6. Invalid capacity — use alias-aware lookup so future adapter aliases are respected
    const rawCapacityStr = pickEventField(csvRow, EVENT_SOURCE_ALIASES[sourceSystem].capacity);
    if (rawCapacityStr != null && rawCapacityStr.trim().length > 0) {
      const parsed = parseInt(rawCapacityStr, 10);
      if (isNaN(parsed) || parsed <= 0) {
        counts.reject += 1;
        rows.push({
          rowNumber,
          sourceId: normalized.sourceId,
          title: normalized.title,
          startsAt: normalized.startsAt,
          endsAt: normalized.endsAt,
          ministryName: normalized.ministryName,
          ministryResolved: false,
          action: "reject",
          reason: "Invalid capacity — must be a positive integer.",
        });
        normalizedPayloads.push({ ...normalized, ministryId: null });
        seenSourceIds.add(normalized.sourceId);
        continue;
      }
    }

    // 7. Duplicate sourceId in file
    if (seenSourceIds.has(normalized.sourceId)) {
      counts.skip += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        title: normalized.title,
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        ministryName: normalized.ministryName,
        ministryResolved: false,
        action: "skip",
        reason: "Duplicate source ID in import file.",
      });
      normalizedPayloads.push({ ...normalized, ministryId: null });
      continue;
    }

    // 8 & 9. Determine action: create or update
    const existingEventId = eventsIndex.get(normalized.sourceId);
    const action: "create" | "update" = existingEventId ? "update" : "create";
    counts[action] += 1;

    // 10. Resolve ministry
    let ministryId: string | null = null;
    let ministryResolved = false;
    let reason: string | null = null;

    if (normalized.ministryName != null) {
      const key = normalized.ministryName.trim().toLowerCase();
      const resolvedId = ministriesIndex.get(key);
      if (resolvedId) {
        ministryId = resolvedId;
        ministryResolved = true;
      } else {
        counts.unmatchedMinistries += 1;
        reason = "Ministry not matched — ministry_id will be unset.";
      }
    }

    seenSourceIds.add(normalized.sourceId);

    rows.push({
      rowNumber,
      sourceId: normalized.sourceId,
      title: normalized.title,
      startsAt: normalized.startsAt,
      endsAt: normalized.endsAt,
      ministryName: normalized.ministryName,
      ministryResolved,
      action,
      reason,
    });
    normalizedPayloads.push({ ...normalized, ministryId });
  }

  return { counts, rows, normalizedPayloads };
}

async function insertDryRunBatchAndRows(
  churchId: string,
  actorProfileId: string | null,
  sourceSystem: EventsImportSourceSystem,
  sourceFilename: string,
  rows: EventsImportDryRunRow[],
  normalizedPayloads: NormalizedEventPayload[],
  rawCsvRows: Record<string, string>[],
  counts: EventsImportDryRunResult["counts"],
): Promise<string> {
  if (shouldUseLocalTenantFallback()) {
    const batch = await queryTenantLocalDb<{ id: string }>(
      `insert into public.import_batches
         (church_id, import_type, source_system, source_filename, created_by_profile_id,
          status, dry_run, summary)
       values ($1, 'events_csv', $2, $3, $4, 'dry_run_completed', true, $5::jsonb)
       returning id`,
      [churchId, sourceSystem, sourceFilename, actorProfileId, JSON.stringify(counts)],
    );

    const batchId = batch.rows[0]?.id;
    if (!batchId) {
      throw new Error("Unable to create import batch.");
    }

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const normalizedPayload = normalizedPayloads[i];
      await queryTenantLocalDb(
        `insert into public.import_batch_rows
           (batch_id, church_id, row_number, raw_payload, normalized_payload, classification, reason)
         values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)`,
        [
          batchId,
          churchId,
          row.rowNumber,
          JSON.stringify(rawCsvRows[i] ?? {}),
          JSON.stringify(normalizedPayload),
          row.action,
          row.reason,
        ],
      );
    }

    return batchId;
  }

  const supabase = await createTenantServerClient();
  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      church_id: churchId,
      import_type: "events_csv",
      source_system: sourceSystem,
      source_filename: sourceFilename,
      created_by_profile_id: actorProfileId,
      status: "dry_run_completed",
      dry_run: true,
      summary: counts,
    })
    .select("id")
    .single();

  if (batchError || !batch?.id) {
    throw new Error(batchError?.message ?? "Unable to create import batch.");
  }

  const { error: rowsError } = await supabase.from("import_batch_rows").insert(
    rows.map((row, i) => ({
      batch_id: batch.id,
      church_id: churchId,
      row_number: row.rowNumber,
      raw_payload: rawCsvRows[i] ?? {},
      normalized_payload: normalizedPayloads[i],
      classification: row.action,
      reason: row.reason,
    })),
  );

  if (rowsError) {
    throw new Error(rowsError.message);
  }

  return batch.id;
}

export async function runEventsImportDryRun(input: {
  churchId: string;
  actorProfileId: string | null;
  sourceSystem?: EventsImportSourceSystem;
  sourceFilename: string;
  csvText: string;
}): Promise<EventsImportDryRunResult> {
  const csv = await parseCsv(input.csvText);
  if (csv.errors.length > 0) {
    throw new Error(csv.errors[0] ?? "Unable to parse CSV file.");
  }

  if (csv.rows.length === 0) {
    throw new Error("CSV file has no data rows.");
  }

  const sourceSystem = input.sourceSystem ?? "generic_csv";

  const [eventsIndex, ministriesIndex] = await Promise.all([
    loadExistingEventsIndex(input.churchId),
    loadExistingMinistriesIndex(input.churchId),
  ]);

  const { counts, rows, normalizedPayloads } = classifyEventsImportRows(
    csv.rows,
    sourceSystem,
    eventsIndex,
    ministriesIndex,
  );

  const batchId = await insertDryRunBatchAndRows(
    input.churchId,
    input.actorProfileId,
    sourceSystem,
    input.sourceFilename,
    rows,
    normalizedPayloads,
    csv.rows,
    counts,
  );

  return { batchId, counts, rows };
}

function normalizeBatchRowPayload(payload: unknown): NormalizedEventPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const row = payload as Partial<NormalizedEventPayload>;
  if (typeof row.sourceId !== "string") {
    return null;
  }

  return {
    sourceId: row.sourceId,
    title: typeof row.title === "string" ? row.title : "",
    description: typeof row.description === "string" ? row.description : null,
    location: typeof row.location === "string" ? row.location : null,
    startsAt: typeof row.startsAt === "string" ? row.startsAt : null,
    endsAt: typeof row.endsAt === "string" ? row.endsAt : null,
    capacity: typeof row.capacity === "number" ? row.capacity : null,
    ministryName: typeof row.ministryName === "string" ? row.ministryName : null,
    approvalStatus: typeof row.approvalStatus === "string" ? row.approvalStatus : null,
    ministryId: typeof row.ministryId === "string" ? row.ministryId : null,
  };
}

export async function commitEventsImportBatch(input: {
  churchId: string;
  actorProfileId: string | null;
  batchId: string;
}): Promise<EventsImportCommitResult> {
  let batchStatus: string | null = null;
  let dryRun = true;
  let normalizedPayloads: NormalizedEventPayload[] = [];

  if (shouldUseLocalTenantFallback()) {
    const batchResult = await queryTenantLocalDb<{ status: string; dry_run: boolean }>(
      `select status, dry_run
       from public.import_batches
       where id = $1 and church_id = $2
       limit 1`,
      [input.batchId, input.churchId],
    );

    const batch = batchResult.rows[0];
    if (!batch) {
      throw new Error("Import batch not found.");
    }

    batchStatus = batch.status;
    dryRun = batch.dry_run;

    const rowsResult = await queryTenantLocalDb<{ normalized_payload: unknown }>(
      `select normalized_payload
       from public.import_batch_rows
       where batch_id = $1 and church_id = $2 and classification in ('create', 'update')
       order by row_number asc`,
      [input.batchId, input.churchId],
    );

    normalizedPayloads = rowsResult.rows
      .map((row) => normalizeBatchRowPayload(row.normalized_payload))
      .filter((row): row is NormalizedEventPayload => Boolean(row));
  } else {
    const supabase = await createTenantServerClient();

    const { data: batch } = await supabase
      .from("import_batches")
      .select("status, dry_run")
      .eq("id", input.batchId)
      .eq("church_id", input.churchId)
      .maybeSingle();

    if (!batch) {
      throw new Error("Import batch not found.");
    }

    batchStatus = batch.status;
    dryRun = batch.dry_run;

    const { data: rows } = await supabase
      .from("import_batch_rows")
      .select("normalized_payload")
      .eq("batch_id", input.batchId)
      .eq("church_id", input.churchId)
      .in("classification", ["create", "update"])
      .order("row_number", { ascending: true });

    normalizedPayloads = (rows ?? [])
      .map((row) =>
        normalizeBatchRowPayload((row as { normalized_payload: unknown }).normalized_payload),
      )
      .filter((row): row is NormalizedEventPayload => Boolean(row));
  }

  if (batchStatus !== "dry_run_completed" || !dryRun) {
    throw new Error("Only dry-run-completed batches can be committed.");
  }

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const payload of normalizedPayloads) {
    try {
      const approvalStatus = payload.approvalStatus ?? "draft";

      if (shouldUseLocalTenantFallback()) {
        const existing = await queryTenantLocalDb<{ id: string }>(
          `select id from public.events where church_id = $1 and source_id = $2 limit 1`,
          [input.churchId, payload.sourceId],
        );

        if (existing.rows[0]?.id) {
          await queryTenantLocalDb(
            `update public.events
             set title = $1,
                 description = $2,
                 location = $3,
                 starts_at = $4,
                 ends_at = $5,
                 capacity = $6,
                 ministry_id = $7,
                 approval_status = $8,
                 updated_at = now()
             where church_id = $9 and source_id = $10`,
            [
              payload.title,
              payload.description,
              payload.location,
              payload.startsAt,
              payload.endsAt,
              payload.capacity,
              payload.ministryId,
              approvalStatus,
              input.churchId,
              payload.sourceId,
            ],
          );
          updated += 1;
        } else {
          await queryTenantLocalDb(
            `insert into public.events
               (church_id, source_id, title, description, location, starts_at, ends_at,
                capacity, ministry_id, approval_status)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              input.churchId,
              payload.sourceId,
              payload.title,
              payload.description,
              payload.location,
              payload.startsAt,
              payload.endsAt,
              payload.capacity,
              payload.ministryId,
              approvalStatus,
            ],
          );
          created += 1;
        }
      } else {
        const supabase = await createTenantServerClient();

        const { data: existing } = await supabase
          .from("events")
          .select("id")
          .eq("church_id", input.churchId)
          .eq("source_id", payload.sourceId)
          .maybeSingle();

        if (existing?.id) {
          const { error } = await supabase
            .from("events")
            .update({
              title: payload.title,
              description: payload.description,
              location: payload.location,
              starts_at: payload.startsAt,
              ends_at: payload.endsAt,
              capacity: payload.capacity,
              ministry_id: payload.ministryId,
              approval_status: approvalStatus,
              updated_at: new Date().toISOString(),
            })
            .eq("church_id", input.churchId)
            .eq("source_id", payload.sourceId);

          if (error) {
            throw new Error(error.message);
          }
          updated += 1;
        } else {
          const { error } = await supabase.from("events").insert({
            church_id: input.churchId,
            source_id: payload.sourceId,
            title: payload.title,
            description: payload.description,
            location: payload.location,
            starts_at: payload.startsAt,
            ends_at: payload.endsAt,
            capacity: payload.capacity,
            ministry_id: payload.ministryId,
            approval_status: approvalStatus,
          });

          if (error) {
            throw new Error(error.message);
          }
          created += 1;
        }
      }
    } catch {
      failed += 1;
    }
  }

  const status: EventsImportCommitResult["status"] =
    failed > 0 && created + updated === 0 ? "failed" : "committed";

  const summary = {
    committedByProfileId: input.actorProfileId,
    committedAt: new Date().toISOString(),
    created,
    updated,
    failed,
  };

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.import_batches
       set status = $3,
           dry_run = false,
           summary = coalesce(summary, '{}'::jsonb) || $4::jsonb,
           committed_at = case when $3 = 'committed' then now() else committed_at end,
           failed_at = case when $3 = 'failed' then now() else failed_at end
       where id = $1 and church_id = $2`,
      [input.batchId, input.churchId, status, JSON.stringify(summary)],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase
      .from("import_batches")
      .update({
        status,
        dry_run: false,
        summary,
        committed_at: status === "committed" ? new Date().toISOString() : null,
        failed_at: status === "failed" ? new Date().toISOString() : null,
      })
      .eq("id", input.batchId)
      .eq("church_id", input.churchId);

    if (error) {
      throw new Error(error.message);
    }
  }

  return {
    batchId: input.batchId,
    status,
    created,
    updated,
    failed,
  };
}
