import "server-only";

export type GivingImportSourceSystem = "generic_csv" | "planning_center" | "breeze";

export type NormalizedGivingImportRow = {
  sourceId: string;
  donorEmail: string | null;
  amountDollars: string | null;
  fundDesignation: string | null;
  donatedAt: string | null;
  note: string | null;
  isRecurringRaw: string | null;
};

type GivingFieldAliases = {
  sourceId: string[];
  donorEmail: string[];
  amountDollars: string[];
  fundDesignation: string[];
  donatedAt: string[];
  note: string[];
  isRecurring: string[];
};

export const GIVING_SOURCE_ALIASES: Record<GivingImportSourceSystem, GivingFieldAliases> = {
  generic_csv: {
    sourceId: ["id", "source_id", "donation_id", "gift_id"],
    donorEmail: ["email", "donor_email", "member_email"],
    amountDollars: ["amount", "amount_dollars", "gift_amount"],
    fundDesignation: ["fund", "fund_designation", "fund_name"],
    donatedAt: ["donated_at", "gift_date", "date"],
    note: ["note", "notes", "memo"],
    isRecurring: ["is_recurring", "recurring"],
  },
  planning_center: {
    sourceId: ["id", "donation_id"],
    donorEmail: ["email", "donor_email"],
    amountDollars: ["amount", "total"],
    fundDesignation: ["fund", "designation"],
    donatedAt: ["donated_at", "date"],
    note: ["note", "memo"],
    isRecurring: ["recurring"],
  },
  breeze: {
    sourceId: ["id", "gift_id"],
    donorEmail: ["email", "member_email"],
    amountDollars: ["amount", "gift_amount"],
    fundDesignation: ["fund", "category"],
    donatedAt: ["gift_date", "date"],
    note: ["note", "memo"],
    isRecurring: ["recurring"],
  },
};

export function pickGivingField(row: Record<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = row[alias];
    if (value != null && value.trim().length > 0) return value;
  }
  return null;
}

export function normalizeGivingImportSourceRow(
  row: Record<string, string>,
  sourceSystem: GivingImportSourceSystem,
  rowIndex: number,
): NormalizedGivingImportRow {
  const aliases = GIVING_SOURCE_ALIASES[sourceSystem] ?? GIVING_SOURCE_ALIASES.generic_csv;

  const rawSourceId = pickGivingField(row, aliases.sourceId);
  const sourceId = rawSourceId ?? `GIV-${rowIndex + 1}`;

  return {
    sourceId,
    donorEmail: pickGivingField(row, aliases.donorEmail),
    amountDollars: pickGivingField(row, aliases.amountDollars),
    fundDesignation: pickGivingField(row, aliases.fundDesignation),
    donatedAt: pickGivingField(row, aliases.donatedAt),
    note: pickGivingField(row, aliases.note),
    isRecurringRaw: pickGivingField(row, aliases.isRecurring),
  };
}
