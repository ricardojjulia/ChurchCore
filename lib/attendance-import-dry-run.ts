import "server-only";

import { parseCsv } from "@/lib/finance-import";
import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import {
  normalizeAttendanceImportSourceRow,
  type AttendanceImportSourceSystem,
  type NormalizedAttendanceImportRow,
} from "@/lib/attendance-import-source-adapters";

export type AttendanceImportDryRunResult = {
  batchId: string;
  counts: {
    create: number;
    update: number;
    skip: number;
    reject: number;
    unmatchedProfiles: number;
    unmatchedEvents: number;
  };
  rows: AttendanceImportDryRunRow[];
};

export type AttendanceImportDryRunRow = {
  rowNumber: number;
  sourceId: string;
  profileEmail: string | null;
  eventSourceId: string | null;
  checkedInAt: string | null;
  profileResolved: boolean;
  eventResolved: boolean;
  action: "create" | "update" | "skip" | "reject";
  reason: string | null;
};

export type AttendanceImportCommitResult = {
  batchId: string;
  status: "committed" | "failed";
  created: number;
  updated: number;
  failed: number;
};

const ALLOWED_STATUSES = new Set(["present", "absent", "excused"]);

function isIso8601(s: string): boolean {
  return !isNaN(Date.parse(s)) && /^\d{4}-\d{2}-\d{2}/.test(s);
}

type NormalizedAttendancePayload = NormalizedAttendanceImportRow & {
  profileId: string | null;
  eventId: string | null;
};

async function loadAttendanceIndex(churchId: string): Promise<Map<string, string>> {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string; source_id: string }>(
      `select id, source_id from public.attendance where church_id = $1 and source_id is not null`,
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
    .from("attendance")
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

async function loadProfilesIndex(churchId: string): Promise<Map<string, string>> {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string; email: string }>(
      `select id, email from public.profiles where church_id = $1 and email is not null`,
      [churchId],
    );
    const map = new Map<string, string>();
    for (const row of result.rows) {
      map.set(row.email.trim().toLowerCase(), row.id);
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
      map.set((row.email as string).trim().toLowerCase(), row.id);
    }
  }
  return map;
}

async function loadEventsIndex(churchId: string): Promise<Map<string, string>> {
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

async function loadExistingPresentPairs(churchId: string): Promise<Set<string>> {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ profile_id: string; event_id: string }>(
      `select profile_id, event_id from public.attendance
       where church_id = $1
         and status = 'present'
         and profile_id is not null
         and event_id is not null`,
      [churchId],
    );
    const set = new Set<string>();
    for (const row of result.rows) {
      set.add(`${row.profile_id}:${row.event_id}`);
    }
    return set;
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("attendance")
    .select("profile_id, event_id")
    .eq("church_id", churchId)
    .eq("status", "present")
    .not("profile_id", "is", null)
    .not("event_id", "is", null);

  const set = new Set<string>();
  for (const row of data ?? []) {
    if (row.profile_id && row.event_id) {
      set.add(`${row.profile_id}:${row.event_id}`);
    }
  }
  return set;
}

