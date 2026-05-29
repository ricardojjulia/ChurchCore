import "server-only";

import { parseCsv } from "@/lib/finance-import";
import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import {
  normalizePeopleImportSourceRow,
  type ImportSourceSystem,
} from "@/lib/people-import-source-adapters";

export type PeopleImportDryRunCounts = {
  create: number;
  update: number;
  skip: number;
  reject: number;
};

export type PeopleImportDryRunRow = {
  rowNumber: number;
  householdName: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  memberNumber: string | null;
  action: keyof PeopleImportDryRunCounts;
  reason: string | null;
};

export type PeopleImportDryRunResult = {
  batchId: string;
  counts: PeopleImportDryRunCounts;
  householdCreates: number;
  rows: PeopleImportDryRunRow[];
};

export type PeopleImportCommitResult = {
  batchId: string;
  status: "committed" | "failed";
  created: number;
  updated: number;
  failed: number;
};

type ExistingPeopleIndex = {
  byMemberNumber: Map<string, string>;
  byEmail: Map<string, string>;
  byNamePhone: Map<string, string>;
  familyNames: Set<string>;
};

type ParsedImportRow = {
  rowNumber: number;
  householdName: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  memberNumber: string | null;
};

function normalize(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(value: string | null | undefined) {
  const raw = normalize(value);
  return raw ? raw.toLowerCase() : null;
}

function normalizePhone(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function normalizeName(value: string | null | undefined) {
  const raw = normalize(value);
  return raw ? raw.replace(/\s+/g, " ") : null;
}

function normalizeFamilyName(value: string | null | undefined) {
  const raw = normalize(value);
  return raw ? raw.replace(/\s+/g, " ") : null;
}

function isValidEmail(value: string | null) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseImportRows(
  csvRows: Record<string, string>[],
  sourceSystem: ImportSourceSystem,
) {
  const rows: ParsedImportRow[] = [];

  for (let index = 0; index < csvRows.length; index += 1) {
    const row = csvRows[index];
    const normalizedRow = normalizePeopleImportSourceRow(row, sourceSystem);
    const fullName = normalizeName(normalizedRow.fullName);
    if (!fullName) {
      rows.push({
        rowNumber: index + 2,
        householdName: null,
        fullName: "",
        email: normalizeEmail(normalizedRow.email),
        phone: normalizePhone(normalizedRow.phone),
        memberNumber: normalize(normalizedRow.memberNumber),
      });
      continue;
    }

    rows.push({
      rowNumber: index + 2,
      householdName: normalizeFamilyName(normalizedRow.householdName),
      fullName,
      email: normalizeEmail(normalizedRow.email),
      phone: normalizePhone(normalizedRow.phone),
      memberNumber: normalize(normalizedRow.memberNumber),
    });
  }

  return rows;
}

export function classifyPeopleImportRows(
  parsedRows: ParsedImportRow[],
  existing: ExistingPeopleIndex,
): { counts: PeopleImportDryRunCounts; rows: PeopleImportDryRunRow[]; householdCreates: number } {
  const counts: PeopleImportDryRunCounts = {
    create: 0,
    update: 0,
    skip: 0,
    reject: 0,
  };

  const seenImportKeys = new Set<string>();
  const plannedFamilyNames = new Set<string>();
  const results: PeopleImportDryRunRow[] = [];

  for (const row of parsedRows) {
    if (!row.fullName) {
      counts.reject += 1;
      results.push({
        ...row,
        action: "reject",
        reason: "Missing full_name.",
      });
      continue;
    }

    if (!isValidEmail(row.email)) {
      counts.reject += 1;
      results.push({
        ...row,
        action: "reject",
        reason: "Invalid email format.",
      });
      continue;
    }

    const key =
      row.memberNumber
        ? `member:${row.memberNumber}`
        : row.email
          ? `email:${row.email}`
          : `namephone:${row.fullName.toLowerCase()}|${row.phone ?? ""}`;

    if (seenImportKeys.has(key)) {
      counts.skip += 1;
      results.push({
        ...row,
        action: "skip",
        reason: "Duplicate row in import file.",
      });
      continue;
    }
    seenImportKeys.add(key);

    const namePhoneKey = `${row.fullName.toLowerCase()}|${row.phone ?? ""}`;
    const existingProfileId =
      (row.memberNumber ? existing.byMemberNumber.get(row.memberNumber) : undefined) ??
      (row.email ? existing.byEmail.get(row.email) : undefined) ??
      existing.byNamePhone.get(namePhoneKey);

    const action: keyof PeopleImportDryRunCounts = existingProfileId ? "update" : "create";
    counts[action] += 1;

    if (row.householdName && !existing.familyNames.has(row.householdName.toLowerCase())) {
      plannedFamilyNames.add(row.householdName.toLowerCase());
    }

    results.push({
      ...row,
      action,
      reason: existingProfileId
        ? "Matched existing person by member_number/email/name+phone."
        : "No existing match found.",
    });
  }

  return {
    counts,
    rows: results,
    householdCreates: plannedFamilyNames.size,
  };
}

async function loadExistingPeopleIndex(churchId: string): Promise<ExistingPeopleIndex> {
  if (shouldUseLocalTenantFallback()) {
    const [peopleResult, familyResult] = await Promise.all([
      queryTenantLocalDb<{
        id: string;
        full_name: string;
        email: string | null;
        phone: string | null;
        member_number: string | null;
      }>(
        `select id, full_name, email, phone, member_number
         from public.profiles
         where church_id = $1 and merged_into_profile_id is null`,
        [churchId],
      ),
      queryTenantLocalDb<{ family_name: string }>(
        `select family_name from public.families where church_id = $1`,
        [churchId],
      ),
    ]);

    return buildIndexFromRows(
      peopleResult.rows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        phone: row.phone,
        memberNumber: row.member_number,
      })),
      familyResult.rows.map((row) => row.family_name),
    );
  }

  const supabase = await createTenantServerClient();
  const [{ data: people }, { data: families }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, member_number")
      .eq("church_id", churchId)
      .is("merged_into_profile_id", null),
    supabase
      .from("families")
      .select("family_name")
      .eq("church_id", churchId),
  ]);

  return buildIndexFromRows(
    (people ?? []).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      memberNumber: row.member_number,
    })),
    (families ?? []).map((row) => row.family_name),
  );
}

