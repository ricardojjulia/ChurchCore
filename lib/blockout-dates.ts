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
): { ok: true; dates: string[]; reason: string | null } | { ok: false; error: string } {
  const from = parseDay(input.from);
  const to = parseDay(input.to || input.from);
  if (from === null || to === null) return { ok: false, error: "Choose a valid date." };
  if (to < from) return { ok: false, error: "The end date is before the start date." };

  const today = parseDay(todayUtc(now))!;
  if (from < today) return { ok: false, error: "You can't mark a date in the past." };
  if (to > today + MAX_BLOCKOUT_DAYS_AHEAD * MS_PER_DAY) {
    return { ok: false, error: `Dates can be at most ${MAX_BLOCKOUT_DAYS_AHEAD} days ahead.` };
  }

  const days = Math.round((to - from) / MS_PER_DAY) + 1;
  if (days > MAX_BLOCKOUT_RANGE_DAYS) {
    return { ok: false, error: `A range can be at most ${MAX_BLOCKOUT_RANGE_DAYS} days.` };
  }

  const reason = input.reason?.trim() ? input.reason.trim().slice(0, MAX_BLOCKOUT_REASON_LENGTH) : null;
  return { ok: true, dates: Array.from({ length: days }, (_, i) => toDay(from + i * MS_PER_DAY)), reason };
}

/** Validates one day for removal (past days are kept as history, not removed). */
export function validateBlockoutDay(value: string, now: Date = new Date()): string | null {
  const day = parseDay(value);
  if (day === null) return "Choose a valid date.";
  if (day < parseDay(todayUtc(now))!) return "Past dates can't be changed.";
  return null;
}
