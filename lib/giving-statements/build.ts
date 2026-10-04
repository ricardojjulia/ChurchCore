import { createHash } from "node:crypto";

import { startOfDayInTimeZone, todayInTimeZone } from "@/lib/church-time";

// Year-end giving statements (G3.3): the pure rules. No I/O, no server-only
// imports, so every inclusion, grouping and masking rule is unit-testable.

export const TAX_SENTENCE = "No goods or services were provided in exchange for these contributions.";

export const UNASSIGNED_FUND = "Unassigned";

export type StatementRange = { start: string; end: string };

export type StatementGift = {
  id: string;
  profileId: string | null;
  donorName: string | null;
  donorEmail: string | null;
  isAnonymous: boolean;
  amountCents: number;
  currency: string;
  fund: string | null;
  status: string;
  /** `donations.created_at`, an ISO instant. The gift date is this, read in the church zone. */
  createdAt: string;
};

export type ProfileInfo = { name: string | null; email: string | null };

export type StatementLine = {
  giftId: string;
  /** Church-local date, YYYY-MM-DD. */
  date: string;
  fund: string;
  amountCents: number;
  currency: string;
  /** True for a gift the donor gave anonymously. Only the donor's own statement shows these. */
  anonymous: boolean;
};

export type FundSubtotal = { fund: string; currency: string; cents: number; count: number };
export type CurrencyTotal = { currency: string; cents: number };

export type DonorStatement = {
  /** `p:<profileId>` or `e:<normalized email>`. Never show this to staff for an all-anonymous donor; use `donorRef`. */
  donorKey: string;
  profileId: string | null;
  name: string;
  /** The name staff see: derived from named gifts only, never from an anonymous gift. */
  staffName: string;
  /** Where the statement is emailed, or null. */
  email: string | null;
  lines: StatementLine[];
  fundSubtotals: FundSubtotal[];
  grandTotals: CurrencyTotal[];
  giftCount: number;
  /** Sum across currencies. Meaningful as one number only when there is one currency. */
  totalCents: number;
  anonymousGiftCount: number;
};

export type UnstatementableGift = {
  giftId: string;
  date: string;
  amountCents: number;
  currency: string;
  fund: string;
  donor: "Anonymous" | "No donor information";
};

export type StatementBuild = {
  statements: DonorStatement[];
  unstatementable: UnstatementableGift[];
};

/**
 * A statement row for staff screens (owner decision 2026-10-04): the donor's
 * NAMED gifts only. The type has no anonymous count or flag, so none can leak.
 */
export type StaffStatementRow = {
  /** Opaque reference accepted by the admin PDF route. */
  donorRef: string;
  name: string;
  giftCount: number;
  totalCents: number;
  fundSubtotals: FundSubtotal[];
  grandTotals: CurrencyTotal[];
};

/** Anonymous gifts in range from every donor, as one unattributed line. */
export type AnonymousAggregate = {
  giftCount: number;
  totalCents: number;
  totalsByCurrency: CurrencyTotal[];
};

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealDay(day: string): boolean {
  const match = DAY_RE.exec(day);
  if (!match) return false;
  const parsed = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type ResolvedRange = { ok: true; range: StatementRange } | { ok: false; error: string };

/**
 * The default is the last calendar year in the church's own zone. Both ends are
 * inclusive. A custom range needs both ends, real dates, start on or before end.
 */
export function resolveStatementRange(
  input: { start?: string | null; end?: string | null },
  timeZone: string | null,
  now: Date = new Date(),
): ResolvedRange {
  const start = input.start?.trim() || undefined;
  const end = input.end?.trim() || undefined;
  if (!start && !end) {
    const lastYear = Number(todayInTimeZone(timeZone, now).slice(0, 4)) - 1;
    return { ok: true, range: { start: `${lastYear}-01-01`, end: `${lastYear}-12-31` } };
  }
  if (!start || !end) {
    return { ok: false, error: "Choose both a start date and an end date." };
  }
  if (!isRealDay(start) || !isRealDay(end)) {
    return { ok: false, error: "Dates must be real calendar dates (YYYY-MM-DD)." };
  }
  if (start > end) {
    return { ok: false, error: "The start date must be on or before the end date." };
  }
  if (start < "2000-01-01") {
    return { ok: false, error: "The start date is too far in the past." };
  }
  return { ok: true, range: { start, end } };
}

/** The church-local calendar date of a gift instant, YYYY-MM-DD. */
export function giftLocalDate(createdAt: string, timeZone: string | null): string {
  return todayInTimeZone(timeZone, new Date(createdAt));
}

/** Trimmed, lower-cased; null for blank. */
export function normalizeEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value ? value : null;
}

