import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendWithSuppressionMock } = vi.hoisted(() => ({ sendWithSuppressionMock: vi.fn() }));
vi.mock("@/lib/communications/send-with-suppression", () => ({ sendWithSuppression: sendWithSuppressionMock }));
vi.mock("@/lib/supabase/tenant", () => ({ createTenantAdminClient: vi.fn() }));

import type { ChurchAppSession } from "@/lib/auth";

import { idempotencyKey } from "./build";
import { createFakeAdmin, type Row } from "./fake-admin.testutil";
import { STALE_CLAIM_MS, sendStatementBatch } from "./send";

const CHURCH = "church-1";
const range = { start: "2025-01-01", end: "2025-12-31" };

const session = {
  userId: "login-user-1",
  churchProfileId: "church-profile-9",
  appContext: { kind: "church", roleId: "church-admin", church: { id: CHURCH, name: "Grace", slug: "g", timezone: "America/New_York" } },
} as unknown as ChurchAppSession;

function donation(id: string, extra: Row = {}): Row {
  return {
    id,
    church_id: CHURCH,
    profile_id: null,
    donor_name: null,
    donor_email: null,
    is_anonymous: false,
    amount_cents: 2500,
    currency: "usd",
    fund_designation: "General",
    status: "succeeded",
    created_at: "2025-06-15T16:00:00.000Z",
    ...extra,
  };
}

function world(extra: Record<string, Row[]> = {}) {
  return {
    churches: [{ id: CHURCH, name: "Grace", legal_name: null, mailing_address: null, contact_email: null, contact_phone: null, website_url: null }],
    profiles: [
      { id: "p1", church_id: CHURCH, full_name: "Pat One", email: "pat@x.org" },
      { id: "p2", church_id: CHURCH, full_name: "Quinn Two", email: "quinn@x.org" },
      { id: "p3", church_id: CHURCH, full_name: "Rae Three", email: "rae@x.org" },
      { id: "p4", church_id: CHURCH, full_name: "No Email", email: null },
    ],
    donations: [
      donation("d1", { profile_id: "p1" }),
      donation("d2", { profile_id: "p2" }),
      donation("d3", { profile_id: "p3" }),
      donation("d4", { profile_id: "p4" }),
      donation("d5", { donor_email: "guest@x.org", donor_name: "Gus" }),
      donation("d6", { is_anonymous: true }),
      donation("d7", { profile_id: "p1", status: "refunded" }),
    ],
    notification_preferences: [{ church_id: CHURCH, profile_id: "p3", email_opt_in: false }],
    communication_suppressions: [],
    communication_logs: [],
    ...extra,
  };
}

const logs = (tables: Record<string, Row[]>) => tables.communication_logs;
const ok = { sent: true, skipped: false, provider: "sendgrid", externalId: "msg-1" };