function classifyAttendanceImportRows(
  csvRows: Record<string, string>[],
  sourceSystem: AttendanceImportSourceSystem,
  attendanceIndex: Map<string, string>,
  profilesIndex: Map<string, string>,
  eventsIndex: Map<string, string>,
  existingPresentPairs: Set<string>,
): {
  counts: AttendanceImportDryRunResult["counts"];
  rows: AttendanceImportDryRunRow[];
  normalizedPayloads: NormalizedAttendancePayload[];
} {
  const counts = {
    create: 0,
    update: 0,
    skip: 0,
    reject: 0,
    unmatchedProfiles: 0,
    unmatchedEvents: 0,
  };
  const rows: AttendanceImportDryRunRow[] = [];
  const normalizedPayloads: NormalizedAttendancePayload[] = [];
  const seenSourceIds = new Set<string>();
  const seenPresentPairs = new Set<string>();

  for (let index = 0; index < csvRows.length; index += 1) {
    const csvRow = csvRows[index];
    const rowNumber = index + 2;
    const normalized = normalizeAttendanceImportSourceRow(csvRow, sourceSystem, index);

    // 1. Invalid status (non-null, not in allowed set)
    if (normalized.status != null && !ALLOWED_STATUSES.has(normalized.status)) {
      counts.reject += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        profileEmail: normalized.profileEmail,
        eventSourceId: normalized.eventSourceId,
        checkedInAt: normalized.checkedInAt,
        profileResolved: false,
        eventResolved: false,
        action: "reject",
        reason: "Invalid status value.",
      });
      normalizedPayloads.push({ ...normalized, profileId: null, eventId: null });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // 2. Invalid checkedInAt (non-null, not ISO 8601)
    if (normalized.checkedInAt != null && !isIso8601(normalized.checkedInAt)) {
      counts.reject += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        profileEmail: normalized.profileEmail,
        eventSourceId: normalized.eventSourceId,
        checkedInAt: normalized.checkedInAt,
        profileResolved: false,
        eventResolved: false,
        action: "reject",
        reason: "Invalid checked_in_at — ISO 8601 required.",
      });
      normalizedPayloads.push({ ...normalized, profileId: null, eventId: null });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // 3. Duplicate sourceId in file
    if (seenSourceIds.has(normalized.sourceId)) {
      counts.skip += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        profileEmail: normalized.profileEmail,
        eventSourceId: normalized.eventSourceId,
        checkedInAt: normalized.checkedInAt,
        profileResolved: false,
        eventResolved: false,
        action: "skip",
        reason: "Duplicate source ID in import file.",
      });
      normalizedPayloads.push({ ...normalized, profileId: null, eventId: null });
      continue;
    }

    // Resolve profileId and eventId for duplicate-present checks
    const profileId = normalized.profileEmail != null
      ? (profilesIndex.get(normalized.profileEmail.trim().toLowerCase()) ?? null)
      : null;
    const eventId = normalized.eventSourceId != null
      ? (eventsIndex.get(normalized.eventSourceId) ?? null)
      : null;

    const effectiveStatus = normalized.status ?? "present";

    // 4. In-file present dup
    if (
      profileId != null &&
      eventId != null &&
      effectiveStatus === "present"
    ) {
      const pairKey = `${profileId}:${eventId}`;
      if (seenPresentPairs.has(pairKey)) {
        counts.skip += 1;
        rows.push({
          rowNumber,
          sourceId: normalized.sourceId,
          profileEmail: normalized.profileEmail,
          eventSourceId: normalized.eventSourceId,
          checkedInAt: normalized.checkedInAt,
          profileResolved: true,
          eventResolved: true,
          action: "skip",
          reason: "Duplicate present attendance for this profile and event in import file.",
        });
        normalizedPayloads.push({ ...normalized, profileId, eventId });
        seenSourceIds.add(normalized.sourceId);
        continue;
      }
    }

    // 5. DB present dup: sourceId NOT in attendance index AND both resolve AND 'present'
    if (
      !attendanceIndex.has(normalized.sourceId) &&
      profileId != null &&
      eventId != null &&
      effectiveStatus === "present"
    ) {
      const pairKey = `${profileId}:${eventId}`;
      if (existingPresentPairs.has(pairKey)) {
        counts.skip += 1;
        rows.push({
          rowNumber,
          sourceId: normalized.sourceId,
          profileEmail: normalized.profileEmail,
          eventSourceId: normalized.eventSourceId,
          checkedInAt: normalized.checkedInAt,
          profileResolved: true,
          eventResolved: true,
          action: "skip",
          reason: "Duplicate present attendance for this profile and event.",
        });
        normalizedPayloads.push({ ...normalized, profileId, eventId });
        seenSourceIds.add(normalized.sourceId);
        continue;
      }
    }

    // 6. sourceId in attendance index → update
    // 7. Otherwise → create
    const action: "create" | "update" = attendanceIndex.has(normalized.sourceId) ? "update" : "create";
    counts[action] += 1;

    // 8. Resolve profile and event, append warnings
    let resolvedProfileId = profileId;
    let resolvedEventId = eventId;
    let profileResolved = false;
    let eventResolved = false;
    const reasons: string[] = [];

    if (normalized.profileEmail != null) {
      if (resolvedProfileId) {
        profileResolved = true;
      } else {
        counts.unmatchedProfiles += 1;
        reasons.push("Profile not matched — profile_id will be unset.");
        resolvedProfileId = null;
      }
    }

    if (normalized.eventSourceId != null) {
      if (resolvedEventId) {
        eventResolved = true;
      } else {
        counts.unmatchedEvents += 1;
        reasons.push("Event not matched — event_id will be unset.");
        resolvedEventId = null;
      }
    }

    // Track in-file present pairs for dedup (step 4)
    if (resolvedProfileId != null && resolvedEventId != null && effectiveStatus === "present") {
      seenPresentPairs.add(`${resolvedProfileId}:${resolvedEventId}`);
    }

    seenSourceIds.add(normalized.sourceId);

    rows.push({
      rowNumber,
      sourceId: normalized.sourceId,
      profileEmail: normalized.profileEmail,
      eventSourceId: normalized.eventSourceId,
      checkedInAt: normalized.checkedInAt,
      profileResolved,
      eventResolved,
      action,
      reason: reasons.length > 0 ? reasons.join(" ") : null,
    });
    normalizedPayloads.push({ ...normalized, profileId: resolvedProfileId, eventId: resolvedEventId });
  }

  return { counts, rows, normalizedPayloads };
}

