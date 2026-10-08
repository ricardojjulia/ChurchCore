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
import {
  eventTitleDayKey,
  fetchAllPages,
  loadChurchIdSet,
  loadEventTitleDayIndex,
  loadPresentPairs,
  loadProfileLinkIndex,
  loadSourceIdIndex,
  type ProfileLinkIndex,
} from "@/lib/import-profile-index";
import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import {
  attendanceConsumedAliases,
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
    skippedAnonymous: number;
  };
  /** Header names (never cell values) that no field mapping used. */
  ignoredColumns: string[];
  /** Rows in the file; the result lists them all, but a UI may preview fewer ("showing 50 of N"). */
  totalRows: number;
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
  /** Why rows failed; fixed phrases, never headers or cell values. */
  failureReasons: string[];
};

const ALLOWED_STATUSES = new Set(["present", "absent", "excused"]);

type NormalizedAttendancePayload = NormalizedAttendanceImportRow & {
  profileId: string | null;
  eventId: string | null;
  /** The real instant of the check-in (church time zone applied). */
  checkedInInstant: string | null;
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

  return loadSourceIdIndex(churchId, "attendance");
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

  return loadSourceIdIndex(churchId, "events");
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

  return loadPresentPairs(churchId);
}

export function classifyAttendanceImportRows(
  csvRows: Record<string, string>[],
  sourceSystem: AttendanceImportSourceSystem,
  attendanceIndex: Map<string, string>,
  profileIndex: ProfileLinkIndex,
  eventsIndex: Map<string, string>,
  existingPresentPairs: Set<string>,
  eventTitleDayIndex: Map<string, string[]> = new Map(),
  timeZone: string | null = null,
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
    skippedAnonymous: 0,
  };
  const rows: AttendanceImportDryRunRow[] = [];
  const normalizedPayloads: NormalizedAttendancePayload[] = [];
  const seenSourceIds = new Set<string>();
  const seenPresentPairs = new Set<string>();
  const occurrences = new Map<string, number>();

  for (let index = 0; index < csvRows.length; index += 1) {
    const csvRow = csvRows[index];
    const rowNumber = index + 2;
    const normalized = normalizeAttendanceImportSourceRow(csvRow, sourceSystem, index, { timeZone });

    const emit = (
      action: AttendanceImportDryRunRow["action"],
      reason: string | null,
      extra: Partial<NormalizedAttendancePayload> = {},
      resolved: { profile: boolean; event: boolean } = { profile: false, event: false },
    ) => {
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        profileEmail: normalized.profileEmail,
        eventSourceId: normalized.eventSourceId,
        checkedInAt: normalized.checkedInAt,
        profileResolved: resolved.profile,
        eventResolved: resolved.event,
        action,
        reason,
      });
      normalizedPayloads.push({
        ...normalized,
        profileId: null,
        eventId: null,
        checkedInInstant: null,
        ...extra,
      });
    };

    // 1. Invalid status (non-null, not in allowed set)
    if (normalized.status != null && !ALLOWED_STATUSES.has(normalized.status)) {
      counts.reject += 1;
      emit("reject", "Invalid status value.");
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // 2. Invalid date (non-null, not ISO 8601 or mm/dd/yyyy)
    const parsedDate =
      normalized.checkedInAt != null ? parseImportDate(normalized.checkedInAt, timeZone) : null;
    if (parsedDate && !parsedDate.ok) {
      counts.reject += 1;
      emit("reject", "Invalid date — use YYYY-MM-DD or mm/dd/yyyy.");
      seenSourceIds.add(normalized.sourceId);
      continue;
    }
    const checkedInInstant = parsedDate?.ok ? parsedDate.instant : null;

    // 3. Anonymous head-count lines have no person to attach
    if (normalized.anonymousPerson) {
      counts.skip += 1;
      counts.skippedAnonymous += 1;
      emit("skip", "Anonymous head-counts are not supported.");
      continue;
    }

    if (normalized.synthetic) {
      const occurrence = (occurrences.get(normalized.sourceId) ?? 0) + 1;
      occurrences.set(normalized.sourceId, occurrence);
      normalized.sourceId = `${normalized.sourceId}-${occurrence}`;
    }

    // 4. Duplicate sourceId in file
    if (seenSourceIds.has(normalized.sourceId)) {
      counts.skip += 1;
      emit("skip", "Duplicate source ID in import file.");
      continue;
    }

    // Resolve profileId and eventId
    const profileId =
      (normalized.memberNumber
        ? profileIndex.byMemberNumber.get(normalized.memberNumber)
        : undefined) ??
      (normalized.profileEmail != null
        ? profileIndex.byEmail.get(normalized.profileEmail.trim().toLowerCase())
        : undefined) ??
      null;

    // 5. attendance.profile_id is NOT NULL: a row with no matching person
    // could never be written, so it is skipped here instead of failing at commit.
    if (!profileId) {
      counts.skip += 1;
      if (normalized.memberNumber != null || normalized.profileEmail != null) {
        counts.unmatchedProfiles += 1;
        emit("skip", "Person not matched — attendance needs an existing person.", { checkedInInstant });
      } else {
        emit("skip", "Missing person reference (Breeze ID or email).", { checkedInInstant });
      }
      continue;
    }

    // Events: by exported event name and church-local day when the export has
    // names (Breeze), otherwise by the event's source id.
    let eventId: string | null = null;
    let eventUnmatchedReason: string | null = null;
    const matchesByName = normalized.eventName != null;
    if (matchesByName) {
      const day = parsedDate?.ok ? parsedDate.day : null;
      const candidates = day
        ? (eventTitleDayIndex.get(eventTitleDayKey(normalized.eventName as string, day)) ?? [])
        : [];
      if (candidates.length === 1) {
        eventId = candidates[0];
      } else {
        eventUnmatchedReason =
          candidates.length > 1
            ? "Event not matched — more than one event has that name on that date."
            : "Event not matched — no event with that name on that date.";
      }
    } else if (normalized.eventSourceId != null) {
      eventId = eventsIndex.get(normalized.eventSourceId) ?? null;
      if (!eventId) eventUnmatchedReason = "Event not matched — event_id will be unset.";
    }

    // Events are never created from attendance: a named event that is not
    // there yet means the events file has to be imported first.
    if (matchesByName && !eventId) {
      counts.skip += 1;
      counts.unmatchedEvents += 1;
      emit("skip", eventUnmatchedReason, { profileId, checkedInInstant }, { profile: true, event: false });
      continue;
    }

    const effectiveStatus = normalized.status ?? "present";

    // 6. In-file present dup
    if (eventId != null && effectiveStatus === "present") {
      const pairKey = `${profileId}:${eventId}`;
      if (seenPresentPairs.has(pairKey)) {
        counts.skip += 1;
        emit(
          "skip",
          "Duplicate present attendance for this profile and event in import file.",
          { profileId, eventId, checkedInInstant },
          { profile: true, event: true },
        );
        seenSourceIds.add(normalized.sourceId);
        continue;
      }
    }

    // 7. DB present dup: sourceId NOT in attendance index AND both resolve AND 'present'
    if (
      !attendanceIndex.has(normalized.sourceId) &&
      eventId != null &&
      effectiveStatus === "present"
    ) {
      const pairKey = `${profileId}:${eventId}`;
      if (existingPresentPairs.has(pairKey)) {
        counts.skip += 1;
        emit(
          "skip",
          "Duplicate present attendance for this profile and event.",
          { profileId, eventId, checkedInInstant },
          { profile: true, event: true },
        );
        seenSourceIds.add(normalized.sourceId);
        continue;
      }
    }

    // 8. sourceId in attendance index → update; otherwise → create
    const action: "create" | "update" = attendanceIndex.has(normalized.sourceId) ? "update" : "create";
    counts[action] += 1;

    const reasons: string[] = [];
    if (!eventId && eventUnmatchedReason) {
      counts.unmatchedEvents += 1;
      reasons.push(eventUnmatchedReason);
    }

    // Track in-file present pairs for dedup
    if (eventId != null && effectiveStatus === "present") {
      seenPresentPairs.add(`${profileId}:${eventId}`);
    }

    seenSourceIds.add(normalized.sourceId);

    emit(
      action,
      reasons.length > 0 ? reasons.join(" ") : null,
      { profileId, eventId, checkedInInstant },
      { profile: true, event: eventId != null },
    );
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
  ignoredColumns: string[],
): Promise<string> {
  const summary = { ...counts, ignoredColumns };
  if (shouldUseLocalTenantFallback()) {
    const batch = await queryTenantLocalDb<{ id: string }>(
      `insert into public.import_batches
         (church_id, import_type, source_system, source_filename, created_by_profile_id,
          status, dry_run, summary)
       values ($1, 'attendance_csv', $2, $3, $4, 'dry_run_completed', true, $5::jsonb)
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
      import_type: "attendance_csv",
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

export async function runAttendanceImportDryRun(input: {
  churchId: string;
  actorProfileId: string | null;
  sourceSystem?: AttendanceImportSourceSystem;
  sourceFilename: string;
  csvText: string;
  /** The church's IANA time zone, applied to dates and times without an offset. */
  timeZone?: string | null;
}): Promise<AttendanceImportDryRunResult> {
  const csv = parseImportCsv(input.csvText);
  if (csv.errors.length > 0) {
    throw new Error(csv.errors[0] ?? "Unable to parse CSV file.");
  }

  if (csv.rows.length === 0) {
    throw new Error("CSV file has no data rows.");
  }

  const sourceSystem = input.sourceSystem ?? "generic_csv";

  const timeZone = input.timeZone ?? null;
  const [attendanceIndex, profileIndex, eventsIndex, existingPresentPairs] = await Promise.all([
    loadAttendanceIndex(input.churchId),
    loadProfileLinkIndex(input.churchId),
    loadEventsIndex(input.churchId),
    loadExistingPresentPairs(input.churchId),
  ]);
  // Only exports that name their events need the title-and-day index.
  const eventTitleDayIndex =
    sourceSystem === "breeze"
      ? await loadEventTitleDayIndex(input.churchId, timeZone)
      : new Map<string, string[]>();

  const { counts, rows, normalizedPayloads } = classifyAttendanceImportRows(
    csv.rows,
    sourceSystem,
    attendanceIndex,
    profileIndex,
    eventsIndex,
    existingPresentPairs,
    eventTitleDayIndex,
    timeZone,
  );
  const ignoredColumns = computeIgnoredColumns(csv.headers, attendanceConsumedAliases(sourceSystem));

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
    memberNumber: typeof row.memberNumber === "string" ? row.memberNumber : null,
    anonymousPerson: row.anonymousPerson === true,
    eventName: typeof row.eventName === "string" ? row.eventName : null,
    synthetic: row.synthetic === true,
    eventSourceId: typeof row.eventSourceId === "string" ? row.eventSourceId : null,
    checkedInAt: typeof row.checkedInAt === "string" ? row.checkedInAt : null,
    status: typeof row.status === "string" ? row.status : null,
    profileId: typeof row.profileId === "string" ? row.profileId : null,
    eventId: typeof row.eventId === "string" ? row.eventId : null,
    checkedInInstant: typeof row.checkedInInstant === "string" ? row.checkedInInstant : null,
  };
}

export async function commitAttendanceImportBatch(input: ImportCommitInput): Promise<AttendanceImportCommitResult> {
  return runClaimedCommit(input, () => commitAttendanceImportBatchClaimed(input));
}

async function commitAttendanceImportBatchClaimed(input: ImportCommitInput): Promise<AttendanceImportCommitResult> {
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
      .filter((row): row is NormalizedAttendancePayload => Boolean(row));
  }

  if (shouldUseLocalTenantFallback() && (batchStatus !== "dry_run_completed" || !dryRun)) {
    throw new Error("Only dry-run-completed batches can be committed.");
  }

  let created = 0;
  let updated = 0;
  let failed = 0;
  const failureReasons = new Set<string>();

  const supabaseClient = shouldUseLocalTenantFallback() ? null : await createTenantServerClient();

  const profileIds = shouldUseLocalTenantFallback() ? null : await loadChurchIdSet(input.churchId, "profiles");
  const eventIds = shouldUseLocalTenantFallback() ? null : await loadChurchIdSet(input.churchId, "events");

  for (const payload of normalizedPayloads) {
    try {
      assertKnownReference(payload.profileId, profileIds);
      assertKnownReference(payload.eventId, eventIds);
      const effectiveStatus = payload.status ?? "present";

      if (shouldUseLocalTenantFallback()) {
        const existing = await queryTenantLocalDb<{ id: string }>(
          `select id from public.attendance where church_id = $1 and source_id = $2 limit 1`,
          [input.churchId, payload.sourceId],
        );

        if (existing.rows[0]?.id) {
          await queryTenantLocalDb(
            `update public.attendance
             set profile_id = coalesce($1, profile_id),
                 event_id = coalesce($2, event_id),
                 checked_in_at = coalesce($3::timestamptz, now()),
                 status = coalesce($4, 'present'),
                 check_in_method = 'import'
             where church_id = $5 and source_id = $6`,
            [
              payload.profileId,
              payload.eventId,
              payload.checkedInInstant ?? payload.checkedInAt,
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
              payload.checkedInInstant ?? payload.checkedInAt,
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
          const { data: updatedRows, error } = await supabase
            .from("attendance")
            .update({
              // A blank cell never erases what the church already has.
              ...(payload.profileId ? { profile_id: payload.profileId } : {}),
              ...(payload.eventId ? { event_id: payload.eventId } : {}),
              checked_in_at: payload.checkedInInstant ?? payload.checkedInAt ?? new Date().toISOString(),
              status: effectiveStatus,
              check_in_method: "import",
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
          const { error } = await supabase.from("attendance").insert({
            church_id: input.churchId,
            source_id: payload.sourceId,
            profile_id: payload.profileId,
            event_id: payload.eventId,
            checked_in_at: payload.checkedInInstant ?? payload.checkedInAt ?? new Date().toISOString(),
            status: effectiveStatus,
            check_in_method: "import",
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

  const status: AttendanceImportCommitResult["status"] =
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