beforeEach(() => {
  sendWithSuppressionMock.mockReset();
  sendWithSuppressionMock.mockResolvedValue(ok);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sendStatementBatch", () => {
  it("claims, sends and marks sent, with skip reasons and no amounts in the log", async () => {
    const { client, tables } = createFakeAdmin(world());
    const summary = await sendStatementBatch(session, range, { admin: client });

    expect(summary).toMatchObject({ donors: 5, sent: 3, failed: 0, skippedTotal: 2, unstatementable: 1 });
    expect(summary.skipped).toEqual({ no_email: 1, opted_out: 1, suppressed: 0, already_sent: 0 });
    expect(sendWithSuppressionMock).toHaveBeenCalledTimes(3);
    for (const [input] of sendWithSuppressionMock.mock.calls) {
      expect(input).toMatchObject({ channel: "email", recordLog: false });
      expect(input.session).toBe(session);
    }

    const rows = logs(tables);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toMatchObject({
        church_id: CHURCH,
        status: "sent",
        provider: "sendgrid",
        provider_message_id: "msg-1",
        body_preview: "Annual giving statement",
        sent_by: "church-profile-9", // the church profile id, not the login id
      });
      expect(JSON.stringify(row)).not.toMatch(/25\.00|2500/);
    }
    const keys = rows.map((r) => (r.segment_criteria as Row).statementKey);
    expect(keys).toContain(idempotencyKey(CHURCH, "p:p1", range));
    expect(keys).toContain(idempotencyKey(CHURCH, "e:guest@x.org", range));
    // No row names its recipient: Communications history would show it to
    // pastors and secretaries (Council Review 40). The send still carries the
    // profile id for consent and the unsubscribe link.
    expect(rows.every((r) => r.recipient_id === null)).toBe(true);
    expect(sendWithSuppressionMock).toHaveBeenCalledWith(expect.objectContaining({ recipientProfileId: "p1" }));
  });

  it("a second run emails nobody again (23505 becomes already_sent)", async () => {
    const { client, tables } = createFakeAdmin(world());
    await sendStatementBatch(session, range, { admin: client });
    sendWithSuppressionMock.mockClear();
    const again = await sendStatementBatch(session, range, { admin: client });
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
    expect(again).toMatchObject({ sent: 0, failed: 0 });
    expect(again.skipped.already_sent).toBe(3);
    expect(logs(tables)).toHaveLength(3);
  });

  it("a different range for the same donor is a separate send", async () => {
    const { client, tables } = createFakeAdmin(world());
    await sendStatementBatch(session, range, { admin: client });
    const other = await sendStatementBatch(session, { start: "2025-06-01", end: "2025-06-30" }, { admin: client });
    expect(other.sent).toBe(3);
    expect(logs(tables)).toHaveLength(6);
  });

  it("a provider failure for one donor does not abort the batch, uses a non-transient code, and is re-sent next run", async () => {
    const { client, tables } = createFakeAdmin(world());
    sendWithSuppressionMock.mockImplementation(async ({ recipientContact }: { recipientContact: string }) =>
      recipientContact === "quinn@x.org"
        ? { sent: false, skipped: false, error: "provider said no", errorCode: "timeout" }
        : ok,
    );
    const summary = await sendStatementBatch(session, range, { admin: client });
    expect(summary).toMatchObject({ sent: 2, failed: 1 });
    const failed = logs(tables).filter((r) => r.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].error_code).toBe("statement_send_failed");
    expect(["timeout", "rate_limited", "provider_unavailable", "network_error", "temporary_failure"]).not.toContain(failed[0].error_code);

    sendWithSuppressionMock.mockReset();
    sendWithSuppressionMock.mockResolvedValue(ok);
    const rerun = await sendStatementBatch(session, range, { admin: client });
    expect(rerun).toMatchObject({ sent: 1, failed: 0 });
    expect(rerun.skipped.already_sent).toBe(2);
    expect(sendWithSuppressionMock).toHaveBeenCalledTimes(1);
  });

  it("a thrown send error is a failed donor, not a crashed batch", async () => {
    const { client, tables } = createFakeAdmin(world());
    sendWithSuppressionMock.mockRejectedValueOnce(new Error("UNSUBSCRIBE_SECRET must be configured"));
    const summary = await sendStatementBatch(session, range, { admin: client });
    expect(summary).toMatchObject({ sent: 2, failed: 1 });
    expect(logs(tables).filter((r) => r.status === "failed")[0].error_code).toBe("statement_send_failed");
  });

  it("maps send-time suppression and opt-out skips to non-blocking statuses", async () => {
    const { client, tables } = createFakeAdmin(world());
    sendWithSuppressionMock.mockImplementation(async ({ recipientContact }: { recipientContact: string }) => {
      if (recipientContact === "pat@x.org") return { sent: false, skipped: true, skipCode: "suppressed", skipReason: "suppressed (bounce)" };
      if (recipientContact === "quinn@x.org") return { sent: false, skipped: true, skipCode: "opted_out", skipReason: "opted out" };
      return ok;
    });
    const summary = await sendStatementBatch(session, range, { admin: client });
    expect(summary).toMatchObject({ sent: 1, failed: 0 });
    expect(summary.skipped).toMatchObject({ suppressed: 1, opted_out: 2 });
    const statuses = logs(tables).map((r) => r.status).sort();
    expect(statuses).toEqual(["sent", "suppressed", "unsubscribed"]);
    // Neither blocks a later claim.
    sendWithSuppressionMock.mockReset();
    sendWithSuppressionMock.mockResolvedValue(ok);
    const again = await sendStatementBatch(session, range, { admin: client });
    expect(again.sent).toBe(2);
    expect(again.skipped.already_sent).toBe(1);
  });

  it("skips donors at consent time without claiming or sending", async () => {
    const { client, tables } = createFakeAdmin(
      world({ communication_suppressions: [{ id: "s1", church_id: CHURCH, channel: "email", contact: "PAT@x.org", reason: "unsubscribe" }] }),
    );
    const summary = await sendStatementBatch(session, range, { admin: client });
    expect(summary.skipped).toEqual({ no_email: 1, opted_out: 1, suppressed: 1, already_sent: 0 });
    expect(logs(tables).map((r) => (r.segment_criteria as Row).statementKey)).not.toContain(idempotencyKey(CHURCH, "p:p1", range));
  });

  describe("stale claims", () => {
    const key = idempotencyKey(CHURCH, "p:p1", range);
    const claimRow = (status: string, createdAt: string): Row => ({
      id: "old-claim",
      church_id: CHURCH,
      status,
      created_at: createdAt,
      segment_criteria: { statementKey: key },
    });
    const onlyP1 = (extra: Row[]) =>
      world({ donations: [donation("d1", { profile_id: "p1" })], communication_logs: extra });

    it("fails a sending claim older than 15 minutes with statement_claim_stale, then re-claims and sends", async () => {
      const t = Date.parse("2026-01-10T12:00:00Z");
      const old = new Date(t - STALE_CLAIM_MS - 1000).toISOString();
      const { client, tables } = createFakeAdmin(onlyP1([claimRow("sending", old)]), { now: () => t });
      const summary = await sendStatementBatch(session, range, { admin: client, now: () => t });
      expect(summary).toMatchObject({ sent: 1, failed: 0 });
      const stale = logs(tables).find((r) => r.id === "old-claim")!;
      expect(stale).toMatchObject({ status: "failed", error_code: "statement_claim_stale" });
      expect(logs(tables).filter((r) => r.status === "sent")).toHaveLength(1);
    });

    it("leaves a fresh sending claim alone", async () => {
      const t = Date.parse("2026-01-10T12:00:00Z");
      const fresh = new Date(t - 60_000).toISOString();
      const { client, tables } = createFakeAdmin(onlyP1([claimRow("sending", fresh)]), { now: () => t });
      const summary = await sendStatementBatch(session, range, { admin: client, now: () => t });
      expect(summary.skipped.already_sent).toBe(1);
      expect(sendWithSuppressionMock).not.toHaveBeenCalled();
      expect(logs(tables)[0].status).toBe("sending");
    });

    it("never re-claims a sent row, however old", async () => {
      const { client } = createFakeAdmin(onlyP1([claimRow("sent", "2020-01-01T00:00:00.000Z")]));
      const summary = await sendStatementBatch(session, range, { admin: client });
      expect(summary.skipped.already_sent).toBe(1);
      expect(sendWithSuppressionMock).not.toHaveBeenCalled();
    });
  });

  it("AC11/AC12: the batch email carries the donor's own anonymous gift, as text and HTML, with no attachment", async () => {
    const { client } = createFakeAdmin(
      world({
        donations: [
          donation("a1", { profile_id: "p1", amount_cents: 1000 }),
          donation("a2", { profile_id: "p1", amount_cents: 777, is_anonymous: true, fund_designation: "Missions" }),
        ],
      }),
    );
    await sendStatementBatch(session, range, { admin: client });
    expect(sendWithSuppressionMock).toHaveBeenCalledTimes(1);
    const [input] = sendWithSuppressionMock.mock.calls[0];
    expect(input.body).toContain("$7.77");
    expect(input.body).toContain("Missions");
    expect(input.body).toContain("$17.77"); // the grand total counts the anonymous gift
    expect(input.html).toContain("$7.77");
    expect(Object.keys(input)).not.toContain("attachments");
    expect(Object.keys(input)).not.toContain("attachment");
  });

  it("AC32: another church's gifts and consent rows never reach this church's batch", async () => {
    const { client, tables } = createFakeAdmin(
      world({
        donations: [
          donation("mine", { profile_id: "p1" }),
          donation("foreign", { church_id: "other-church", profile_id: "p2" }),
          donation("foreign-guest", { church_id: "other-church", donor_email: "foreign@x.org" }),
        ],
      }),
    );
    const summary = await sendStatementBatch(session, range, { admin: client });
    expect(summary).toMatchObject({ donors: 1, sent: 1 });
    expect(logs(tables).every((r) => r.church_id === CHURCH)).toBe(true);
    expect(sendWithSuppressionMock.mock.calls.map(([i]) => i.recipientContact)).toEqual(["pat@x.org"]);
  });

  it("stores a hashed key for a guest: no raw email in any claim row", async () => {
    const { client, tables } = createFakeAdmin(world());
    await sendStatementBatch(session, range, { admin: client });
    expect(JSON.stringify(logs(tables))).not.toMatch(/guest@x\.org|@/);
    expect(logs(tables).map((r) => (r.segment_criteria as Row).statementKey)).toContain(idempotencyKey(CHURCH, "e:guest@x.org", range));
  });

  describe("time budget", () => {
    function manyDonors(n: number) {
      return world({
        profiles: Array.from({ length: n }, (_, i) => ({ id: `m${i}`, church_id: CHURCH, full_name: `Donor ${i}`, email: `d${i}@x.org` })),
        donations: Array.from({ length: n }, (_, i) => donation(`md${i}`, { profile_id: `m${i}` })),
        notification_preferences: [],
      });
    }

    it("stops claiming new donors after the budget, reports remaining, and a re-run continues idempotently", async () => {
      const { client } = createFakeAdmin(manyDonors(12));
      let t = 0;
      sendWithSuppressionMock.mockImplementation(async () => {
        t += 30_000; // each send is slow
        return ok;
      });
      const first = await sendStatementBatch(session, range, { admin: client, now: () => t });
      expect(first).toMatchObject({ donors: 12, sent: 5, complete: false, remaining: 7, failed: 0 });

      t = 0;
      sendWithSuppressionMock.mockClear();
      sendWithSuppressionMock.mockResolvedValue(ok);
      const second = await sendStatementBatch(session, range, { admin: client, now: () => t });
      expect(second).toMatchObject({ sent: 7, complete: true, remaining: 0 });
      expect(second.skipped.already_sent).toBe(5);
      expect(sendWithSuppressionMock).toHaveBeenCalledTimes(7);
    });

    it("is complete with remaining 0 inside the budget", async () => {
      const { client } = createFakeAdmin(manyDonors(12));
      const summary = await sendStatementBatch(session, range, { admin: client, now: () => 0 });
      expect(summary).toMatchObject({ sent: 12, complete: true, remaining: 0 });
    });

    it("honors an injected budget", async () => {
      const { client } = createFakeAdmin(manyDonors(12));
      let t = 0;
      sendWithSuppressionMock.mockImplementation(async () => {
        t += 1000;
        return ok;
      });
      const summary = await sendStatementBatch(session, range, { admin: client, now: () => t, budgetMs: 4000 });
      expect(summary).toMatchObject({ complete: false, remaining: 7 });
    });
  });

  describe("a holder that left the index", () => {
    it("retries the claim once when the unique violation has no indexed holder", async () => {
      let inserts = 0;
      const { client, tables } = createFakeAdmin(world({ donations: [donation("d1", { profile_id: "p1" })] }), {
        failOn: (op, table) => {
          if (op === "insert" && table === "communication_logs" && ++inserts === 1) return { message: "dup", code: "23505" };
          return undefined;
        },
      });
      const summary = await sendStatementBatch(session, range, { admin: client });
      expect(summary).toMatchObject({ sent: 1, failed: 0 });
      expect(summary.skipped.already_sent).toBe(0);
      expect(logs(tables).filter((r) => r.status === "sent")).toHaveLength(1);
    });

    it("gives up as already_sent if the retry also collides", async () => {
      const { client } = createFakeAdmin(world({ donations: [donation("d1", { profile_id: "p1" })] }), {
        failOn: (op, table) => (op === "insert" && table === "communication_logs" ? { message: "dup", code: "23505" } : undefined),
      });
      const summary = await sendStatementBatch(session, range, { admin: client });
      expect(summary.skipped.already_sent).toBe(1);
      expect(sendWithSuppressionMock).not.toHaveBeenCalled();
    });
  });

  it("scopes every query to the church", async () => {
    const { client, calls } = createFakeAdmin(world());
    await sendStatementBatch(session, range, { admin: client });
    for (const call of calls) {
      const scoped = call.filters.some(([col, v]) => (col === "church_id" || (call.table === "churches" && col === "id")) && v === CHURCH);
      const insertScoped = call.op === "insert" && call.payload?.church_id === CHURCH;
      expect(scoped || insertScoped, `${call.op} ${call.table}`).toBe(true);
    }
  });

  it("fails closed when donations cannot be read, sending nothing", async () => {
    const { client } = createFakeAdmin(world(), { failOn: (_op, table) => (table === "donations" ? { message: "db down" } : undefined) });
    await expect(sendStatementBatch(session, range, { admin: client })).rejects.toThrow(/db down/);
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
  });

  it("fails closed when consent cannot be read, sending nothing", async () => {
    const { client } = createFakeAdmin(world(), { failOn: (_op, table) => (table === "notification_preferences" ? { message: "no prefs" } : undefined) });
    await expect(sendStatementBatch(session, range, { admin: client })).rejects.toThrow(/no prefs/);
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
  });

  it("counts a claim write error as a failed donor and sends nothing for them", async () => {
    const { client } = createFakeAdmin(world(), {
      failOn: (op, table) => (op === "insert" && table === "communication_logs" ? { message: "disk full" } : undefined),
    });
    const summary = await sendStatementBatch(session, range, { admin: client });
    expect(summary).toMatchObject({ sent: 0, failed: 3 });
    expect(sendWithSuppressionMock).not.toHaveBeenCalled();
  });
});