function buildIndexFromRows(
  people: Array<{
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    memberNumber: string | null;
  }>,
  families: string[],
): ExistingPeopleIndex {
  const byMemberNumber = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const byNamePhone = new Map<string, string>();

  for (const person of people) {
    const memberNumber = normalize(person.memberNumber);
    const email = normalizeEmail(person.email);
    const phone = normalizePhone(person.phone);
    const name = normalizeName(person.fullName);

    if (memberNumber && !byMemberNumber.has(memberNumber)) {
      byMemberNumber.set(memberNumber, person.id);
    }
    if (email && !byEmail.has(email)) {
      byEmail.set(email, person.id);
    }
    if (name) {
      const key = `${name.toLowerCase()}|${phone ?? ""}`;
      if (!byNamePhone.has(key)) {
        byNamePhone.set(key, person.id);
      }
    }
  }

  const familyNames = new Set(
    families
      .map((familyName) => normalizeFamilyName(familyName)?.toLowerCase())
      .filter((value): value is string => Boolean(value)),
  );

  return { byMemberNumber, byEmail, byNamePhone, familyNames };
}

async function insertDryRunBatchAndRows(
  churchId: string,
  actorProfileId: string | null,
  sourceSystem: ImportSourceSystem,
  sourceFilename: string,
  rows: PeopleImportDryRunRow[],
  counts: PeopleImportDryRunCounts,
): Promise<string> {
  if (shouldUseLocalTenantFallback()) {
    const batch = await queryTenantLocalDb<{ id: string }>(
      `insert into public.import_batches
         (church_id, import_type, source_system, source_filename, created_by_profile_id,
          status, dry_run, summary)
       values ($1, 'people_households_csv', $2, $3, $4, 'dry_run_completed', true, $5::jsonb)
       returning id`,
      [churchId, sourceSystem, sourceFilename, actorProfileId, JSON.stringify(counts)],
    );

    const batchId = batch.rows[0]?.id;
    if (!batchId) {
      throw new Error("Unable to create import batch.");
    }

    for (const row of rows) {
      await queryTenantLocalDb(
        `insert into public.import_batch_rows
           (batch_id, church_id, row_number, raw_payload, normalized_payload, classification, reason)
         values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)`,
        [
          batchId,
          churchId,
          row.rowNumber,
          JSON.stringify(row),
          JSON.stringify(row),
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
      import_type: "people_households_csv",
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
    rows.map((row) => ({
      batch_id: batch.id,
      church_id: churchId,
      row_number: row.rowNumber,
      raw_payload: row,
      normalized_payload: row,
      classification: row.action,
      reason: row.reason,
    })),
  );

  if (rowsError) {
    throw new Error(rowsError.message);
  }

  return batch.id;
}

export async function runPeopleHouseholdImportDryRun(input: {
  churchId: string;
  actorProfileId: string | null;
  sourceSystem?: ImportSourceSystem;
  sourceFilename: string;
  csvText: string;
}): Promise<PeopleImportDryRunResult> {
  const csv = await parseCsv(input.csvText);
  if (csv.errors.length > 0) {
    throw new Error(csv.errors[0] ?? "Unable to parse CSV file.");
  }

  if (csv.rows.length === 0) {
    throw new Error("CSV file has no data rows.");
  }

  const sourceSystem = input.sourceSystem ?? "generic_csv";

  const existing = await loadExistingPeopleIndex(input.churchId);
  const parsedRows = parseImportRows(csv.rows, sourceSystem);
  const classification = classifyPeopleImportRows(parsedRows, existing);

  const batchId = await insertDryRunBatchAndRows(
    input.churchId,
    input.actorProfileId,
    sourceSystem,
    input.sourceFilename,
    classification.rows,
    classification.counts,
  );

  return {
    batchId,
    counts: classification.counts,
    householdCreates: classification.householdCreates,
    rows: classification.rows,
  };
}

function normalizeBatchRowPayload(payload: unknown): PeopleImportDryRunRow | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const row = payload as Partial<PeopleImportDryRunRow>;
  if (typeof row.fullName !== "string") {
    return null;
  }

  return {
    rowNumber: typeof row.rowNumber === "number" ? row.rowNumber : 0,
    householdName: typeof row.householdName === "string" ? row.householdName : null,
    fullName: row.fullName,
    email: typeof row.email === "string" ? row.email : null,
    phone: typeof row.phone === "string" ? row.phone : null,
    memberNumber: typeof row.memberNumber === "string" ? row.memberNumber : null,
    action:
      row.action === "create" ||
      row.action === "update" ||
      row.action === "skip" ||
      row.action === "reject"
        ? row.action
        : "reject",
    reason: typeof row.reason === "string" ? row.reason : null,
  };
}

async function ensureFamilyId(
  churchId: string,
  householdName: string,
): Promise<string | null> {
  if (shouldUseLocalTenantFallback()) {
    const existingFamily = await queryTenantLocalDb<{ id: string }>(
      `select id
       from public.families
       where church_id = $1 and lower(family_name) = lower($2)
       limit 1`,
      [churchId, householdName],
    );

    const foundId = existingFamily.rows[0]?.id;
    if (foundId) {
      return foundId;
    }

    const insertedFamily = await queryTenantLocalDb<{ id: string }>(
      `insert into public.families (church_id, family_name)
       values ($1, $2)
       returning id`,
      [churchId, householdName],
    );
    return insertedFamily.rows[0]?.id ?? null;
  }

  const supabase = await createTenantServerClient();
  const { data: existingFamily } = await supabase
    .from("families")
    .select("id")
    .eq("church_id", churchId)
    .ilike("family_name", householdName)
    .maybeSingle();

  if (existingFamily?.id) {
    return existingFamily.id;
  }

  const { data: insertedFamily, error } = await supabase
    .from("families")
    .insert({ church_id: churchId, family_name: householdName })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return insertedFamily.id;
}

async function upsertProfileFromImportRow(
  churchId: string,
  row: PeopleImportDryRunRow,
  existing: ExistingPeopleIndex,
): Promise<{ kind: "created" | "updated"; profileId: string }> {
  const familyId = row.householdName
    ? await ensureFamilyId(churchId, row.householdName)
    : null;

  const normalizedEmailValue = normalizeEmail(row.email);
  const normalizedPhoneValue = normalizePhone(row.phone);
  const normalizedNameValue = normalizeName(row.fullName);
  const normalizedMemberNumber = normalize(row.memberNumber);

  const existingProfileId =
    (normalizedMemberNumber
      ? existing.byMemberNumber.get(normalizedMemberNumber)
      : undefined) ??
    (normalizedEmailValue ? existing.byEmail.get(normalizedEmailValue) : undefined) ??
    (normalizedNameValue
      ? existing.byNamePhone.get(
          `${normalizedNameValue.toLowerCase()}|${normalizedPhoneValue ?? ""}`,
        )
      : undefined);

  if (shouldUseLocalTenantFallback()) {
    if (existingProfileId) {
      await queryTenantLocalDb(
        `update public.profiles
         set full_name = $3,
             email = $4,
             phone = $5,
             member_number = $6,
             family_id = $7,
             updated_at = now()
         where church_id = $1 and id = $2`,
        [
          churchId,
          existingProfileId,
          row.fullName,
          normalizedEmailValue,
          normalizedPhoneValue,
          normalizedMemberNumber,
          familyId,
        ],
      );
      return { kind: "updated", profileId: existingProfileId };
    }

    const insertedProfile = await queryTenantLocalDb<{ id: string }>(
      `insert into public.profiles
         (church_id, full_name, email, phone, member_number, family_id,
          role, membership_status, account_status, joined_date)
       values ($1, $2, $3, $4, $5, $6, 'member_volunteer', 'active', 'pending', current_date)
       returning id`,
      [
        churchId,
        row.fullName,
        normalizedEmailValue,
        normalizedPhoneValue,
        normalizedMemberNumber,
        familyId,
      ],
    );
    return { kind: "created", profileId: insertedProfile.rows[0]?.id ?? "" };
  }

  const supabase = await createTenantServerClient();

  if (existingProfileId) {
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: row.fullName,
        email: normalizedEmailValue,
        phone: normalizedPhoneValue,
        member_number: normalizedMemberNumber,
        family_id: familyId,
      })
      .eq("church_id", churchId)
      .eq("id", existingProfileId);

    if (error) {
      throw new Error(error.message);
    }

    return { kind: "updated", profileId: existingProfileId };
  }

  const { data: insertedProfile, error } = await supabase.from("profiles").insert({
    church_id: churchId,
    full_name: row.fullName,
    email: normalizedEmailValue,
    phone: normalizedPhoneValue,
    member_number: normalizedMemberNumber,
    family_id: familyId,
    role: "member_volunteer",
    membership_status: "active",
    account_status: "pending",
    joined_date: new Date().toISOString().slice(0, 10),
  }).select("id").single();

  if (error) {
    throw new Error(error.message);
  }

  return { kind: "created", profileId: insertedProfile?.id ?? "" };
}

