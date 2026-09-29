/**
 * Blockout dates (G1.4): the days a volunteer can't serve. Stored one row per
 * day in volunteer_blocked_dates; the rotation planner's "Unavailable that
 * day" and the assign modal read them.
 *
 * "Today" is a UTC date for now; G1.6 moves day boundaries to the church's
 * timezone.
 */

/** Longest single range a volunteer can add at once (e.g. a vacation). */
export const MAX_BLOCKOUT_RANGE_DAYS = 90;
/** How far ahead a blockout can be set. */
export const MAX_BLOCKOUT_DAYS_AHEAD = 365;
export const MAX_BLOCKOUT_REASON_LENGTH = 200;

export type BlockoutDate = { date: string; reason: string | null };

/**
 * Why a change was refused, so the UI can show it in the viewer's language.
 * Each result also carries an English `error` for logs and tests.
 */
export type BlockoutErrorCode =
  | "invalid_date"
  | "end_before_start"
  | "past"
  | "too_far"
  | "range_too_long"
  | "link_expired"
  | "not_found"
  | "no_profile"
  | "save_failed";

/** Consecutive days with the same reason, shown and removed as one entry (a vacation). */
export type BlockoutRange = { from: string; to: string; days: number; reason: string | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDay(value: string): number | null {
  if (!DATE_RE.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  // Reject impossible dates that Date.parse rolls over (e.g. 2026-02-30).
  return new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}

function toDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Validates a single day or an inclusive range and expands it to the list of
 * days to store. `to` defaults to `from`.
 */
export function expandBlockoutRange(
  input: { from: string; to?: string | null; reason?: string | null },
  now: Date = new Date(),
):
  | { ok: true; dates: string[]; reason: string | null }
  | { ok: false; code: BlockoutErrorCode; error: string } {
  const from = parseDay(input.from);
  const to = parseDay(input.to || input.from);
  if (from === null || to === null) return { ok: false, code: "invalid_date", error: "Choose a valid date." };
  if (to < from) return { ok: false, code: "end_before_start", error: "The end date is before the start date." };

  const today = parseDay(todayUtc(now))!;
  if (from < today) return { ok: false, code: "past", error: "You can't mark a date in the past." };
  if (to > today + MAX_BLOCKOUT_DAYS_AHEAD * MS_PER_DAY) {
    return { ok: false, code: "too_far", error: `Dates can be at most ${MAX_BLOCKOUT_DAYS_AHEAD} days ahead.` };
  }

  const days = Math.round((to - from) / MS_PER_DAY) + 1;
  if (days > MAX_BLOCKOUT_RANGE_DAYS) {
    return { ok: false, code: "range_too_long", error: `A range can be at most ${MAX_BLOCKOUT_RANGE_DAYS} days.` };
  }

  const reason = input.reason?.trim() ? input.reason.trim().slice(0, MAX_BLOCKOUT_REASON_LENGTH) : null;
  return { ok: true, dates: Array.from({ length: days }, (_, i) => toDay(from + i * MS_PER_DAY)), reason };
}

/**
 * Validates a day or range for removal. Past days are kept as history, so the
 * range must start today or later.
 */
export function validateBlockoutRemoval(
  input: { from: string; to?: string | null },
  now: Date = new Date(),
): { ok: true; from: string; to: string } | { ok: false; code: BlockoutErrorCode; error: string } {
  const from = parseDay(input.from);
  const to = parseDay(input.to || input.from);
  if (from === null || to === null) return { ok: false, code: "invalid_date", error: "Choose a valid date." };
  if (to < from) return { ok: false, code: "end_before_start", error: "The end date is before the start date." };
  if (from < parseDay(todayUtc(now))!) return { ok: false, code: "past", error: "Past dates can't be changed." };
  return { ok: true, from: toDay(from), to: toDay(to) };
}

/** Groups sorted days into runs of consecutive days that share a reason. */
export function groupBlockoutRanges(dates: BlockoutDate[]): BlockoutRange[] {
  const sorted = [...dates].sort((a, b) => a.date.localeCompare(b.date));
  const ranges: BlockoutRange[] = [];
  for (const entry of sorted) {
    const last = ranges[ranges.length - 1];
    const next = last ? toDay(parseDay(last.to)! + MS_PER_DAY) : null;
    if (last && next === entry.date && last.reason === entry.reason) {
      last.to = entry.date;
      last.days += 1;
    } else {
      ranges.push({ from: entry.date, to: entry.date, days: 1, reason: entry.reason });
    }
  }
  return ranges;
}
