import "server-only";

import {
  assertKnownReference,
  assertUpdated,
  auditImportCommit,
  failureReason,
  runClaimedCommit,
  type ImportCommitInput,
} from "@/lib/import-commit";
import { chunkArray, computeIgnoredColumns, omitColumns, parseImportCsv, parseImportDate } from "@/lib/import-normalize";
import { fetchAllPages, loadChurchIdSet, loadSourceIdIndex } from "@/lib/import-profile-index";
import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import {
  EVENT_SOURCE_ALIASES,
  eventConsumedAliases,
  pickEventField,
  normalizeEventImportSourceRow,
  type EventsImportSourceSystem,
  type NormalizedEventImportRow,
} from "@/lib/events-import-source-adapters";

export type EventsImportDryRunResult = {
  batchId: string;
  counts: { create: number; update: number; skip: number; reject: number; unmatchedMinistries: number };
  /** Header names (never cell values) that no field mapping used. */
  ignoredColumns: string[];
  /** Rows in the file; the result lists them all, but a UI may preview fewer ("showing 50 of N"). */
  totalRows: number;
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
  /** Why rows failed; fixed phrases, never headers or cell values. */
  failureReasons: string[];
};

const ALLOWED_APPROVAL_STATUSES = new Set(["draft", "pending", "approved", "archived"]);

type NormalizedEventPayload = NormalizedEventImportRow & {
  ministryId: string | null;
  /** Real instants of the start and end (church time zone applied). */
  startsAtInstant: string | null;
  endsAtInstant: string | null;
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

  return loadSourceIdIndex(churchId, "events");
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
  const data = await fetchAllPages<{ id: string; name: string | null }>((from, to) =>
    supabase
      .from("ministries")
      .select("id, name")
      .eq("church_id", churchId)
      .order("id", { ascending: true })
      .range(from, to),
  );

  const map = new Map<string, string>();
  for (const row of data) {
    if (row.name) {
      map.set((row.name as string).trim().toLowerCase(), row.id);
    }
  }
  return map;
}

export function classifyEventsImportRows(
  csvRows: Record<string, string>[],
  sourceSystem: EventsImportSourceSystem,
  eventsIndex: Map<string, string>,
  ministriesIndex: Map<string, string>,
  timeZone: string | null = null,
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
      normalizedPayloads.push({ ...normalized, ministryId: null, startsAtInstant: null, endsAtInstant: null });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    const startsAtParsed = parseImportDate(normalized.startsAt, timeZone);
    const endsAtParsed = parseImportDate(normalized.endsAt, timeZone);

    // 2. Missing or invalid starts_at
    if (!startsAtParsed.ok) {
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
        reason: "Missing or invalid starts_at — use YYYY-MM-DD or mm/dd/yyyy.",
      });
      normalizedPayloads.push({ ...normalized, ministryId: null, startsAtInstant: null, endsAtInstant: null });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // 3. Missing or invalid ends_at
    if (!endsAtParsed.ok) {
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
        reason: "Missing or invalid ends_at — use YYYY-MM-DD or mm/dd/yyyy.",
      });
      normalizedPayloads.push({ ...normalized, ministryId: null, startsAtInstant: null, endsAtInstant: null });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // 4. ends_at must be after starts_at
    if (new Date(endsAtParsed.instant) <= new Date(startsAtParsed.instant)) {
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
      normalizedPayloads.push({ ...normalized, ministryId: null, startsAtInstant: null, endsAtInstant: null });
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
      normalizedPayloads.push({ ...normalized, ministryId: null, startsAtInstant: null, endsAtInstant: null });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // 6. Invalid capacity — use alias-aware lookup so future adapter aliases are respected
    const rawCapacityStr = pickEventField(csvRow, (EVENT_SOURCE_ALIASES[sourceSystem] ?? EVENT_SOURCE_ALIASES.generic_csv).capacity);
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
        normalizedPayloads.push({ ...normalized, ministryId: null, startsAtInstant: null, endsAtInstant: null });
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
      normalizedPayloads.push({ ...normalized, ministryId: null, startsAtInstant: null, endsAtInstant: null });
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
    normalizedPayloads.push({
      ...normalized,
      ministryId,
      startsAtInstant: startsAtParsed.instant,
      endsAtInstant: endsAtParsed.instant,
    });
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
  ignoredColumns: string[],
): Promise<string> {
  const summary = { ...counts, ignoredColumns };
  if (shouldUseLocalTenantFallback()) {
    const batch = await queryTenantLocalDb<{ id: string }>(
      `insert into public.import_batches
         (church_id, import_type, source_system, source_filename, created_by_profile_id,
          status, dry_run, summary)
       values ($1, 'events_csv', $2, $3, $4, 'dry_run_completed', true, $5::jsonb)
       returning id`,
      [churchId, sourceSystem, sourceFilename, actorProfileId, JSON.stringify(summary)],
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
      summary,
    })
    .select("id")
    .single();

  if (batchError || !batch?.id) {
    throw new Error(batchError?.message ?? "Unable to create import batch.");
  }

  // Chunked: a 5,000-row batch is too large for one request.
  const batchRows = rows.map((row, i) => ({
      batch_id: batch.id,
      church_id: churchId,
      row_number: row.rowNumber,
      raw_payload: rawCsvRows[i] ?? {},
      normalized_payload: normalizedPayloads[i],
      classification: row.action,
      reason: row.reason,
    }));
  for (const part of chunkArray(batchRows, 500)) {
    const { error: rowsError } = await supabase.from("import_batch_rows").insert(part);
    if (rowsError) {
      throw new Error(rowsError.message);
    }
  }

  return batch.id;
}

