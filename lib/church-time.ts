/**
 * Calendar days in the church's own time zone (G1.6, FS3-4).
 *
 * Volunteer shift times are stored as the church's local wall-clock time
 * labelled UTC (the planner writes `2026-10-06T20:00:00` for an 8 pm service,
 * and the member schedule displays shifts with `timeZone: "UTC"`), so a
 * shift's UTC date *is* its local day. What was wrong was "today" and "now":
 * computed in UTC, a church at UTC−4 rolled over to tomorrow at 8 pm local.
 * These helpers give the church's today and the real instant a local day
 * starts. See ADR 0023.
 */

const FALLBACK_TIME_ZONE = "UTC";

/** True for an IANA zone the runtime knows, e.g. "America/New_York" (not "Eastern"). */
export function isValidTimeZone(timeZone: string | null | undefined): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function validTimeZone(timeZone: string | null | undefined): string {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : FALLBACK_TIME_ZONE;
}

/** The church's current calendar day, `YYYY-MM-DD`. An unknown zone falls back to UTC. */
export function todayInTimeZone(timeZone: string | null | undefined, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: validTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Minutes the zone is ahead of UTC at `instant` (e.g. −240 for New York in summer). */
function offsetMinutes(timeZone: string, instant: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - instant) / 60_000);
}

/**
 * The real instant a church-local calendar day (`YYYY-MM-DD`) begins: 00:00 in
 * the zone, or the first instant of the day where DST skips midnight (e.g.
 * America/Santiago, America/Havana start their DST at 00:00). Null for a
 * malformed day.
 */
export function startOfDayInTimeZone(day: string, timeZone: string | null | undefined): Date | null {
  const zone = validTimeZone(timeZone);
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(utcMidnight)) return null;
  // Midnight under the offset in force just before and just after it. When DST
  // jumps at midnight, only the later candidate falls on the requested day
  // (Council Review 24); otherwise both agree.
  const before = utcMidnight - offsetMinutes(zone, utcMidnight) * 60_000;
  const after = utcMidnight - offsetMinutes(zone, before) * 60_000;
  const onDay = [Math.min(before, after), Math.max(before, after)].find(
    (instant) => todayInTimeZone(zone, new Date(instant)) === day,
  );
  return new Date(onDay ?? Math.max(before, after));
}

/**
 * The real instant of a church-local date and time, e.g. 10:00 on 2026-10-04
 * in America/New_York → 14:00Z. For true instants like `events.starts_at`, not
 * volunteer shift times (which stay wall-clock, ADR 0023). Null when malformed.
 */
export function zonedTimeToInstant(day: string, time: string, timeZone: string | null | undefined): Date | null {
  const zone = validTimeZone(timeZone);
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  const guess = Date.parse(`${day}T00:00:00Z`);
  if (!match || Number.isNaN(guess)) return null;
  const asUtc = guess + (Number(match[1]) * 60 + Number(match[2])) * 60_000 + Number(match[3] ?? 0) * 1000;
  const first = asUtc - offsetMinutes(zone, asUtc) * 60_000;
  return new Date(asUtc - offsetMinutes(zone, first) * 60_000);
}

