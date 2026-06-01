import "server-only";

import { parseCsv } from "@/lib/finance-import";
import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import {
  normalizeGroupImportSourceRow,
  type GroupsImportSourceSystem,
  type NormalizedGroupImportRow,
} from "@/lib/groups-import-source-adapters";

export type GroupsImportDryRunResult = {
  batchId: string;
  counts: { create: number; update: number; skip: number; reject: number; unmatchedLeaders: number };
  rows: GroupsImportDryRunRow[];
};

export type GroupsImportDryRunRow = {
  rowNumber: number;
  sourceId: string;
  name: string;
  category: string | null;
  leaderEmail: string | null;
  leaderResolved: boolean;
  action: "create" | "update" | "skip" | "reject";
  reason: string | null;
};

export type GroupsImportCommitResult = {
  batchId: string;
  status: "committed" | "failed";
  created: number;
  updated: number;
  failed: number;
};

const ALLOWED_CATEGORIES = new Set([
  "general",
  "life_stage",
  "geographic",
  "interest",
  "discipleship",
  "support",
  "service",
  "youth",
  "seniors",
]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type NormalizedGroupPayload = NormalizedGroupImportRow & {
  leaderProfileId: string | null;
};

async function loadExistingGroupsIndex(churchId: string): Promise<Map<string, string>> {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string; source_id: string }>(
      `select id, source_id from public.groups where church_id = $1 and source_id is not null`,
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
    .from("groups")
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

async function loadExistingProfilesIndex(churchId: string): Promise<Map<string, string>> {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string; email: string }>(
      `select id, email from public.profiles where church_id = $1 and email is not null`,
      [churchId],
    );

    const map = new Map<string, string>();
    for (const row of result.rows) {
      map.set(row.email.toLowerCase(), row.id);
    }
    return map;
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("church_id", churchId)
    .not("email", "is", null);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.email) {
      map.set((row.email as string).toLowerCase(), row.id);
    }
  }
  return map;
}

