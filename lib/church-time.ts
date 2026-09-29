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

function validTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return FALLBACK_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
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

/** The real instant a church-local calendar day (`YYYY-MM-DD`) begins, i.e. 00:00 in the zone. */
export function startOfDayInTimeZone(day: string, timeZone: string | null | undefined): Date {
  const zone = validTimeZone(timeZone);
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  // Two passes settle the offset across a DST change on that day.
  let instant = utcMidnight - offsetMinutes(zone, utcMidnight) * 60_000;
  instant = utcMidnight - offsetMinutes(zone, instant) * 60_000;
  return new Date(instant);
}