/** `p:<profileId>` or `e:<email>`; null when the gift has neither. */
export function donorKey(gift: Pick<StatementGift, "profileId" | "donorEmail">): string | null {
  if (gift.profileId) return `p:${gift.profileId}`;
  const email = normalizeEmail(gift.donorEmail);
  return email ? `e:${email}` : null;
}

/**
 * A reference safe for staff screens, URLs and the audit log: the profile uuid,
 * or `h:` plus a SHA-256 prefix of a guest's email.
 */
export function donorRef(key: string): string {
  if (key.startsWith("p:")) return key;
  const email = key.startsWith("e:") ? key.slice(2) : key;
  return `h:${createHash("sha256").update(email).digest("hex").slice(0, 16)}`;
}

/** One statement per church, donor and range: the claim key for a send. Never contains a raw email. */
export function idempotencyKey(churchId: string, key: string, range: StatementRange): string {
  // A guest key is hashed (donorRef): the stored key never holds a raw email.
  return `giving-statement:v1:${churchId}:${donorRef(key)}:${range.start}:${range.end}`;
}

function fundLabel(fund: string | null): string {
  const trimmed = fund?.trim();
  return trimmed ? trimmed : UNASSIGNED_FUND;
}

function currencyOf(currency: string | null | undefined): string {
  return (currency?.trim() || "usd").toLowerCase();
}

function summarize(lines: StatementLine[]) {
  const subtotals = new Map<string, FundSubtotal>();
  const totals = new Map<string, number>();
  for (const line of lines) {
    const subKey = `${line.currency}\u0000${line.fund}`;
    const sub = subtotals.get(subKey) ?? { fund: line.fund, currency: line.currency, cents: 0, count: 0 };
    sub.cents += line.amountCents;
    sub.count += 1;
    subtotals.set(subKey, sub);
    totals.set(line.currency, (totals.get(line.currency) ?? 0) + line.amountCents);
  }
  return {
    fundSubtotals: [...subtotals.values()].sort(
      (a, b) => a.currency.localeCompare(b.currency) || (a.fund === UNASSIGNED_FUND ? 1 : b.fund === UNASSIGNED_FUND ? -1 : a.fund.localeCompare(b.fund)),
    ),
    grandTotals: [...totals.entries()].map(([currency, cents]) => ({ currency, cents })).sort((a, b) => a.currency.localeCompare(b.currency)),
    giftCount: lines.length,
    totalCents: lines.reduce((sum, line) => sum + line.amountCents, 0),
  };
}

/**
 * Applies the inclusion rules again (succeeded, church-local date in the
 * inclusive range) so a loader bug can never widen a statement, then groups.
 */