async function insertDryRunBatchAndRows(
  churchId: string,
  actorProfileId: string | null,
  sourceSystem: AttendanceImportSourceSystem,
  sourceFilename: string,
  rows: AttendanceImportDryRunRow[],
  normalizedPayloads: NormalizedAttendancePayload[],
  rawCsvRows: Record<string, string>[],
  counts: AttendanceImportDryRunResult["counts"],
): Promise<string> {
  if (shouldUseLocalTenantFallback()) {
    const batch = await queryTenantLocalDb<{ id: string }>(
      `insert into public.import_batches
         (church_id, import_type, source_system, source_filename, created_by_profile_id,
          status, dry_run, summary)
       values ($1, 'attendance_csv', $2, $3, $4, 'dry_run_completed', true, $5::jsonb)
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
      import_type: "attendance_csv",
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

export async function runAttendanceImportDryRun(input: {
  churchId: string;
  actorProfileId: string | null;
  sourceSystem?: AttendanceImportSourceSystem;
  sourceFilename: string;
  csvText: string;
}): Promise<AttendanceImportDryRunResult> {
  const csv = await parseCsv(input.csvText);
  if (csv.errors.length > 0) {
    throw new Error(csv.errors[0] ?? "Unable to parse CSV file.");
  }

  if (csv.rows.length === 0) {
    throw new Error("CSV file has no data rows.");
  }

  const sourceSystem = input.sourceSystem ?? "generic_csv";

  const [attendanceIndex, profilesIndex, eventsIndex] = await Promise.all([
    loadAttendanceIndex(input.churchId),
    loadProfilesIndex(input.churchId),
    loadEventsIndex(input.churchId),
  ]);

  const existingPresentPairs = await loadExistingPresentPairs(input.churchId);

  const { counts, rows, normalizedPayloads } = classifyAttendanceImportRows(
    csv.rows,
    sourceSystem,
    attendanceIndex,
    profilesIndex,
    eventsIndex,
    existingPresentPairs,
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

function normalizeBatchRowPayload(payload: unknown): NormalizedAttendancePayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const row = payload as Partial<NormalizedAttendancePayload>;
  if (typeof row.sourceId !== "string") {
    return null;
  }

  return {
    sourceId: row.sourceId,
    profileEmail: typeof row.profileEmail === "string" ? row.profileEmail : null,
    eventSourceId: typeof row.eventSourceId === "string" ? row.eventSourceId : null,
    checkedInAt: typeof row.checkedInAt === "string" ? row.checkedInAt : null,
    status: typeof row.status === "string" ? row.status : null,
    profileId: typeof row.profileId === "string" ? row.profileId : null,
    eventId: typeof row.eventId === "string" ? row.eventId : null,
  };
}

export async function commitAttendanceImportBatch(input: {
  churchId: string;
  actorProfileId: string | null;
  batchId: string;
}): Promise<AttendanceImportCommitResult> {
  let batchStatus: string | null = null;
  let dryRun = true;
  let normalizedPayloads: NormalizedAttendancePayload[] = [];

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
      .filter((row): row is NormalizedAttendancePayload => Boolean(row));
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
      .filter((row): row is NormalizedAttendancePayload => Boolean(row));
  }

  if (batchStatus !== "dry_run_completed" || !dryRun) {
    throw new Error("Only dry-run-completed batches can be committed.");
  }

  let created = 0;
  let updated = 0;
  let failed = 0;

  const supabaseClient = shouldUseLocalTenantFallback() ? null : await createTenantServerClient();

  for (const payload of normalizedPayloads) {
    try {
      const effectiveStatus = payload.status ?? "present";

      if (shouldUseLocalTenantFallback()) {
        const existing = await queryTenantLocalDb<{ id: string }>(
          `select id from public.attendance where church_id = $1 and source_id = $2 limit 1`,
          [input.churchId, payload.sourceId],
        );

        if (existing.rows[0]?.id) {
          await queryTenantLocalDb(
            `update public.attendance
             set profile_id = $1,
                 event_id = $2,
                 checked_in_at = coalesce($3::timestamptz, now()),
                 status = coalesce($4, 'present'),
                 check_in_method = 'import'
             where church_id = $5 and source_id = $6`,
            [
              payload.profileId,
              payload.eventId,
              payload.checkedInAt,
              effectiveStatus,
              input.churchId,
              payload.sourceId,
            ],
          );
          updated += 1;
        } else {
          await queryTenantLocalDb(
            `insert into public.attendance
               (church_id, source_id, profile_id, event_id, checked_in_at, status, check_in_method)
             values ($1, $2, $3, $4, coalesce($5::timestamptz, now()), coalesce($6, 'present'), 'import')`,
            [
              input.churchId,
              payload.sourceId,
              payload.profileId,
              payload.eventId,
              payload.checkedInAt,
              effectiveStatus,
            ],
          );
          created += 1;
        }
      } else {
        const supabase = supabaseClient!;

        const { data: existing } = await supabase
          .from("attendance")
          .select("id")
          .eq("church_id", input.churchId)
          .eq("source_id", payload.sourceId)
          .maybeSingle();

        if (existing?.id) {
          const { error } = await supabase
            .from("attendance")
            .update({
              profile_id: payload.profileId,
              event_id: payload.eventId,
              checked_in_at: payload.checkedInAt ?? new Date().toISOString(),
              status: effectiveStatus,
              check_in_method: "import",
            })
            .eq("church_id", input.churchId)
            .eq("source_id", payload.sourceId);

          if (error) {
            throw new Error(error.message);
          }
          updated += 1;
        } else {
          const { error } = await supabase.from("attendance").insert({
            church_id: input.churchId,
            source_id: payload.sourceId,
            profile_id: payload.profileId,
            event_id: payload.eventId,
            checked_in_at: payload.checkedInAt ?? new Date().toISOString(),
            status: effectiveStatus,
            check_in_method: "import",
          });

          if (error) {
            throw new Error(error.message);
          }
          created += 1;
        }
      }
    } catch (e) {
      console.error("[attendance-import] commit row failed:", e);
      failed += 1;
    }
  }

  const status: AttendanceImportCommitResult["status"] =
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
