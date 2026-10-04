import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireChurchSessionMock, adminHolder, sendBatchMock, auditMock } = vi.hoisted(() => ({
  requireChurchSessionMock: vi.fn(),
  adminHolder: { client: null as unknown },
  sendBatchMock: vi.fn(),
  auditMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireChurchSession: requireChurchSessionMock }));
vi.mock("@/lib/supabase/tenant", () => ({ createTenantAdminClient: () => adminHolder.client }));
vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: auditMock }));
vi.mock("@/lib/giving-statements/send", () => ({ sendStatementBatch: sendBatchMock }));

import { createFakeAdmin, type Row } from "@/lib/giving-statements/fake-admin.testutil";

import { previewStatementsAction, sendStatementsAction } from "./statements-actions";

function sessionFor(roleId: string) {
  return {
    userId: "login-user-1",
    churchProfileId: "church-profile-9",
    appContext: { kind: "church", roleId, church: { id: "c1", name: "Grace", slug: "g", timezone: "America/New_York" } },
  };
}

const gift = (id: string, extra: Row): Row => ({
  id, church_id: "c1", profile_id: null, donor_name: null, donor_email: null, is_anonymous: false,
  amount_cents: 1000, currency: "usd", fund_designation: "General", status: "succeeded", created_at: "2025-05-01T12:00:00.000Z", ...extra,
});

function seedAdmin() {
  adminHolder.client = createFakeAdmin({
    donations: [
      gift("1", { profile_id: "p1" }),
      gift("2", { profile_id: "p2", is_anonymous: true, amount_cents: 777 }),
      gift("3", { profile_id: "p3" }),
      gift("4", { donor_email: "guest@x.org" }),
      gift("5", { is_anonymous: true }),
      gift("7", { is_anonymous: true, donor_email: "anon-guest@x.org", donor_name: "Anon Guest" }),
      gift("6", { profile_id: "p1", status: "refunded" }),
    ],
    profiles: [
      { id: "p1", church_id: "c1", full_name: "Pat Open", email: "pat@x.org" },
      { id: "p2", church_id: "c1", full_name: "Secret Quinn", email: "quinn-secret@x.org" },
      { id: "p3", church_id: "c1", full_name: "Rae Out", email: "rae@x.org" },
    ],
    notification_preferences: [{ church_id: "c1", profile_id: "p3", email_opt_in: false }],
    communication_suppressions: [{ id: "s", church_id: "c1", channel: "email", contact: "guest@x.org", reason: "bounce" }],
  }).client;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  requireChurchSessionMock.mockResolvedValue(sessionFor("church-admin"));
  sendBatchMock.mockResolvedValue({ donors: 3, sent: 2, skipped: { no_email: 0, opted_out: 1, suppressed: 0, already_sent: 0 }, skippedTotal: 1, failed: 0, unstatementable: 1, remaining: 0, complete: true });
  auditMock.mockResolvedValue(undefined);
  seedAdmin();
});

const NON_ADMIN = ["secretary", "pastor", "ministry-leader", "member"];

