import "server-only";

import { parseCsv } from "@/lib/finance-import";
import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import {
  normalizeGivingImportSourceRow,
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
};

function isIso8601(s: string): boolean {
  return !isNaN(Date.parse(s)) && /^\d{4}-\d{2}-\d{2}/.test(s);
}

export function parseAmountCents(raw: string | null): number | null {
  if (!raw || !raw.trim()) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  const dollars = parseFloat(cleaned);
  if (isNaN(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 100);
}

export function normalizeIsRecurring(raw: string | null): boolean {
  return ["yes", "1", "true"].includes((raw ?? "").toLowerCase().trim());
}

type NormalizedGivingPayload = NormalizedGivingImportRow & {
  profileId: string | null;
  amountCents: number | null;
  isAnonymous: boolean;
  isRecurring: boolean;
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

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("donations")
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

function classifyGivingImportRows(
  csvRows: Record<string, string>[],
  sourceSystem: GivingImportSourceSystem,
  donationsIndex: Map<string, string>,
  profilesIndex: Map<string, string>,
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

  for (let index = 0; index < csvRows.length; index += 1) {
    const csvRow = csvRows[index];
    const rowNumber = index + 2;
    const normalized = normalizeGivingImportSourceRow(csvRow, sourceSystem, index);

    // 1. Missing amount
    if (!normalized.amountDollars || !normalized.amountDollars.trim()) {
      counts.reject += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        donorEmail: normalized.donorEmail,
        amountDollars: normalized.amountDollars,
        fundDesignation: normalized.fundDesignation,
        donatedAt: normalized.donatedAt,
        donorResolved: false,
        action: "reject",
        reason: "Missing donation amount.",
      });
      normalizedPayloads.push({
        ...normalized,
        profileId: null,
        amountCents: null,
        isAnonymous: true,
        isRecurring: false,
      });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // 2. Invalid amount
    const amountCents = parseAmountCents(normalized.amountDollars);
    if (amountCents === null) {
      counts.reject += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        donorEmail: normalized.donorEmail,
        amountDollars: normalized.amountDollars,
        fundDesignation: normalized.fundDesignation,
        donatedAt: normalized.donatedAt,
        donorResolved: false,
        action: "reject",
        reason: "Invalid donation amount — must be a positive number.",
      });
      normalizedPayloads.push({
        ...normalized,
        profileId: null,
        amountCents: null,
        isAnonymous: true,
        isRecurring: false,
      });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // 3. Invalid donatedAt (non-null, not ISO 8601)
    if (normalized.donatedAt != null && !isIso8601(normalized.donatedAt)) {
      counts.reject += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        donorEmail: normalized.donorEmail,
        amountDollars: normalized.amountDollars,
        fundDesignation: normalized.fundDesignation,
        donatedAt: normalized.donatedAt,
        donorResolved: false,
        action: "reject",
        reason: "Invalid donated_at — ISO 8601 required.",
      });
      normalizedPayloads.push({
        ...normalized,
        profileId: null,
        amountCents: null,
        isAnonymous: true,
        isRecurring: false,
      });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // 4. Duplicate sourceId in file
    if (seenSourceIds.has(normalized.sourceId)) {
      counts.skip += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        donorEmail: normalized.donorEmail,
        amountDollars: normalized.amountDollars,
        fundDesignation: normalized.fundDesignation,
        donatedAt: normalized.donatedAt,
        donorResolved: false,
        action: "skip",
        reason: "Duplicate source ID in import file.",
      });
      normalizedPayloads.push({
        ...normalized,
        profileId: null,
        amountCents: null,
        isAnonymous: true,
        isRecurring: false,
      });
      continue;
    }

    // 5. Existing sourceId in donations index → update; else → create
    const action: "create" | "update" = donationsIndex.has(normalized.sourceId) ? "update" : "create";
    counts[action] += 1;

    // 6. Resolve profile and append donor warning
    const profileId = normalized.donorEmail != null
      ? (profilesIndex.get(normalized.donorEmail.trim().toLowerCase()) ?? null)
      : null;

    let donorResolved = false;
    let isAnonymous: boolean;
    const reasons: string[] = [];

    if (normalized.donorEmail != null) {
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
      // No email provided — anonymous by absence, no warning
      isAnonymous = true;
    }

    const isRecurring = normalizeIsRecurring(normalized.isRecurringRaw);

    seenSourceIds.add(normalized.sourceId);

    rows.push({
      rowNumber,
      sourceId: normalized.sourceId,
      donorEmail: normalized.donorEmail,
      amountDollars: normalized.amountDollars,
      fundDesignation: normalized.fundDesignation,
      donatedAt: normalized.donatedAt,
      donorResolved,
      action,
      reason: reasons.length > 0 ? reasons.join(" ") : null,
    });
    normalizedPayloads.push({
      ...normalized,
      profileId,
      amountCents,
      isAnonymous,
      isRecurring,
    });
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
): Promise<string> {
  if (shouldUseLocalTenantFallback()) {
    const batch = await queryTenantLocalDb<{ id: string }>(
      `insert into public.import_batches
         (church_id, import_type, source_system, source_filename, created_by_profile_id,
          status, dry_run, summary)
       values ($1, 'giving_csv', $2, $3, $4, 'dry_run_completed', true, $5::jsonb)
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
      import_type: "giving_csv",
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

export async function runGivingImportDryRun(input: {
  churchId: string;
  actorProfileId: string | null;
  sourceSystem?: GivingImportSourceSystem;
  sourceFilename: string;
  csvText: string;
}): Promise<GivingImportDryRunResult> {
  const csv = await parseCsv(input.csvText);
  if (csv.errors.length > 0) {
    throw new Error(csv.errors[0] ?? "Unable to parse CSV file.");
  }

  if (csv.rows.length === 0) {
    throw new Error("CSV file has no data rows.");
  }

  const sourceSystem = input.sourceSystem ?? "generic_csv";

  const [donationsIndex, profilesIndex] = await Promise.all([
    loadDonationsIndex(input.churchId),
    loadProfilesIndex(input.churchId),
  ]);

  const { counts, rows, normalizedPayloads } = classifyGivingImportRows(
    csv.rows,
    sourceSystem,
    donationsIndex,
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
    amountDollars: typeof row.amountDollars === "string" ? row.amountDollars : null,
    fundDesignation: typeof row.fundDesignation === "string" ? row.fundDesignation : null,
    donatedAt: typeof row.donatedAt === "string" ? row.donatedAt : null,
    note: typeof row.note === "string" ? row.note : null,
    isRecurringRaw: typeof row.isRecurringRaw === "string" ? row.isRecurringRaw : null,
    profileId: typeof row.profileId === "string" ? row.profileId : null,
    amountCents: typeof row.amountCents === "number" ? row.amountCents : null,
    isAnonymous: typeof row.isAnonymous === "boolean" ? row.isAnonymous : true,
    isRecurring: typeof row.isRecurring === "boolean" ? row.isRecurring : false,
  };
}

export async function commitGivingImportBatch(input: {
  churchId: string;
  actorProfileId: string | null;
  batchId: string;
}): Promise<GivingImportCommitResult> {
  let batchStatus: string | null = null;
  let dryRun = true;
  let normalizedPayloads: NormalizedGivingPayload[] = [];

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
      .filter((row): row is NormalizedGivingPayload => Boolean(row));
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
      .filter((row): row is NormalizedGivingPayload => Boolean(row));
  }

  if (batchStatus !== "dry_run_completed" || !dryRun) {
    throw new Error("Only dry-run-completed batches can be committed.");
  }

  let created = 0;
  let updated = 0;
  let failed = 0;

  // Hoist Supabase client outside the commit loop
  const supabaseClient = shouldUseLocalTenantFallback() ? null : await createTenantServerClient();

  for (const payload of normalizedPayloads) {
    try {
      if (shouldUseLocalTenantFallback()) {
        const existing = await queryTenantLocalDb<{ id: string }>(
          `select id from public.donations where church_id = $1 and source_id = $2 limit 1`,
          [input.churchId, payload.sourceId],
        );

        if (existing.rows[0]?.id) {
          // UPDATE: is_anonymous NOT updated (preserve existing value per Q5)
          await queryTenantLocalDb(
            `update public.donations
             set profile_id = $1,
                 donor_email = $2,
                 amount_cents = $3,
                 fund_designation = $4,
                 status = 'succeeded',
                 is_recurring = $5,
                 note = $6,
                 updated_at = now()
             where church_id = $7 and source_id = $8`,
            [
              payload.profileId,
              payload.donorEmail,
              payload.amountCents,
              payload.fundDesignation,
              payload.isRecurring,
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
              payload.donatedAt,
            ],
          );
          created += 1;
        }
      } else {
        const supabase = supabaseClient!;

        const { data: existing } = await supabase
          .from("donations")
          .select("id")
          .eq("church_id", input.churchId)
          .eq("source_id", payload.sourceId)
          .maybeSingle();

        if (existing?.id) {
          // UPDATE: is_anonymous NOT updated (preserve existing value per Q5)
          const { error } = await supabase
            .from("donations")
            .update({
              profile_id: payload.profileId,
              donor_email: payload.donorEmail,
              amount_cents: payload.amountCents,
              fund_designation: payload.fundDesignation,
              status: "succeeded",
              is_recurring: payload.isRecurring,
              note: payload.note,
              updated_at: new Date().toISOString(),
            })
            .eq("church_id", input.churchId)
            .eq("source_id", payload.sourceId);

          if (error) {
            throw new Error(error.message);
          }
          updated += 1;
        } else {
          // INSERT: currency='usd' hardcoded (single-currency MVP)
          // status='succeeded' — all imported giving is historical
          // stripe_payment_intent_id, stripe_subscription_id, stripe_customer_id, receipt_sent_at all NULL (not inserted)
          const { error } = await supabase.from("donations").insert({
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
            created_at: payload.donatedAt ?? new Date().toISOString(),
          });

          if (error) {
            throw new Error(error.message);
          }
          created += 1;
        }
      }
    } catch (e) {
      console.error("[giving-import] commit row failed:", e instanceof Error ? e.message : "unknown error");
      failed += 1;
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
