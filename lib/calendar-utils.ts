/**
 * Shared calendar helper utilities.
 *
 * All timezone-sensitive helpers use Intl.DateTimeFormat with the supplied
 * churchTimeZone rather than Date prototype methods, so they are correct
 * regardless of the browser or server's local timezone.
 */

export function formatCategory(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export function getCategoryColor(category: string): string {
  switch (category) {
    case "worship":
      return "#2563eb";
    case "prayer":
      return "#0f766e";
    case "outreach":
      return "#c2410c";
    case "administrative":
      return "#475569";
    case "ministry":
      return "#7c3aed";
    case "liturgical":
      return "#1d4ed8";
    case "informational":
      return "#0284c7";
    case "internal":
      return "#334155";
    default:
      return "#1f6feb";
  }
}

export function toChurchDateKey(value: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return "";
  }

  return `${year}-${month}-${day}`;
}

export function formatDateKey(value: string): string {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function formatTimeRange(start: string, end: string, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
}

/**
 * Returns the hour (0–23) of the given ISO timestamp in the supplied timezone,
 * using Intl.DateTimeFormat — NOT Date.prototype.getHours() which would return
 * the browser/server local time.
 */
export function getChurchHour(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date(iso));

  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
  const parsed = Number(hourPart);
  // Intl hour12:false can return "24" for midnight — normalise to 0.
  return parsed === 24 ? 0 : parsed;
}

/**
 * Returns the minute (0–59) of the given ISO timestamp in the supplied timezone,
 * using Intl.DateTimeFormat — NOT Date.prototype.getMinutes().
 */
export function getChurchMinute(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    minute: "numeric",
  }).formatToParts(new Date(iso));

  const minutePart = parts.find((p) => p.type === "minute")?.value ?? "0";
  return Number(minutePart);
}

/**
 * Returns the date parts (year, month index 0-based, day, weekday index 0=Sun)
 * of the given Date in the supplied IANA timezone, using Intl.DateTimeFormat —
 * NOT Date.prototype.get* methods which are local-timezone.
 *
 * Exported so callers (e.g. CalendarLiveBoard) can reuse the same TZ-safe
 * decomposition rather than reimplementing it.
 */
export function getChurchDateParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);

  const year = Number(parts.find((p) => p.type === "year")?.value ?? "0");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1") - 1;
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "1");
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayStr);

  return { year, month, day, weekday: weekday === -1 ? 0 : weekday };
}

/**
 * Returns a human-readable period label for the calendar navigation header.
 *
 * - month: "June 2026"
 * - week:  "Jun 1 – 7, 2026"  (Sunday → Saturday of the week containing date)
 * - day:   "Saturday, June 6, 2026"
 */
export function getPeriodLabel(
  mode: "month" | "week" | "day",
  date: Date,
  timeZone: string,
): string {
  if (mode === "month") {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone,
    }).format(date);
  }

  if (mode === "day") {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone,
    }).format(date);
  }

  // week: "Jun 1 – 7, 2026"
  // Derive start/end from church-timezone date parts to avoid JS-local-TZ drift.
  const { year, month, day, weekday } = getChurchDateParts(date, timeZone);

  // Anchor at noon UTC to avoid DST boundaries (same pattern as formatDateKey).
  const sundayDate = new Date(Date.UTC(year, month, day - weekday, 12));
  const saturdayDate = new Date(Date.UTC(year, month, day - weekday + 6, 12));

  const startFmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(sundayDate);

  const endFmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(saturdayDate);

  return `${startFmt} – ${endFmt}`;
}
