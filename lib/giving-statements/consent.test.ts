import { describe, expect, it } from "vitest";

import type { DonorStatement } from "./build";
import { decideEmail, resolveConsent } from "./consent";
import { createFakeAdmin } from "./fake-admin.testutil";

function statement(overrides: Partial<DonorStatement>): DonorStatement {
  return {
    donorKey: "p:p1",
    profileId: "p1",
    name: "Pat",
    staffName: "Pat",
    email: "pat@x.org",
    lines: [],
    fundSubtotals: [],
    grandTotals: [],
    giftCount: 1,
    totalCents: 100,
    anonymousGiftCount: 0,
    ...overrides,
  };
}

describe("decideEmail", () => {
  it("emails a donor with an address, no opt-out and no suppression", () => {
    expect(decideEmail({ email: "a@b.c", profileId: "p", optedOut: false, suppression: null })).toEqual({ willEmail: true });
  });
  it("checks the address first", () => {
    expect(decideEmail({ email: " ", profileId: "p", optedOut: true, suppression: "bounce" })).toMatchObject({ reason: "no_email" });
    expect(decideEmail({ email: null, profileId: null, optedOut: false, suppression: null })).toMatchObject({ willEmail: false, reason: "no_email" });
  });
  it("opted out comes before suppressed", () => {
    expect(decideEmail({ email: "a@b.c", profileId: "p", optedOut: true, suppression: "bounce" })).toMatchObject({ reason: "opted_out" });
  });
  it("gives the suppression reason in words", () => {
    const reasons = { manual: "staff", unsubscribe: "unsubscribed", bounce: "bounced", complaint: "spam" } as const;
    for (const [reason, word] of Object.entries(reasons)) {
      const decision = decideEmail({ email: "a@b.c", profileId: null, optedOut: false, suppression: reason as keyof typeof reasons });
      expect(decision).toMatchObject({ willEmail: false, reason: "suppressed" });
      expect((decision as { detail: string }).detail).toContain(word);
    }
  });
  it("a guest has only the suppression check", () => {
    expect(decideEmail({ email: "g@b.c", profileId: null, optedOut: true, suppression: null })).toEqual({ willEmail: true });
  });
});

describe("resolveConsent", () => {
  const statements = [
    statement({}),
    statement({ donorKey: "p:p2", profileId: "p2", email: "opt@x.org" }),
    statement({ donorKey: "e:g@x.org", profileId: null, email: "g@x.org" }),
    statement({ donorKey: "p:p3", profileId: "p3", email: null }),
  ];

  it("reads preferences and suppressions in batch, scoped to the church", async () => {
    const { client, calls } = createFakeAdmin({
      notification_preferences: [
        { church_id: "c1", profile_id: "p2", email_opt_in: false },
        { church_id: "c1", profile_id: "p1", email_opt_in: true },
        { church_id: "other", profile_id: "p1", email_opt_in: false },
      ],
      communication_suppressions: [
        { id: "1", church_id: "c1", channel: "email", contact: "G@X.org", reason: "bounce" },
        { id: "2", church_id: "other", channel: "email", contact: "pat@x.org", reason: "manual" },
      ],
    });
    const result = await resolveConsent(client, "c1", statements);
    expect(result.get("p:p1")).toEqual({ willEmail: true });
    expect(result.get("p:p2")).toMatchObject({ reason: "opted_out" });
    expect(result.get("e:g@x.org")).toMatchObject({ reason: "suppressed" });
    expect(result.get("p:p3")).toMatchObject({ reason: "no_email" });
    expect(calls.every((c) => c.filters.some(([col, v]) => col === "church_id" && v === "c1"))).toBe(true);
  });

  it.each(["notification_preferences", "communication_suppressions"])("fails closed when %s cannot be read", async (table) => {
    const { client } = createFakeAdmin({}, { failOn: (op, t) => (t === table ? { message: "boom" } : undefined) });
    await expect(resolveConsent(client, "c1", statements)).rejects.toThrow(/boom/);
  });
});
