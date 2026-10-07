import "server-only";

import { pickField, splitFirstEmail } from "@/lib/import-normalize";

export type ImportSourceSystem =
  | "generic_csv"
  | "planning_center"
  | "breeze"
  | "pushpay_ccb";

type FieldAliases = {
  householdName: string[];
  fullName: string[];
  firstName: string[];
  lastName: string[];
  email: string[];
  phone: string[];
  memberNumber: string[];
};

const SOURCE_ALIASES: Record<ImportSourceSystem, FieldAliases> = {
  generic_csv: {
    householdName: ["household_name", "family_name", "household"],
    fullName: ["full_name", "name"],
    firstName: [],
    lastName: [],
    email: ["email", "email_address"],
    phone: ["phone", "mobile_phone", "cell_phone"],
    memberNumber: ["member_number", "member_id", "people_id", "individual_id"],
  },
  planning_center: {
    householdName: ["household_name", "household", "family_name"],
    fullName: ["name", "full_name"],
    // Given Name is the fallback when First Name is blank (owner decision G4.1).
    firstName: ["first_name", "given_name"],
    lastName: ["last_name"],
    email: ["home_email", "work_email", "other_email", "email_address", "email"],
    phone: [
      "mobile_phone_number",
      "home_phone_number",
      "work_phone_number",
      "other_phone_number",
      "mobile_phone",
      "phone",
      "cell_phone",
    ],
    memberNumber: ["person_id", "people_id", "member_number"],
  },
  breeze: {
    householdName: ["family_name", "family", "household_name"],
    fullName: ["name", "full_name"],
    firstName: ["first_name"],
    lastName: ["last_name"],
    email: ["email", "email_address"],
    phone: ["mobile", "home", "work", "mobile_phone", "phone"],
    memberNumber: ["breeze_id", "member_id", "person_id", "member_number"],
  },
  pushpay_ccb: {
    householdName: ["household_name", "family_name", "household"],
    fullName: ["full_name", "name"],
    firstName: [],
    lastName: [],
    email: ["email", "email_address"],
    phone: ["phone", "mobile_phone"],
    memberNumber: ["individual_id", "people_id", "member_number"],
  },
};

/** Every header alias the adapter reads for a source system; the rest are reported as ignored. */
export function peopleConsumedAliases(sourceSystem: ImportSourceSystem): string[] {
  const aliases = SOURCE_ALIASES[sourceSystem] ?? SOURCE_ALIASES.generic_csv;
  return Object.values(aliases).flat();
}

export function normalizePeopleImportSourceRow(
  row: Record<string, string>,
  sourceSystem: ImportSourceSystem,
): {
  householdName: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  memberNumber: string | null;
} {
  const aliases = SOURCE_ALIASES[sourceSystem] ?? SOURCE_ALIASES.generic_csv;

  // First Name + Last Name when the export has them (Nickname is never used),
  // otherwise the single name column that generic files carry.
  const first = pickField(row, aliases.firstName)?.trim() ?? "";
  const last = pickField(row, aliases.lastName)?.trim() ?? "";
  const composed = `${first} ${last}`.trim();
  const fullName = composed.length > 0 ? composed : pickField(row, aliases.fullName);

  const rawEmail = pickField(row, aliases.email);

  return {
    householdName: pickField(row, aliases.householdName),
    fullName,
    // Breeze keeps several addresses in one cell; the first becomes primary.
    email: sourceSystem === "breeze" ? splitFirstEmail(rawEmail) : rawEmail,
    phone: pickField(row, aliases.phone),
    memberNumber: pickField(row, aliases.memberNumber),
  };
}