function classifyGroupsImportRows(
  csvRows: Record<string, string>[],
  sourceSystem: GroupsImportSourceSystem,
  groupsIndex: Map<string, string>,
  profilesIndex: Map<string, string>,
): {
  counts: GroupsImportDryRunResult["counts"];
  rows: GroupsImportDryRunRow[];
  normalizedPayloads: NormalizedGroupPayload[];
} {
  const counts = { create: 0, update: 0, skip: 0, reject: 0, unmatchedLeaders: 0 };
  const rows: GroupsImportDryRunRow[] = [];
  const normalizedPayloads: NormalizedGroupPayload[] = [];
  const seenSourceIds = new Set<string>();

  for (let index = 0; index < csvRows.length; index += 1) {
    const csvRow = csvRows[index];
    const rowNumber = index + 2;
    const normalized = normalizeGroupImportSourceRow(csvRow, sourceSystem, index);

    // Missing name
    if (!normalized.name || normalized.name.trim().length === 0) {
      counts.reject += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        name: normalized.name,
        category: normalized.category,
        leaderEmail: normalized.leaderEmail,
        leaderResolved: false,
        action: "reject",
        reason: "Missing group name.",
      });
      normalizedPayloads.push({ ...normalized, leaderProfileId: null });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // Duplicate sourceId in file
    if (seenSourceIds.has(normalized.sourceId)) {
      counts.skip += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        name: normalized.name,
        category: normalized.category,
        leaderEmail: normalized.leaderEmail,
        leaderResolved: false,
        action: "skip",
        reason: "Duplicate source ID in import file.",
      });
      normalizedPayloads.push({ ...normalized, leaderProfileId: null });
      continue;
    }

    // Invalid leader email
    if (normalized.leaderEmail != null && !EMAIL_REGEX.test(normalized.leaderEmail)) {
      counts.reject += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        name: normalized.name,
        category: normalized.category,
        leaderEmail: normalized.leaderEmail,
        leaderResolved: false,
        action: "reject",
        reason: "Invalid leader email format.",
      });
      normalizedPayloads.push({ ...normalized, leaderProfileId: null });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // Invalid status — raw isActive may be a non-boolean string for invalid values
    const rawIsActive = normalized.isActive as unknown;
    if (
      typeof rawIsActive === "string" &&
      rawIsActive !== "active" &&
      rawIsActive !== "inactive"
    ) {
      counts.reject += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        name: normalized.name,
        category: normalized.category,
        leaderEmail: normalized.leaderEmail,
        leaderResolved: false,
        action: "reject",
        reason: "Invalid status value.",
      });
      normalizedPayloads.push({ ...normalized, leaderProfileId: null });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // Invalid category
    if (normalized.category != null && !ALLOWED_CATEGORIES.has(normalized.category)) {
      counts.reject += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        name: normalized.name,
        category: normalized.category,
        leaderEmail: normalized.leaderEmail,
        leaderResolved: false,
        action: "reject",
        reason: "Invalid category value.",
      });
      normalizedPayloads.push({ ...normalized, leaderProfileId: null });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // Determine action: create or update
    const existingGroupId = groupsIndex.get(normalized.sourceId);
    const action: "create" | "update" = existingGroupId ? "update" : "create";
    counts[action] += 1;

    // Resolve leader
    let leaderProfileId: string | null = null;
    let leaderResolved = false;
    let reason: string | null = null;

    if (normalized.leaderEmail != null) {
      const resolvedId = profilesIndex.get(normalized.leaderEmail.toLowerCase());
      if (resolvedId) {
        leaderProfileId = resolvedId;
        leaderResolved = true;
      } else {
        counts.unmatchedLeaders += 1;
        reason = "Leader email not matched — leader will be unset.";
      }
    }

    seenSourceIds.add(normalized.sourceId);

    rows.push({
      rowNumber,
      sourceId: normalized.sourceId,
      name: normalized.name,
      category: normalized.category,
      leaderEmail: normalized.leaderEmail,
      leaderResolved,
      action,
      reason,
    });
    normalizedPayloads.push({ ...normalized, leaderProfileId });
  }

  return { counts, rows, normalizedPayloads };
}