export async function runEventsImportDryRun(input: {
  churchId: string;
  actorProfileId: string | null;
  sourceSystem?: EventsImportSourceSystem;
  sourceFilename: string;
  csvText: string;
  /** The church's IANA time zone, applied to dates and times without an offset. */
  timeZone?: string | null;
}): Promise<EventsImportDryRunResult> {
  const csv = parseImportCsv(input.csvText);
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
    input.timeZone ?? null,
  );
  const ignoredColumns = computeIgnoredColumns(csv.headers, eventConsumedAliases(sourceSystem));

  const batchId = await insertDryRunBatchAndRows(
    input.churchId,
    input.actorProfileId,
    sourceSystem,
    input.sourceFilename,
    rows,
    normalizedPayloads,
    csv.rows.map((row) => omitColumns(row, ignoredColumns)),
    counts,
    ignoredColumns,
  );

  return { batchId, counts, ignoredColumns, totalRows: csv.rows.length, rows };
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
    startsAtInstant: typeof row.startsAtInstant === "string" ? row.startsAtInstant : null,
    endsAtInstant: typeof row.endsAtInstant === "string" ? row.endsAtInstant : null,
  };
}

export async function commitEventsImportBatch(input: ImportCommitInput): Promise<EventsImportCommitResult> {
  return runClaimedCommit(input, () => commitEventsImportBatchClaimed(input));
}

async function commitEventsImportBatchClaimed(input: ImportCommitInput): Promise<EventsImportCommitResult> {
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

    const rows = await fetchAllPages<{ normalized_payload: unknown }>((from, to) =>
      supabase
        .from("import_batch_rows")
        .select("normalized_payload")
        .eq("batch_id", input.batchId)
        .eq("church_id", input.churchId)
        .in("classification", ["create", "update"])
        .order("row_number", { ascending: true })
        .range(from, to),
    );

    normalizedPayloads = (rows ?? [])
      .map((row) =>
        normalizeBatchRowPayload((row as { normalized_payload: unknown }).normalized_payload),
      )
      .filter((row): row is NormalizedEventPayload => Boolean(row));
  }

  if (shouldUseLocalTenantFallback() && (batchStatus !== "dry_run_completed" || !dryRun)) {
    throw new Error("Only dry-run-completed batches can be committed.");
  }

  let created = 0;
  let updated = 0;
  let failed = 0;
  const failureReasons = new Set<string>();

  const ministryIds = shouldUseLocalTenantFallback() ? null : await loadChurchIdSet(input.churchId, "ministries");

  for (const payload of normalizedPayloads) {
    try {
      assertKnownReference(payload.ministryId, ministryIds);
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
                 description = coalesce($2, description),
                 location = coalesce($3, location),
                 starts_at = $4,
                 ends_at = $5,
                 capacity = coalesce($6, capacity),
                 ministry_id = coalesce($7, ministry_id),
                 approval_status = $8,
                 updated_at = now()
             where church_id = $9 and source_id = $10`,
            [
              payload.title,
              payload.description,
              payload.location,
              payload.startsAtInstant ?? payload.startsAt,
              payload.endsAtInstant ?? payload.endsAt,
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
                capacity, ministry_id, approval_status, category)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'general')`,
            [
              input.churchId,
              payload.sourceId,
              payload.title,
              payload.description,
              payload.location,
              payload.startsAtInstant ?? payload.startsAt,
              payload.endsAtInstant ?? payload.endsAt,
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
          const { data: updatedRows, error } = await supabase
            .from("events")
            .update({
              title: payload.title,
              // A blank cell never erases what the church already has.
              ...(payload.description ? { description: payload.description } : {}),
              ...(payload.location ? { location: payload.location } : {}),
              starts_at: payload.startsAtInstant ?? payload.startsAt,
              ends_at: payload.endsAtInstant ?? payload.endsAt,
              ...(payload.capacity != null ? { capacity: payload.capacity } : {}),
              ...(payload.ministryId ? { ministry_id: payload.ministryId } : {}),
              approval_status: approvalStatus,
              updated_at: new Date().toISOString(),
            })
            .eq("church_id", input.churchId)
            .eq("source_id", payload.sourceId)
            .select("id");

          if (error) {
            throw new Error(error.message);
          }
          assertUpdated(updatedRows);
          updated += 1;
        } else {
          const { error } = await supabase.from("events").insert({
            church_id: input.churchId,
            source_id: payload.sourceId,
            title: payload.title,
            description: payload.description,
            location: payload.location,
            starts_at: payload.startsAtInstant ?? payload.startsAt,
            ends_at: payload.endsAtInstant ?? payload.endsAt,
            capacity: payload.capacity,
            ministry_id: payload.ministryId,
            approval_status: approvalStatus,
            // events.category is NOT NULL with no default; imports used to fail on every insert.
            category: "general",
          });

          if (error) {
            throw new Error(error.message);
          }
          created += 1;
        }
      }
    } catch (error) {
      failed += 1;
      failureReasons.add(failureReason(error));
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
    ...(failureReasons.size > 0 ? { failureReasons: [...failureReasons].slice(0, 10) } : {}),
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

  await auditImportCommit(input, { status, created, updated, failed });

  return {
    batchId: input.batchId,
    status,
    created,
    updated,
    failed,
    failureReasons: [...failureReasons].slice(0, 10),
  };
}
