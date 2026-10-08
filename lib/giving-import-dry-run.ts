import "server-only";

import {
  assertKnownReference,
  assertUpdated,
  auditImportCommit,
  DONATION_STORED_COLUMNS,
  failureReason,
  finishImportBatch,
  givingSnapshotMismatch,
  type DonationStored,
  runClaimedCommit,
  type ImportCommitInput,
  type OutcomeRecorder,
  type RowOutcome,
} from "@/lib/import-commit";
import { chunkArray, computeIgnoredColumns, omitColumns, parseImportCsv, parseImportDate } from "@/lib/import-normalize";
import {
  fetchAllPages,
  loadChurchIdSet,
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
  givingConsumedAliases,
  normalizeGivingImportSourceRow,
  parseAmountCents,
  type GivingImportSourceSystem,
  type NormalizedGivingImportRow,
} from "@/lib/giving-import-source-adapters";

export type GivingImportDryRunResult = {
  batchId: string;
  counts: {
    create: number;
    update: number;
    skip: number;
    reject: number;
    unmatchedDonors: number;
  };
  /** Header names (never cell values) that no field mapping used. */
  ignoredColumns: string[];
  /** Rows in the file; the result lists them all, but a UI may preview fewer ("showing 50 of N"). */
  totalRows: number;
  rows: GivingImportDryRunRow[];
};

export type GivingImportDryRunRow = {
  rowNumber: number;
  sourceId: string;
  donorEmail: string | null;
  amountDollars: string | null;
  fundDesignation: string | null;
  donatedAt: string | null;
  donorResolved: boolean;
  action: "create" | "update" | "skip" | "reject";
  reason: string | null;
};

export type GivingImportCommitResult = {
  batchId: string;
  status: "committed" | "failed";
  created: number;
  updated: number;
  failed: number;
  /** Why rows failed; fixed phrases, never headers or cell values. */
  failureReasons: string[];
};

export { parseAmountCents };

export function normalizeIsRecurring(raw: string | null): boolean {
  return ["yes", "1", "true"].includes((raw ?? "").toLowerCase().trim());
}

type NormalizedGivingPayload = NormalizedGivingImportRow & {
  profileId: string | null;
  amountCents: number | null;
  isAnonymous: boolean;
  isRecurring: boolean;
  /** The real instant of the gift (church time zone applied); created_at on insert. */
  donatedInstant: string | null;
};

async function loadDonationsIndex(churchId: string): Promise<Map<string, string>> {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string; source_id: string }>(
      `select id, source_id from public.donations where church_id = $1 and source_id is not null`,
      [churchId],
    );
    const map = new Map<string, string>();
    for (const row of result.rows) {
      map.set(row.source_id, row.id);
    }
    return map;
  }

  return loadSourceIdIndex(churchId, "donations");
}

