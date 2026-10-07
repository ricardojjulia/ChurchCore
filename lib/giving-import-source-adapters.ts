import "server-only";

import { contentSourceId, parseImportDate, pickField } from "@/lib/import-normalize";

export type GivingImportSourceSystem = "generic_csv" | "planning_center" | "breeze";

export type NormalizedGivingImportRow = {
  sourceId: string;
  donorEmail: string | null;
  /** The vendor's person id (Breeze ID), matched against profiles.member_number. */
  memberNumber: string | null;
  /** The file says the gift is anonymous (Breeze ID "Anonymous"); not a warning. */
  anonymousDonor: boolean;
  /** sourceId was derived from the row's content, so the dry run appends an occurrence counter. */
  synthetic: boolean;
  amountDollars: string | null;
  fundDesignation: string | null;
  donatedAt: string | null;
  note: string | null;
  isRecurringRaw: string | null;
};

type GivingFieldAliases = {
  sourceId: string[];
  donorEmail: string[];
  memberNumber: string[];
  amountDollars: string[];
  fundDesignation: string[];
  donatedAt: string[];
  note: string[];
  isRecurring: string[];
  batchNumber: string[];
  checkNumber: string[];
};

export const GIVING_SOURCE_ALIASES: Record<GivingImportSourceSystem, GivingFieldAliases> = {
  generic_csv: {
    sourceId: ["id", "source_id", "donation_id", "gift_id"],
    donorEmail: ["email", "donor_email", "member_email"],
    memberNumber: [],
    amountDollars: ["amount", "amount_dollars", "gift_amount"],
    fundDesignation: ["fund", "fund_designation", "fund_name"],
    donatedAt: ["donated_at", "gift_date", "date"],
    note: ["note", "notes", "memo"],
    isRecurring: ["is_recurring", "recurring"],
    batchNumber: [],
    checkNumber: [],
  },
  planning_center: {
    // Remote ID is the donation-history import's own external id.
    sourceId: ["remote_id", "id", "donation_id"],
    donorEmail: ["donor_email", "email"],
    memberNumber: [],
    amountDollars: ["donation_amount", "amount", "total"],
    fundDesignation: ["fund", "designation"],
    donatedAt: ["received_date", "donated_at", "date"],
    note: ["memo", "note"],
    isRecurring: ["recurring"],
    batchNumber: [],
    checkNumber: ["check_number"],
  },
  breeze: {
    // Processor ID is the payment processor's id when the gift has one.
    sourceId: ["processor_id", "id", "gift_id"],
    donorEmail: ["email", "member_email"],
    memberNumber: ["breeze_id"],
    amountDollars: ["amount", "gift_amount"],
    fundDesignation: ["fund", "category"],
    donatedAt: ["date", "gift_date"],
    note: ["note", "memo"],
    isRecurring: ["recurring"],
    batchNumber: ["batch_number"],
    checkNumber: ["check_number"],
  },
};

/** Every header alias the adapter reads for a source system; the rest are reported as ignored. */
export function givingConsumedAliases(sourceSystem: GivingImportSourceSystem): string[] {
  const aliases = GIVING_SOURCE_ALIASES[sourceSystem] ?? GIVING_SOURCE_ALIASES.generic_csv;
  return Object.values(aliases).flat();
}

export function parseAmountCents(raw: string | null): number | null {
  if (!raw || !raw.trim()) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  const dollars = parseFloat(cleaned);
  if (isNaN(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 100);
}

/** Kept for callers that still import the old name; same lookup, tolerant header matching. */
export const pickGivingField = pickField;

export function normalizeGivingImportSourceRow(
  row: Record<string, string>,
  sourceSystem: GivingImportSourceSystem,
  rowIndex: number,
  options: { timeZone?: string | null } = {},
): NormalizedGivingImportRow {
  const aliases = GIVING_SOURCE_ALIASES[sourceSystem] ?? GIVING_SOURCE_ALIASES.generic_csv;

  const rawMemberNumber = pickField(row, aliases.memberNumber)?.trim() ?? null;
  const anonymousDonor = rawMemberNumber?.toLowerCase() === "anonymous";
  const memberNumber = anonymousDonor ? null : rawMemberNumber;

  const donorEmail = pickField(row, aliases.donorEmail);
  const amountDollars = pickField(row, aliases.amountDollars);
  const fundDesignation = pickField(row, aliases.fundDesignation);
  const donatedAt = pickField(row, aliases.donatedAt);

  const explicitSourceId = pickField(row, aliases.sourceId)?.trim() || null;
  const vendorSystem = sourceSystem === "planning_center" || sourceSystem === "breeze";
  const synthetic = explicitSourceId === null && vendorSystem;

  let sourceId: string;
  if (explicitSourceId) {
    sourceId = explicitSourceId;
  } else if (synthetic) {
    // The same gift hashes the same wherever it sits in the file.
    const date = parseImportDate(donatedAt, options.timeZone);
    sourceId = contentSourceId(sourceSystem === "breeze" ? "brz-giv" : "pco-giv", [
      rawMemberNumber ?? donorEmail,
      date.ok ? date.day : donatedAt,
      String(parseAmountCents(amountDollars) ?? amountDollars ?? ""),
      fundDesignation,
      pickField(row, aliases.batchNumber),
      pickField(row, aliases.checkNumber),
    ]);
  } else {
    sourceId = `GIV-${rowIndex + 1}`;
  }

  return {
    sourceId,
    donorEmail,
    memberNumber,
    anonymousDonor,
    synthetic,
    amountDollars,
    fundDesignation,
    donatedAt,
    note: pickField(row, aliases.note),
    isRecurringRaw: pickField(row, aliases.isRecurring),
  };
}
