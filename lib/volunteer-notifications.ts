/**
 * Assignment notifications (G1.5): the rules for telling a volunteer about a
 * shift. Pure, so they're unit-tested; app/app/volunteer-actions.ts does the
 * sending through the communications pipeline (sendWithSuppression), which
 * applies suppressions and opt-ins and writes the communication log.
 *
 * Messages are English-only for now (the volunteer's language isn't stored).
 */

/** A shift's confirm link stays valid this long after the service date. */
export const TOKEN_DAYS_AFTER_SERVICE = 7;
/** ...and never less than this from now (a same-day or late assignment). */
export const MIN_TOKEN_DAYS_FROM_NOW = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** When a shift's confirm link expires: the service date + 7 days, and at least 7 days from now. */
export function tokenExpiryFor(serviceDate: string, now: Date = new Date()): Date {
  const afterService = Date.parse(`${serviceDate}T00:00:00Z`) + (TOKEN_DAYS_AFTER_SERVICE + 1) * MS_PER_DAY;
  const minimum = now.getTime() + MIN_TOKEN_DAYS_FROM_NOW * MS_PER_DAY;
  return new Date(Math.max(Number.isNaN(afterService) ? 0 : afterService, minimum));
}

export type ContactDetails = {
  preferredContactMethod: string | null;
  contactAllowed: boolean;
  email: string | null;
  phone: string | null;
};

export type ChannelChoice =
  | { ok: true; channel: "email" | "sms"; contact: string }
  | { ok: false; reason: "does_not_want_contact" | "no_contact_details" };

/**
 * SMS when the volunteer prefers it and has a phone; otherwise email; SMS as a
 * last resort when there's only a phone. "app" has no volunteer inbox yet, so
 * it falls back to email.
 */
export function chooseChannel(contact: ContactDetails): ChannelChoice {
  if (!contact.contactAllowed || contact.preferredContactMethod === "none") {
    return { ok: false, reason: "does_not_want_contact" };
  }
  const email = contact.email?.trim() || null;
  const phone = contact.phone?.trim() || null;
  if (contact.preferredContactMethod === "sms" && phone) return { ok: true, channel: "sms", contact: phone };
  if (email) return { ok: true, channel: "email", contact: email };
  if (phone) return { ok: true, channel: "sms", contact: phone };
  return { ok: false, reason: "no_contact_details" };
}

export type ShiftMessageInput = {
  kind: "assigned" | "reminder";
  volunteerName: string | null;
  roleName: string;
  planName: string;
  serviceDate: string;
  serviceTime: string | null;
  confirmUrl: string;
  /** An optional note from the scheduler, e.g. added to a reminder. */
  note?: string | null;
};

function formatDate(serviceDate: string) {
  return new Date(`${serviceDate}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatTime(serviceTime: string | null) {
  if (!serviceTime) return null;
  const [h, m] = serviceTime.split(":").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(2000, 0, 1, h || 0, m || 0)).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function buildShiftMessage(input: ShiftMessageInput): { subject: string; body: string } {
  const when = [formatDate(input.serviceDate), formatTime(input.serviceTime)].filter(Boolean).join(" at ");
  const greeting = input.volunteerName ? `Hi ${input.volunteerName.split(" ")[0]},` : "Hi,";
  const lead =
    input.kind === "assigned"
      ? `You've been scheduled to serve as ${input.roleName} for ${input.planName} on ${when}.`
      : `A reminder: you're scheduled to serve as ${input.roleName} for ${input.planName} on ${when}, and we haven't heard back yet.`;
  return {
    subject:
      input.kind === "assigned"
        ? `Please confirm: ${input.roleName} on ${formatDate(input.serviceDate)}`
        : `Reminder: please confirm ${input.roleName} on ${formatDate(input.serviceDate)}`,
    body: [
      greeting,
      lead,
      input.note?.trim() ? `A note from your team: ${input.note.trim()}` : null,
      `Please let us know if you can make it:\n${input.confirmUrl}`,
      "From that page you can also mark any dates you can't serve.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

/** What happened to the volunteer's notification, for the admin. */
export type NotificationOutcome =
  | { status: "sent"; channel: "email" | "sms" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export function describeNotification(outcome: NotificationOutcome): string {
  if (outcome.status === "sent") return outcome.channel === "sms" ? "Text sent." : "Email sent.";
  if (outcome.status === "skipped") return `Not notified: ${outcome.reason}`;
  return `Notification failed: ${outcome.reason}`;
}

export const SKIP_REASON_TEXT: Record<"does_not_want_contact" | "no_contact_details", string> = {
  does_not_want_contact: "they've asked not to be contacted.",
  no_contact_details: "no email or phone on file.",
};
