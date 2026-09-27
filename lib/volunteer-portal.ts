/**
 * Shared display logic for the public volunteer portal (the emailed
 * accept/decline and schedule links). Pure, so both the server-rendered
 * schedule page and the client confirm view format a shift the same way.
 *
 * Shift times are stored as the service's wall-clock time (see
 * shiftWindowForPlan in lib/rotation-planner.ts), so they're formatted in UTC
 * to show that wall-clock time unchanged, whatever the viewer's timezone.
 */

type OneOrMany<T> = T | T[] | null | undefined;

export type PublicShiftEvent = {
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  category: string;
};

export type PublicShiftPlan = {
  name: string;
  service_date: string;
  service_time: string | null;
};

export type PublicShift = {
  id: string;
  title: string;
  confirmation_status: string;
  confirmation_token?: string | null;
  confirmation_token_expires_at?: string | null;
  starts_at: string;
  ends_at: string;
  events?: OneOrMany<PublicShiftEvent>;
  service_plans?: OneOrMany<PublicShiftPlan>;
};

function first<T>(value: OneOrMany<T>): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function describePublicShift(
  shift: PublicShift,
  dateStyle: "short" | "long" = "short",
): { place: string; description: string | null; dateLabel: string; timeLabel: string } {
  const event = first(shift.events);
  const plan = first(shift.service_plans);
  const dateOptions: Intl.DateTimeFormatOptions =
    dateStyle === "long"
      ? { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }
      : { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" };
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

  const dateSource = plan?.service_date ? `${plan.service_date}T00:00:00Z` : shift.starts_at;
  return {
    place: plan?.name || event?.title || "Church Service",
    description: event?.description ?? null,
    dateLabel: dateSource ? new Date(dateSource).toLocaleDateString("en-US", dateOptions) : "TBD",
    timeLabel: shift.starts_at && shift.ends_at ? `${time(shift.starts_at)} – ${time(shift.ends_at)}` : "TBD",
  };
}