export async function commitPeopleHouseholdImportBatch(input: {
  churchId: string;
  actorProfileId: string | null;
  batchId: string;
}): Promise<PeopleImportCommitResult> {
  const existing = await loadExistingPeopleIndex(input.churchId);

  let batchStatus: string | null = null;
  let dryRun = true;
  let normalizedRows: PeopleImportDryRunRow[] = [];

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

    normalizedRows = rowsResult.rows
      .map((row) => normalizeBatchRowPayload(row.normalized_payload))
      .filter((row): row is PeopleImportDryRunRow => Boolean(row));
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

    normalizedRows = (rows ?? [])
      .map((row) => normalizeBatchRowPayload((row as { normalized_payload: unknown }).normalized_payload))
      .filter((row): row is PeopleImportDryRunRow => Boolean(row));
  }

  if (batchStatus !== "dry_run_completed" || !dryRun) {
    throw new Error("Only dry-run-completed batches can be committed.");
  }

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const row of normalizedRows) {
    try {
      const result = await upsertProfileFromImportRow(input.churchId, row, existing);
      if (result.kind === "created") {
        created += 1;
      } else {
        updated += 1;
      }

      const memberNumber = normalize(row.memberNumber);
      const email = normalizeEmail(row.email);
      const phone = normalizePhone(row.phone);
      const name = normalizeName(row.fullName);

      if (memberNumber) {
        existing.byMemberNumber.set(memberNumber, result.profileId);
      }
      if (email) {
        existing.byEmail.set(email, result.profileId);
      }
      if (name) {
        existing.byNamePhone.set(`${name.toLowerCase()}|${phone ?? ""}`, result.profileId);
      }
    } catch {
      failed += 1;
    }
  }

  const status: PeopleImportCommitResult["status"] = failed > 0 ? "failed" : "committed";
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
