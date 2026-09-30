import { describe, expect, it } from "vitest";

import {
  buildShiftMessage,
  chooseChannel,
  describeNotification,
  SMS_NOTE_MAX,
  tokenExpiryFor,
} from "@/lib/volunteer-notifications";

const NOW = new Date("2026-10-01T15:00:00Z");

describe("tokenExpiryFor", () => {
  it("runs to the end of the service date + 7 days", () => {
    // A shift six weeks out: the old fixed 14 days would expire before the service.
    expect(tokenExpiryFor("2026-11-15", NOW).toISOString()).toBe("2026-11-23T00:00:00.000Z");
  });

  it("is never less than 7 days from now (a reminder for a shift that has already passed)", () => {
    expect(tokenExpiryFor("2026-09-25", NOW).toISOString()).toBe("2026-10-08T15:00:00.000Z");
  });

  it("falls back to 7 days from now, rather than throwing, for a malformed date (Council Review 24)", () => {
    expect(tokenExpiryFor("not-a-date", NOW, "America/New_York").getTime()).toBe(NOW.getTime() + 7 * 86_400_000);
  });

  it("ends at local midnight in the church's time zone (G1.6)", () => {
    // The end of Nov 22 in New York (EST) is 05:00 UTC on Nov 23.
    expect(tokenExpiryFor("2026-11-15", NOW, "America/New_York").toISOString()).toBe("2026-11-23T05:00:00.000Z");
  });
});

describe("chooseChannel", () => {
  const base = { preferredContactMethod: null, contactAllowed: true, email: "a@example.org", phone: "+15551230000" };

  it("uses SMS only when preferred and a phone exists; otherwise email", () => {
    expect(chooseChannel({ ...base, preferredContactMethod: "sms" })).toEqual({ ok: true, channel: "sms", contact: "+15551230000" });
    expect(chooseChannel({ ...base, preferredContactMethod: "sms", phone: null })).toEqual({
      ok: true,
      channel: "email",
      contact: "a@example.org",
    });
    expect(chooseChannel({ ...base, preferredContactMethod: "email" })).toMatchObject({ channel: "email" });
    expect(chooseChannel({ ...base, preferredContactMethod: "app" })).toMatchObject({ channel: "email" });
  });

  it("falls back to SMS when there's only a phone", () => {
    expect(chooseChannel({ ...base, email: "  " })).toEqual({ ok: true, channel: "sms", contact: "+15551230000" });
  });

  it("respects a request not to be contacted, and reports missing details", () => {
    expect(chooseChannel({ ...base, contactAllowed: false })).toEqual({ ok: false, reason: "does_not_want_contact" });
    expect(chooseChannel({ ...base, preferredContactMethod: "none" })).toEqual({ ok: false, reason: "does_not_want_contact" });
    expect(chooseChannel({ ...base, email: null, phone: null })).toEqual({ ok: false, reason: "no_contact_details" });
  });
});

describe("buildShiftMessage", () => {
  const input = {
    volunteerName: "Maya Martinez",
    roleName: "Greeter",
    planName: "Sunday Worship",
    serviceDate: "2026-10-11",
    serviceTime: "10:00:00",
    confirmUrl: "https://app.example/portal/volunteer/confirm/tok",
    churchName: "Grace Harbor",
    channel: "email" as const,
  };

  it("writes a plain assignment message with the church, role, plan, date, time and link", () => {
    const message = buildShiftMessage({ ...input, kind: "assigned" });
    expect(message.subject).toBe("Grace Harbor: please confirm Greeter on Sunday, October 11");
    expect(message.body).toContain("Hi Maya,");
    expect(message.body).toContain(
      "Grace Harbor has scheduled you to serve as Greeter for Sunday Worship on Sunday, October 11 at 10:00 AM",
    );
    expect(message.body).toContain(input.confirmUrl);
  });

  it("writes a reminder, and copes with no name or service time", () => {
    const message = buildShiftMessage({ ...input, kind: "reminder", volunteerName: null, serviceTime: null });
    expect(message.subject).toBe("Grace Harbor: reminder to confirm Greeter on Sunday, October 11");
    expect(message.body).toMatch(/^Hi,/);
    expect(message.body).toContain("on Sunday, October 11, and we haven't heard back yet.");
    expect(message.body).not.toContain("A note from your team");
  });

  it("includes the scheduler's note when there is one", () => {
    const message = buildShiftMessage({ ...input, kind: "reminder", note: "  Please arrive 20 minutes early.  " });
    expect(message.body).toContain("A note from your team: Please arrive 20 minutes early.");
  });

  it("keeps a text message short: church first, a capped note, and the link (Council Review 23)", () => {
    const longNote = "x".repeat(300);
    const message = buildShiftMessage({ ...input, kind: "assigned", channel: "sms", note: longNote });
    expect(message.body).toMatch(/^Grace Harbor: you're scheduled as Greeter, Sunday, October 11 at 10:00 AM\./);
    expect(message.body).toContain(`Note: ${"x".repeat(SMS_NOTE_MAX - 1)}…`);
    expect(message.body).toContain(input.confirmUrl);
    // Two SMS segments (2 × 153 characters) with room for a long link.
    expect(message.body.length).toBeLessThanOrEqual(306);
  });
});

describe("describeNotification", () => {
  it("summarises the outcome for the admin", () => {
    expect(describeNotification({ status: "sent", channel: "email" })).toBe("Email sent.");
    expect(describeNotification({ status: "sent", channel: "sms" })).toBe("Text sent.");
    expect(describeNotification({ status: "sent", channel: "email", fallback: "they haven't opted in to texts" })).toBe(
      "Emailed instead (they haven't opted in to texts).",
    );
    expect(describeNotification({ status: "skipped", reason: "no email or phone on file." })).toBe(
      "Not notified: no email or phone on file.",
    );
  });
});