export function buildStatements(
  gifts: StatementGift[],
  options: { timeZone: string | null; range: StatementRange; profiles?: Map<string, ProfileInfo> },
): StatementBuild {
  const { timeZone, range, profiles } = options;
  const groups = new Map<string, { gifts: StatementGift[]; profileId: string | null }>();
  const unstatementable: UnstatementableGift[] = [];

  const included = gifts
    .filter((gift) => gift.status === "succeeded")
    .map((gift) => ({ gift, date: giftLocalDate(gift.createdAt, timeZone) }))
    .filter(({ date }) => date >= range.start && date <= range.end)
    .sort((a, b) => (a.gift.createdAt === b.gift.createdAt ? a.gift.id.localeCompare(b.gift.id) : a.gift.createdAt < b.gift.createdAt ? -1 : 1));

  for (const { gift, date } of included) {
    const key = donorKey(gift);
    if (!key) {
      unstatementable.push({
        giftId: gift.id,
        date,
        amountCents: gift.amountCents,
        currency: currencyOf(gift.currency),
        fund: fundLabel(gift.fund),
        donor: gift.isAnonymous ? "Anonymous" : "No donor information",
      });
      continue;
    }
    const group = groups.get(key) ?? { gifts: [], profileId: gift.profileId };
    group.gifts.push(gift);
    groups.set(key, group);
  }

  const statements: DonorStatement[] = [];
  for (const [key, group] of groups) {
    const profile = group.profileId ? profiles?.get(group.profileId) : undefined;
    const guestEmail = key.startsWith("e:") ? key.slice(2) : null;
    const email =
      normalizeEmail(profile?.email) ??
      guestEmail ??
      group.gifts.map((g) => normalizeEmail(g.donorEmail)).find((e): e is string => e !== null) ??
      null;
    const named = group.gifts.filter((g) => !g.isAnonymous);
    const name =
      profile?.name?.trim() ||
      group.gifts.map((g) => g.donorName?.trim()).find((n): n is string => Boolean(n)) ||
      email ||
      "Donor";
    const staffName =
      profile?.name?.trim() ||
      named.map((g) => g.donorName?.trim()).find((n): n is string => Boolean(n)) ||
      (named.length > 0 ? email : null) ||
      "Donor";

    const lines: StatementLine[] = group.gifts.map((gift) => ({
      giftId: gift.id,
      date: giftLocalDate(gift.createdAt, timeZone),
      fund: fundLabel(gift.fund),
      amountCents: gift.amountCents,
      currency: currencyOf(gift.currency),
      anonymous: gift.isAnonymous,
    }));

    statements.push({
      donorKey: key,
      profileId: group.profileId,
      name,
      staffName,
      email,
      lines,
      ...summarize(lines),
      anonymousGiftCount: group.gifts.length - named.length,
    });
  }

  statements.sort((a, b) => a.name.localeCompare(b.name) || a.donorKey.localeCompare(b.donorKey));
  return { statements, unstatementable };
}

/**
 * The donor's statement with their anonymous gifts removed, or null when they
 * have none named. This is all staff ever see or download for a donor.
 */
export function namedView(statement: DonorStatement): DonorStatement | null {
  const lines = statement.lines.filter((l) => !l.anonymous);
  if (lines.length === 0) return null;
  return { ...statement, name: statement.staffName, lines, ...summarize(lines), anonymousGiftCount: 0 };
}

/** The staff row for a donor: named gifts only; null for an anonymous-only donor (no row at all). */
export function maskForStaff(statement: DonorStatement): StaffStatementRow | null {
  const view = namedView(statement);
  if (!view) return null;
  return {
    donorRef: donorRef(statement.donorKey),
    name: view.name,
    giftCount: view.giftCount,
    totalCents: view.totalCents,
    fundSubtotals: view.fundSubtotals,
    grandTotals: view.grandTotals,
  };
}

/** Every anonymous gift in range, from donors with statements and from the un-statementable list, with no donor link. */
export function anonymousAggregate(statements: DonorStatement[], unstatementable: UnstatementableGift[]): AnonymousAggregate {
  const totals = new Map<string, number>();
  let giftCount = 0;
  let totalCents = 0;
  const add = (currency: string, cents: number) => {
    giftCount += 1;
    totalCents += cents;
    totals.set(currency, (totals.get(currency) ?? 0) + cents);
  };
  for (const statement of statements) {
    for (const line of statement.lines) if (line.anonymous) add(line.currency, line.amountCents);
  }
  for (const gift of unstatementable) if (gift.donor === "Anonymous") add(gift.currency, gift.amountCents);
  return {
    giftCount,
    totalCents,
    totalsByCurrency: [...totals.entries()].map(([currency, cents]) => ({ currency, cents })).sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}

/** `Jan 5, 2026` from YYYY-MM-DD, with no time zone shifting. */
export function formatLocalDate(day: string): string {
  const match = DAY_RE.exec(day);
  if (!match) return day;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

export function formatMoney(cents: number, currency: string): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** The instants bounding an inclusive local range: `[start, endExclusive)`. Null when malformed. */
export function rangeInstants(range: StatementRange, timeZone: string | null): { start: Date; endExclusive: Date } | null {
  if (!isRealDay(range.start) || !isRealDay(range.end)) return null;
  const start = startOfDayInTimeZone(range.start, timeZone);
  const endExclusive = startOfDayInTimeZone(addDays(range.end, 1), timeZone);
  return start && endExclusive ? { start, endExclusive } : null;
}