describe("previewStatementsAction", () => {
  it.each(NON_ADMIN)("denies %s", async (role) => {
    requireChurchSessionMock.mockResolvedValue(sessionFor(role));
    expect(await previewStatementsAction({ start: "2025-01-01", end: "2025-12-31" })).toEqual({ ok: false, error: expect.any(String) });
  });

  it("lets a signed-out caller's redirect through", async () => {
    requireChurchSessionMock.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(previewStatementsAction({})).rejects.toThrow("NEXT_REDIRECT");
  });

  it("rejects an invalid range without reading anything", async () => {
    const result = await previewStatementsAction({ start: "2025-12-31", end: "2025-01-01" });
    expect(result).toMatchObject({ ok: false });
  });

  it("returns counts, totals, reasons and the resolved range", async () => {
    const result = await previewStatementsAction({ start: "2025-01-01", end: "2025-12-31" });
    if (!result.ok) throw new Error(result.error);
    const { preview } = result;
    expect(preview.range).toEqual({ start: "2025-01-01", end: "2025-12-31" });
    expect(preview.donorCount).toBe(5);
    expect(preview.emailCount).toBe(3);
    expect(preview.skipCount).toBe(2);
    expect(preview.totalCents).toBe(3000); // named gifts only
    expect(preview.rows).toHaveLength(3);
    expect(preview.anonymous).toEqual({
      giftCount: 3,
      totalCents: 2777,
      totalsByCurrency: [{ currency: "usd", cents: 2777 }],
      onlyDonors: 2,
      onlyWillEmail: 2,
      onlySkipped: 0,
    });
    expect(preview.unstatementable).toEqual([expect.objectContaining({ giftId: "5", donor: "Anonymous", amountCents: 1000 })]);
    const byRef = Object.fromEntries(preview.rows.map((r) => [r.donorRef, r]));
    expect(byRef["p:p1"]).toMatchObject({ willEmail: true, reason: null, name: "Pat Open", giftCount: 1 });
    expect(byRef["p:p3"]).toMatchObject({ willEmail: false, reason: "opted_out" });
    const guest = preview.rows.find((r) => r.reason === "suppressed")!;
    expect(guest.reasonDetail).toContain("bounced");
  });

  it("anonymity holds against staff: no row, name, email, flag or count for anonymous-only donors", async () => {
    const result = await previewStatementsAction({ start: "2025-01-01", end: "2025-12-31" });
    if (!result.ok) throw new Error(result.error);
    expect(result.preview.rows.map((r) => r.donorRef).sort()).not.toContain("p:p2");
    const json = JSON.stringify(result);
    expect(json).not.toContain("Secret Quinn");
    expect(json).not.toContain("quinn-secret@x.org");
    expect(json).not.toContain("anon-guest@x.org");
    expect(json).not.toContain("Anon Guest");
    for (const row of result.preview.rows) {
      expect(Object.keys(row).join()).not.toMatch(/anonym|masked/i);
    }
    expect(json).not.toMatch(/allAnonymous|anonymousGiftCount|"masked"/);
  });

  it("a donor with named and anonymous gifts shows only the named ones, with no link to the anonymous gift", async () => {
    adminHolder.client = createFakeAdmin({
      donations: [gift("n", { profile_id: "p1", amount_cents: 600 }), gift("a", { profile_id: "p1", is_anonymous: true, amount_cents: 400 })],
      profiles: [{ id: "p1", church_id: "c1", full_name: "Pat Open", email: "pat@x.org" }],
    }).client;
    const result = await previewStatementsAction({ start: "2025-01-01", end: "2025-12-31" });
    if (!result.ok) throw new Error(result.error);
    expect(result.preview.rows).toEqual([expect.objectContaining({ name: "Pat Open", giftCount: 1, totalCents: 600, willEmail: true })]);
    expect(result.preview.totalCents).toBe(600);
    expect(result.preview.anonymous).toMatchObject({ giftCount: 1, totalCents: 400, onlyDonors: 0 });
    expect(result.preview.emailCount).toBe(1);
  });

  it("counts skipped anonymous-only donors in aggregate with no reasons", async () => {
    adminHolder.client = createFakeAdmin({
      donations: [gift("a", { profile_id: "p1", is_anonymous: true }), gift("b", { profile_id: "p2", is_anonymous: true })],
      profiles: [
        { id: "p1", church_id: "c1", full_name: "One", email: "one@x.org" },
        { id: "p2", church_id: "c1", full_name: "Two", email: null },
      ],
    }).client;
    const result = await previewStatementsAction({ start: "2025-01-01", end: "2025-12-31" });
    if (!result.ok) throw new Error(result.error);
    expect(result.preview).toMatchObject({ donorCount: 2, emailCount: 1, skipCount: 1, rows: [], totalCents: 0 });
    expect(result.preview.anonymous).toMatchObject({ onlyDonors: 2, onlyWillEmail: 1, onlySkipped: 1 });
    expect(JSON.stringify(result)).not.toMatch(/One|Two|no_email|No email/);
  });

  it("AC32: another church's gifts never appear in the preview", async () => {
    adminHolder.client = createFakeAdmin({
      donations: [
        gift("mine", { profile_id: "p1" }),
        gift("foreign", { church_id: "other", profile_id: "px", amount_cents: 99999 }),
        gift("foreign-unstatementable", { church_id: "other", amount_cents: 4242 }),
      ],
      profiles: [
        { id: "p1", church_id: "c1", full_name: "Pat Open", email: "pat@x.org" },
        { id: "px", church_id: "other", full_name: "Foreign Donor", email: "f@other.org" },
      ],
    }).client;
    const result = await previewStatementsAction({ start: "2025-01-01", end: "2025-12-31" });
    if (!result.ok) throw new Error(result.error);
    expect(result.preview).toMatchObject({ donorCount: 1, totalCents: 1000, unstatementable: [] });
    expect(JSON.stringify(result)).not.toContain("Foreign Donor");
  });

  it("defaults the range to last calendar year and sends nothing", async () => {
    const result = await previewStatementsAction();
    if (!result.ok) throw new Error(result.error);
    expect(result.preview.range.start).toMatch(/^\d{4}-01-01$/);
    expect(sendBatchMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("reports a friendly error when the data cannot be read", async () => {
    adminHolder.client = createFakeAdmin({}, { failOn: (_o, t) => (t === "donations" ? { message: "secret db detail" } : undefined) }).client;
    const result = await previewStatementsAction({ start: "2025-01-01", end: "2025-12-31" });
    expect(result).toEqual({ ok: false, error: expect.not.stringContaining("secret db detail") });
  });
});

describe("sendStatementsAction", () => {
  const input = { start: "2025-01-01", end: "2025-12-31", confirm: true };

  it.each(NON_ADMIN)("denies %s and sends nothing", async (role) => {
    requireChurchSessionMock.mockResolvedValue(sessionFor(role));
    expect(await sendStatementsAction(input)).toMatchObject({ ok: false });
    expect(sendBatchMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("lets a signed-out caller's redirect through", async () => {
    requireChurchSessionMock.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(sendStatementsAction(input)).rejects.toThrow("NEXT_REDIRECT");
  });

  it.each([false, undefined, "true", 1])("rejects confirm=%s", async (confirm) => {
    const result = await sendStatementsAction({ ...input, confirm: confirm as never });
    expect(result).toMatchObject({ ok: false });
    expect(sendBatchMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid range", async () => {
    expect(await sendStatementsAction({ start: "bad", end: "2025-12-31", confirm: true })).toMatchObject({ ok: false });
    expect(sendBatchMock).not.toHaveBeenCalled();
  });

  it("runs the batch and audits actor, church, range and counts only", async () => {
    const result = await sendStatementsAction(input);
    expect(result).toMatchObject({ ok: true, range: { start: "2025-01-01", end: "2025-12-31" }, summary: { sent: 2, failed: 0 } });
    expect(sendBatchMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "login-user-1" }), { start: "2025-01-01", end: "2025-12-31" });
    expect(auditMock).toHaveBeenCalledTimes(1);
    const audit = auditMock.mock.calls[0][0];
    expect(audit).toMatchObject({
      tableName: "giving_statements",
      actorId: "login-user-1", // login id, not church profile id
      churchId: "c1",
      actorRole: "church-admin",
      newValues: { action: "batch_send", start: "2025-01-01", end: "2025-12-31", sent: 2, failed: 0, skipped: { opted_out: 1 } },
    });
    expect(JSON.stringify(audit)).not.toMatch(/@|amount|cents/);
  });

  it("still returns the summary when the audit write fails", async () => {
    auditMock.mockRejectedValue(new Error("audit down"));
    expect(await sendStatementsAction(input)).toMatchObject({ ok: true });
  });

  it("reports a friendly error when the batch cannot start", async () => {
    sendBatchMock.mockRejectedValue(new Error("secret db detail"));
    const result = await sendStatementsAction(input);
    expect(result).toEqual({ ok: false, error: expect.not.stringContaining("secret db detail") });
    expect(auditMock).not.toHaveBeenCalled();
  });
});