async function insertDryRunBatchAndRows(
  churchId: string,
  actorProfileId: string | null,
  sourceSystem: GroupsImportSourceSystem,
  sourceFilename: string,
  rows: GroupsImportDryRunRow[],
  normalizedPayloads: NormalizedGroupPayload[],
  rawCsvRows: Record<string, string>[],
  counts: GroupsImportDryRunResult["counts"],
): Promise<string> {
  if (shouldUseLocalTenantFallback()) {
    const batch = await queryTenantLocalDb<{ id: string }>(
      `insert into public.import_batches
         (church_id, import_type, source_system, source_filename, created_by_profile_id,
          status, dry_run, summary)
       values ($1, 'groups_csv', $2, $3, $4, 'dry_run_completed', true, $5::jsonb)
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
      import_type: "groups_csv",
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

export async function runGroupsImportDryRun(input: {
  churchId: string;
  actorProfileId: string | null;
  sourceSystem?: GroupsImportSourceSystem;
  sourceFilename: string;
  csvText: string;
}): Promise<GroupsImportDryRunResult> {
  const csv = await parseCsv(input.csvText);
  if (csv.errors.length > 0) {
    throw new Error(csv.errors[0] ?? "Unable to parse CSV file.");
  }

  if (csv.rows.length === 0) {
    throw new Error("CSV file has no data rows.");
  }

  const sourceSystem = input.sourceSystem ?? "generic_csv";

  const [groupsIndex, profilesIndex] = await Promise.all([
    loadExistingGroupsIndex(input.churchId),
    loadExistingProfilesIndex(input.churchId),
  ]);

  const { counts, rows, normalizedPayloads } = classifyGroupsImportRows(
    csv.rows,
    sourceSystem,
    groupsIndex,
    profilesIndex,
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

function normalizeBatchRowPayload(payload: unknown): NormalizedGroupPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const row = payload as Partial<NormalizedGroupPayload>;
  if (typeof row.sourceId !== "string") {
    return null;
  }

  return {
    sourceId: row.sourceId,
    name: typeof row.name === "string" ? row.name : "",
    category: typeof row.category === "string" ? row.category : null,
    description: typeof row.description === "string" ? row.description : null,
    leaderEmail: typeof row.leaderEmail === "string" ? row.leaderEmail : null,
    isActive: typeof row.isActive === "boolean" ? row.isActive : true,
    leaderProfileId: typeof row.leaderProfileId === "string" ? row.leaderProfileId : null,
  };
}

export async function commitGroupsImportBatch(input: {
  churchId: string;
  actorProfileId: string | null;
  batchId: string;
}): Promise<GroupsImportCommitResult> {
  let batchStatus: string | null = null;
  let dryRun = true;
  let normalizedPayloads: NormalizedGroupPayload[] = [];

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
      .filter((row): row is NormalizedGroupPayload => Boolean(row));
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
      .filter((row): row is NormalizedGroupPayload => Boolean(row));
  }

  if (batchStatus !== "dry_run_completed" || !dryRun) {
    throw new Error("Only dry-run-completed batches can be committed.");
  }

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const payload of normalizedPayloads) {
    try {
      if (shouldUseLocalTenantFallback()) {
        // Check if group with this source_id exists
        const existing = await queryTenantLocalDb<{ id: string }>(
          `select id from public.groups where church_id = $1 and source_id = $2 limit 1`,
          [input.churchId, payload.sourceId],
        );

        if (existing.rows[0]?.id) {
          await queryTenantLocalDb(
            `update public.groups
             set name = $1,
                 category = $2,
                 description = $3,
                 leader_profile_id = $4,
                 is_active = $5,
                 updated_at = now()
             where church_id = $6 and source_id = $7`,
            [
              payload.name,
              payload.category,
              payload.description,
              payload.leaderProfileId,
              typeof payload.isActive === "boolean" ? payload.isActive : true,
              input.churchId,
              payload.sourceId,
            ],
          );
          updated += 1;
        } else {
          await queryTenantLocalDb(
            `insert into public.groups
               (church_id, source_id, name, category, description, leader_profile_id, is_active, is_open)
             values ($1, $2, $3, $4, $5, $6, $7, true)`,
            [
              input.churchId,
              payload.sourceId,
              payload.name,
              payload.category,
              payload.description,
              payload.leaderProfileId,
              typeof payload.isActive === "boolean" ? payload.isActive : true,
            ],
          );
          created += 1;
        }
      } else {
        const supabase = await createTenantServerClient();

        // Check if group with this source_id exists
        const { data: existing } = await supabase
          .from("groups")
          .select("id")
          .eq("church_id", input.churchId)
          .eq("source_id", payload.sourceId)
          .maybeSingle();

        if (existing?.id) {
          const { error } = await supabase
            .from("groups")
            .update({
              name: payload.name,
              category: payload.category,
              description: payload.description,
              leader_profile_id: payload.leaderProfileId,
              is_active: typeof payload.isActive === "boolean" ? payload.isActive : true,
              updated_at: new Date().toISOString(),
            })
            .eq("church_id", input.churchId)
            .eq("source_id", payload.sourceId);

          if (error) {
            throw new Error(error.message);
          }
          updated += 1;
        } else {
          const { error } = await supabase.from("groups").insert({
            church_id: input.churchId,
            source_id: payload.sourceId,
            name: payload.name,
            category: payload.category,
            description: payload.description,
            leader_profile_id: payload.leaderProfileId,
            is_active: typeof payload.isActive === "boolean" ? payload.isActive : true,
            is_open: true,
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

  const status: GroupsImportCommitResult["status"] =
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