export function classifyGivingImportRows(
  csvRows: Record<string, string>[],
  sourceSystem: GivingImportSourceSystem,
  donationsIndex: Map<string, string>,
  profileIndex: ProfileLinkIndex,
  timeZone: string | null = null,
): {
  counts: GivingImportDryRunResult["counts"];
  rows: GivingImportDryRunRow[];
  normalizedPayloads: NormalizedGivingPayload[];
} {
  const counts = {
    create: 0,
    update: 0,
    skip: 0,
    reject: 0,
    unmatchedDonors: 0,
  };
  const rows: GivingImportDryRunRow[] = [];
  const normalizedPayloads: NormalizedGivingPayload[] = [];
  const seenSourceIds = new Set<string>();
  const occurrences = new Map<string, number>();

  for (let index = 0; index < csvRows.length; index += 1) {
    const csvRow = csvRows[index];
    const rowNumber = index + 2;
    const normalized = normalizeGivingImportSourceRow(csvRow, sourceSystem, index, { timeZone });

    const emit = (
      action: GivingImportDryRunRow["action"],
      reason: string | null,
      extra: Partial<NormalizedGivingPayload> = {},
      donorResolved = false,
    ) => {
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        donorEmail: normalized.donorEmail,
        amountDollars: normalized.amountDollars,
        fundDesignation: normalized.fundDesignation,
        donatedAt: normalized.donatedAt,
        donorResolved,
        action,
        reason,
      });
      normalizedPayloads.push({
        ...normalized,
        profileId: null,
        amountCents: null,
        isAnonymous: true,
        isRecurring: false,
        donatedInstant: null,
        ...extra,
      });
    };

    // 1. Missing amount
    if (!normalized.amountDollars || !normalized.amountDollars.trim()) {
      counts.reject += 1;
      emit("reject", "Missing donation amount.");
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // 2. Invalid amount
    const amountCents = parseAmountCents(normalized.amountDollars);
    if (amountCents === null) {
      counts.reject += 1;
      emit("reject", "Invalid donation amount — must be a positive number.");
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // 3. Invalid date (non-null, not ISO 8601 or mm/dd/yyyy)
    let donatedInstant: string | null = null;
    if (normalized.donatedAt != null) {
      const parsedDate = parseImportDate(normalized.donatedAt, timeZone);
      if (!parsedDate.ok) {
        counts.reject += 1;
        emit("reject", "Invalid date — use YYYY-MM-DD or mm/dd/yyyy.");
        seenSourceIds.add(normalized.sourceId);
        continue;
      }
      donatedInstant = parsedDate.instant;
    }

    // Content-derived ids: the nth identical row in the file gets -n, so a
    // genuine repeat gift is not collapsed and a re-import maps row to row.
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

    // 5. A vendor row without an id that was imported before: never update it
    if (normalized.synthetic && donationsIndex.has(normalized.sourceId)) {
      counts.skip += 1;
      emit("skip", "Already imported.");
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // 6. Existing sourceId in donations index → update; else → create
    const action: "create" | "update" = donationsIndex.has(normalized.sourceId) ? "update" : "create";
    counts[action] += 1;

    // 7. Link the donor by vendor person id, then email; append the donor warning
    const profileId = normalized.anonymousDonor
      ? null
      : ((normalized.memberNumber
          ? profileIndex.byMemberNumber.get(normalized.memberNumber)
          : undefined) ??
        (normalized.donorEmail != null
          ? profileIndex.byEmail.get(normalized.donorEmail.trim().toLowerCase())
          : undefined) ??
        null);

    let donorResolved = false;
    let isAnonymous: boolean;
    const reasons: string[] = [];

    if (normalized.anonymousDonor) {
      isAnonymous = true;
    } else if (normalized.memberNumber != null || normalized.donorEmail != null) {
      if (profileId) {
        donorResolved = true;
        isAnonymous = false;
      } else {
        counts.unmatchedDonors += 1;
        reasons.push("Donor not matched — donation will be recorded as anonymous.");
        // On CREATE: force is_anonymous=true; on UPDATE: preserve existing (do NOT set here)
        isAnonymous = action === "create";
      }
    } else {
      // No donor reference at all — anonymous by absence, no warning
      isAnonymous = true;
    }

    const isRecurring = normalizeIsRecurring(normalized.isRecurringRaw);

    seenSourceIds.add(normalized.sourceId);

    emit(
      action,
      reasons.length > 0 ? reasons.join(" ") : null,
      { profileId, amountCents, isAnonymous, isRecurring, donatedInstant },
      donorResolved,
    );
  }

  return { counts, rows, normalizedPayloads };
}

async function insertDryRunBatchAndRows(
  churchId: string,
  actorProfileId: string | null,
  sourceSystem: GivingImportSourceSystem,
  sourceFilename: string,
  rows: GivingImportDryRunRow[],
  normalizedPayloads: NormalizedGivingPayload[],
  rawCsvRows: Record<string, string>[],
  counts: GivingImportDryRunResult["counts"],
  ignoredColumns: string[],
): Promise<string> {
  const summary = { ...counts, ignoredColumns };
  if (shouldUseLocalTenantFallback()) {
    const batch = await queryTenantLocalDb<{ id: string }>(
      `insert into public.import_batches
         (church_id, import_type, source_system, source_filename, created_by_profile_id,
          status, dry_run, summary)
       values ($1, 'giving_csv', $2, $3, $4, 'dry_run_completed', true, $5::jsonb)
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
      import_type: "giving_csv",
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

export async function runGivingImportDryRun(input: {
  churchId: string;
  actorProfileId: string | null;
  sourceSystem?: GivingImportSourceSystem;
  sourceFilename: string;
  csvText: string;
  /** The church's IANA time zone, applied to dates and times without an offset. */
  timeZone?: string | null;
}): Promise<GivingImportDryRunResult> {
  const csv = parseImportCsv(input.csvText);
  if (csv.errors.length > 0) {
    throw new Error(csv.errors[0] ?? "Unable to parse CSV file.");
  }

  if (csv.rows.length === 0) {
    throw new Error("CSV file has no data rows.");
  }

  const sourceSystem = input.sourceSystem ?? "generic_csv";

  const [donationsIndex, profileIndex] = await Promise.all([
    loadDonationsIndex(input.churchId),
    loadProfileLinkIndex(input.churchId),
  ]);

  const { counts, rows, normalizedPayloads } = classifyGivingImportRows(
    csv.rows,
    sourceSystem,
    donationsIndex,
    profileIndex,
    input.timeZone ?? null,
  );
  const ignoredColumns = computeIgnoredColumns(csv.headers, givingConsumedAliases(sourceSystem));

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

function normalizeBatchRowPayload(payload: unknown): NormalizedGivingPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const row = payload as Partial<NormalizedGivingPayload>;
  if (typeof row.sourceId !== "string") {
    return null;
  }

  return {
    sourceId: row.sourceId,
    donorEmail: typeof row.donorEmail === "string" ? row.donorEmail : null,
    memberNumber: typeof row.memberNumber === "string" ? row.memberNumber : null,
    anonymousDonor: row.anonymousDonor === true,
    synthetic: row.synthetic === true,
    amountDollars: typeof row.amountDollars === "string" ? row.amountDollars : null,
    fundDesignation: typeof row.fundDesignation === "string" ? row.fundDesignation : null,
    donatedAt: typeof row.donatedAt === "string" ? row.donatedAt : null,
    note: typeof row.note === "string" ? row.note : null,
    isRecurringRaw: typeof row.isRecurringRaw === "string" ? row.isRecurringRaw : null,
    profileId: typeof row.profileId === "string" ? row.profileId : null,
    amountCents: typeof row.amountCents === "number" ? row.amountCents : null,
    isAnonymous: typeof row.isAnonymous === "boolean" ? row.isAnonymous : true,
    isRecurring: typeof row.isRecurring === "boolean" ? row.isRecurring : false,
    donatedInstant: typeof row.donatedInstant === "string" ? row.donatedInstant : null,
  };
}

export async function commitGivingImportBatch(input: ImportCommitInput): Promise<GivingImportCommitResult> {
  return runClaimedCommit(input, (recorder) => commitGivingImportBatchClaimed(input, recorder));
}

type StagedGivingRow = { rowId: string | null; payload: NormalizedGivingPayload | null };

async function commitGivingImportBatchClaimed(
  input: ImportCommitInput,
  recorder: OutcomeRecorder,
): Promise<GivingImportCommitResult> {
  let batchStatus: string | null = null;
  let dryRun = true;
  let normalizedPayloads: StagedGivingRow[] = [];

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
      .map((row) => ({ rowId: null, payload: normalizeBatchRowPayload(row.normalized_payload) }))
      .filter((row) => Boolean(row.payload));
  } else {
    const supabase = await createTenantServerClient();

    const { data: batch, error: batchError } = await supabase
      .from("import_batches")
      .select("status, dry_run")
      .eq("id", input.batchId)
      .eq("church_id", input.churchId)
      .maybeSingle();

    if (batchError || !batch) {
      throw new Error("Import batch not found.");
    }

    batchStatus = batch.status;
    dryRun = batch.dry_run;

    const rows = await fetchAllPages<{ id: string; normalized_payload: unknown }>((from, to) =>
      supabase
        .from("import_batch_rows")
        .select("id, normalized_payload")
        .eq("batch_id", input.batchId)
        .eq("church_id", input.churchId)
        .in("classification", ["create", "update"])
        .order("row_number", { ascending: true })
        .range(from, to),
    );

    normalizedPayloads = (rows ?? []).map((row) => ({
      rowId: row.id,
      payload: normalizeBatchRowPayload(row.normalized_payload),
    }));
  }

  if (shouldUseLocalTenantFallback() && (batchStatus !== "dry_run_completed" || !dryRun)) {
    throw new Error("Only dry-run-completed batches can be committed.");
  }

  let created = 0;
  let updated = 0;
  let failed = 0;
  const failureReasons = new Set<string>();

  // Hoist Supabase client outside the commit loop
  const supabaseClient = shouldUseLocalTenantFallback() ? null : await createTenantServerClient();

  const profileIds = shouldUseLocalTenantFallback() ? null : await loadChurchIdSet(input.churchId, "profiles");

  for (const { rowId, payload } of normalizedPayloads) {
    if (!payload) {
      // A staged row whose payload cannot be read is a failure, never silently dropped.
      failed += 1;
      failureReasons.add(failureReason(null));
      await recorder.record(rowId, { outcome: "failed", reason: failureReason(null) });
      continue;
    }
    const source = {
      amount_cents: payload.amountCents,
      donated_at: payload.donatedInstant ?? payload.donatedAt ?? null,
      fund: payload.fundDesignation ?? null,
    };
    let pending: RowOutcome | null = null;
    try {
      assertKnownReference(payload.profileId, profileIds);
      if (shouldUseLocalTenantFallback()) {
        const existing = await queryTenantLocalDb<{ id: string }>(
          `select id from public.donations where church_id = $1 and source_id = $2 limit 1`,
          [input.churchId, payload.sourceId],
        );

        if (existing.rows[0]?.id) {
          // UPDATE: is_anonymous NOT updated (preserve existing value per Q5)
          await queryTenantLocalDb(
            `update public.donations
             set profile_id = coalesce($1, profile_id),
                 donor_email = coalesce($2, donor_email),
                 amount_cents = $3,
                 fund_designation = coalesce($4, fund_designation),
                 is_recurring = coalesce($5::boolean, is_recurring),
                 note = coalesce($6, note),
                 updated_at = now()
             where church_id = $7 and source_id = $8`,
            [
              payload.profileId,
              payload.donorEmail,
              payload.amountCents,
              payload.fundDesignation,
              payload.isRecurringRaw?.trim() ? payload.isRecurring : null,
              payload.note,
              input.churchId,
              payload.sourceId,
            ],
          );
          updated += 1;
        } else {
          // INSERT: currency='usd' hardcoded (single-currency MVP)
          // status='succeeded' — all imported giving is historical
          // stripe_payment_intent_id, stripe_subscription_id, stripe_customer_id, receipt_sent_at all NULL (not in column list)
          // created_at = parsed donatedAt if valid ISO 8601, else now()
          await queryTenantLocalDb(
            `insert into public.donations
               (church_id, source_id, profile_id, donor_email, amount_cents, currency,
                fund_designation, status, is_recurring, is_anonymous, note, created_at)
             values ($1, $2, $3, $4, $5, 'usd', $6, 'succeeded', $7, $8, $9,
                     coalesce($10::timestamptz, now()))`,
            [
              input.churchId,
              payload.sourceId,
              payload.profileId,
              payload.donorEmail,
              payload.amountCents,
              payload.fundDesignation,
              payload.isRecurring,
              payload.isAnonymous,
              payload.note,
              payload.donatedInstant ?? payload.donatedAt,
            ],
          );
          created += 1;
        }
      } else {
        const supabase = supabaseClient!;

        const { data: existing, error: lookupError } = await supabase
          .from("donations")
          .select("id")
          .eq("church_id", input.churchId)
          .eq("source_id", payload.sourceId)
          .maybeSingle();
        if (lookupError) {
          throw new Error(lookupError.message);
        }

        let storedRow: DonationStored | null = null;

        if (existing?.id) {
          // UPDATE: is_anonymous NOT updated (preserve existing value per Q5)
          const { data: updatedRows, error } = await supabase
            .from("donations")
            .update({
              // A blank cell never erases what the church already has.
              ...(payload.profileId ? { profile_id: payload.profileId } : {}),
              ...(payload.donorEmail ? { donor_email: payload.donorEmail } : {}),
              amount_cents: payload.amountCents,
              ...(payload.fundDesignation ? { fund_designation: payload.fundDesignation } : {}),
              // Never touches status (an update must not undo a refund or failure); the
              // recurring flag changes only when the file says something about it.
              ...(payload.isRecurringRaw?.trim() ? { is_recurring: payload.isRecurring } : {}),
              ...(payload.note ? { note: payload.note } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq("church_id", input.churchId)
            .eq("source_id", payload.sourceId)
            .select(DONATION_STORED_COLUMNS);

          if (error) {
            throw new Error(error.message);
          }
          assertUpdated(updatedRows);
          storedRow = (updatedRows as unknown as DonationStored[])[0];
          updated += 1;
        } else {
          // INSERT: currency='usd' hardcoded (single-currency MVP)
          // status='succeeded' — all imported giving is historical
          // stripe_payment_intent_id, stripe_subscription_id, stripe_customer_id, receipt_sent_at all NULL (not inserted)
          const { data: insertedRow, error } = await supabase.from("donations").insert({
            church_id: input.churchId,
            source_id: payload.sourceId,
            profile_id: payload.profileId,
            donor_email: payload.donorEmail,
            amount_cents: payload.amountCents,
            currency: "usd", // hardcoded — single-currency MVP
            fund_designation: payload.fundDesignation,
            status: "succeeded",
            is_recurring: payload.isRecurring,
            is_anonymous: payload.isAnonymous,
            note: payload.note,
            created_at: payload.donatedInstant ?? payload.donatedAt ?? new Date().toISOString(),
          }).select(DONATION_STORED_COLUMNS).single();

          if (error) {
            throw new Error(error.message);
          }
          storedRow = insertedRow as unknown as DonationStored;
          created += 1;
        }

        const snapshot = {
          source,
          stored: {
            amount_cents: storedRow.amount_cents,
            donated_at: storedRow.created_at,
            fund: storedRow.fund_designation,
          },
        };
        if (givingSnapshotMismatch(snapshot)) {
          recorder.noteValueMismatch();
        }
        pending = { outcome: "written", recordId: storedRow.id, snapshot };
      }
    } catch (error) {
      failed += 1;
      failureReasons.add(failureReason(error));
      pending = { outcome: "failed", reason: failureReason(error), snapshot: { source } };
    }
    if (pending) {
      await recorder.record(rowId, pending);
    }
  }

  const status: GivingImportCommitResult["status"] =
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
    await finishImportBatch(
      input,
      { status, created, updated, failed, failureReasons: [...failureReasons] },
      recorder,
      normalizedPayloads.length,
    );
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
