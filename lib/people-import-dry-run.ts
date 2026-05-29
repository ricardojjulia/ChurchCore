import "server-only";

import { parseCsv } from "@/lib/finance-import";
import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

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

function parseImportRows(csvRows: Record<string, string>[]) {
  const rows: ParsedImportRow[] = [];

  for (let index = 0; index < csvRows.length; index += 1) {
    const row = csvRows[index];
    const fullName = normalizeName(row.full_name ?? row.name);
    if (!fullName) {
      rows.push({
        rowNumber: index + 2,
        householdName: null,
        fullName: "",
        email: normalizeEmail(row.email),
        phone: normalizePhone(row.phone),
        memberNumber: normalize(row.member_number),
      });
      continue;
    }

    rows.push({
      rowNumber: index + 2,
      householdName: normalizeFamilyName(row.household_name ?? row.family_name),
      fullName,
      email: normalizeEmail(row.email),
      phone: normalizePhone(row.phone),
      memberNumber: normalize(row.member_number),
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
  sourceFilename: string,
  rows: PeopleImportDryRunRow[],
  counts: PeopleImportDryRunCounts,
): Promise<string> {
  if (shouldUseLocalTenantFallback()) {
    const batch = await queryTenantLocalDb<{ id: string }>(
      `insert into public.import_batches
         (church_id, import_type, source_system, source_filename, created_by_profile_id,
          status, dry_run, summary)
       values ($1, 'people_households_csv', 'generic_csv', $2, $3, 'dry_run_completed', true, $4::jsonb)
       returning id`,
      [churchId, sourceFilename, actorProfileId, JSON.stringify(counts)],
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
      source_system: "generic_csv",
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

  const existing = await loadExistingPeopleIndex(input.churchId);
  const parsedRows = parseImportRows(csv.rows);
  const classification = classifyPeopleImportRows(parsedRows, existing);

  const batchId = await insertDryRunBatchAndRows(
    input.churchId,
    input.actorProfileId,
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
