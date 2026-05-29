import "server-only";

export type ImportSourceSystem =
  | "generic_csv"
  | "planning_center"
  | "breeze"
  | "pushpay_ccb";

type FieldAliases = {
  householdName: string[];
  fullName: string[];
  email: string[];
  phone: string[];
  memberNumber: string[];
};

const SOURCE_ALIASES: Record<ImportSourceSystem, FieldAliases> = {
  generic_csv: {
    householdName: ["household_name", "family_name", "household"],
    fullName: ["full_name", "name"],
    email: ["email", "email_address"],
    phone: ["phone", "mobile_phone", "cell_phone"],
    memberNumber: ["member_number", "member_id", "people_id", "individual_id"],
  },
  planning_center: {
    householdName: ["household_name", "household", "family_name"],
    fullName: ["name", "full_name"],
    email: ["email_address", "email"],
    phone: ["mobile_phone", "phone", "cell_phone"],
    memberNumber: ["people_id", "person_id", "member_number"],
  },
  breeze: {
    householdName: ["family_name", "family", "household_name"],
    fullName: ["name", "full_name"],
    email: ["email", "email_address"],
    phone: ["mobile_phone", "phone"],
    memberNumber: ["member_id", "person_id", "member_number"],
  },
  pushpay_ccb: {
    householdName: ["household_name", "family_name", "household"],
    fullName: ["full_name", "name"],
    email: ["email", "email_address"],
    phone: ["phone", "mobile_phone"],
    memberNumber: ["individual_id", "people_id", "member_number"],
  },
};

function pickFirst(row: Record<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = row[alias];
    if (value != null && value.trim().length > 0) {
      return value;
    }
  }

  return null;
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

  return {
    householdName: pickFirst(row, aliases.householdName),
    fullName: pickFirst(row, aliases.fullName),
    email: pickFirst(row, aliases.email),
    phone: pickFirst(row, aliases.phone),
    memberNumber: pickFirst(row, aliases.memberNumber),
  };
}
