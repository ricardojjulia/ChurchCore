import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/send-email", () => ({ sendEmail: sendEmailMock }));

import { completeDonation, escapeHtml, postDonationToGl, sendDonationReceipt } from "@/lib/stripe/donation-completion";
import { fakeDb } from "@/lib/stripe/fake-db.testing";

type Row = Record<string, unknown>;

const MAPPING = { church_id: "church-1", fund_designation: "General", is_active: true, asset_account_id: "asset-1", income_account_id: "income-1" };
const pendingGift = (extra: Row = {}): Row => ({
  id: "don-1",
  church_id: "church-1",
  status: "pending",
  amount_cents: 2500,
  fund_designation: "General",
  donor_email: "maya@example.org",
  donor_name: "Maya",
  receipt_sent_at: null,
  completed_at: null,
  stripe_payment_intent_id: "pi_1",
  stripe_invoice_id: null,
  ...extra,
});

/** A db whose ledger function records each post, as the real one does once per gift. */
function dbWithLedger(seed: Record<string, Row[]>) {
  const db = fakeDb(seed);
  db.rpcs.post_donation_to_gl = (args) => {
    db.tables.donation_gl_posts ??= [];
    if (!db.tables.donation_gl_posts.some((p) => p.donation_id === args.p_donation_id)) {
      db.tables.donation_gl_posts.push({ donation_id: args.p_donation_id });
    }
    return { data: "posted" };
  };
  return db;
}

describe("donation completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmailMock.mockResolvedValue({ accepted: true });
  });

  it("escapes client-supplied donor names and fund labels in the receipt HTML (Council Review 22)", async () => {
    await sendDonationReceipt({
      to: "maya@example.org",
      donorName: `<a href="https://evil.example">Click</a>`,
      amountCents: 2500,
      fundDesignation: "<img src=x onerror=alert(1)>",
      donationId: "don-1",
      churchName: "Grace & Harbor",
    });

    const { html, idempotencyKey } = sendEmailMock.mock.calls[0][0] as { html: string; idempotencyKey: string };
    expect(html).not.toContain("<a href");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;");
    expect(html).toContain("Grace &amp; Harbor");
    expect(idempotencyKey).toBe("donation:don-1");
  });

  it("throws when the email provider refuses the receipt, so the caller can retry (G3.2)", async () => {
    sendEmailMock.mockResolvedValue({ accepted: false, error: "SendGrid 500" });
    await expect(
      sendDonationReceipt({ to: "a@example.org", donorName: null, amountCents: 100, fundDesignation: null, donationId: "don-1" }),
    ).rejects.toThrow(/SendGrid 500/);
  });

  it("escapeHtml covers the five HTML-significant characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  describe("postDonationToGl", () => {
    it("posts through the transactional database function, for this gift in this church", async () => {
      const db = fakeDb({});
      const calls: unknown[] = [];
      db.rpcs.post_donation_to_gl = (args) => (calls.push(args), { data: "posted" });
      await postDonationToGl(db.client, "don-1", "church-1");
      expect(calls).toEqual([{ p_donation_id: "don-1", p_church_id: "church-1" }]);
    });

    it("throws on a database error, so the caller can retry (G3.2)", async () => {
      const db = fakeDb({});
      db.rpcs.post_donation_to_gl = () => ({ error: { message: "deadlock detected" } });
      await expect(postDonationToGl(db.client, "don-1", "church-1")).rejects.toThrow(/deadlock/);
    });
  });

  describe("completeDonation (retry-safe, G3.2)", () => {
    it("marks the gift succeeded, posts it, sends the receipt, then writes the completion marker last", async () => {
      const db = dbWithLedger({ donations: [pendingGift()], giving_fund_accounts: [MAPPING], churches: [{ id: "church-1", name: "Grace Harbor" }] });

      expect(await completeDonation(db.client, "church-1", { paymentIntentId: "pi_1" })).toBe(true);

      const gift = db.tables.donations[0];
      expect(gift.status).toBe("succeeded");
      expect(gift.receipt_sent_at).toBeTruthy();
      expect(gift.completed_at).toBeTruthy();
      expect(db.tables.donation_gl_posts).toHaveLength(1);
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(sendEmailMock.mock.calls[0][0]).toMatchObject({ to: "maya@example.org", subject: "Thank you for your gift to Grace Harbor" });
    });

    it("leaves the gift incomplete when the receipt fails, releasing its claim, and a retry finishes it with one receipt", async () => {
      const db = dbWithLedger({ donations: [pendingGift()], giving_fund_accounts: [MAPPING], churches: [] });
      sendEmailMock.mockResolvedValueOnce({ accepted: false, error: "SendGrid 503" });

      await expect(completeDonation(db.client, "church-1", { id: "don-1" })).rejects.toThrow(/SendGrid 503/);
      expect(db.tables.donations[0]).toMatchObject({ status: "succeeded", receipt_claimed_at: null, receipt_sent_at: null, completed_at: null });

      expect(await completeDonation(db.client, "church-1", { id: "don-1" })).toBe(true);
      expect(db.tables.donations[0].receipt_sent_at).toBeTruthy();
      expect(db.tables.donations[0].completed_at).toBeTruthy();
      expect(sendEmailMock).toHaveBeenCalledTimes(2); // the refused attempt, then the one that went out
    });

    it("completes the gift without a receipt, and does not throw, when no email provider is configured (Council Review 42)", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const db = dbWithLedger({ donations: [pendingGift()], giving_fund_accounts: [MAPPING], churches: [] });
      sendEmailMock.mockResolvedValueOnce({ accepted: false, error: "provider_not_configured" });

      expect(await completeDonation(db.client, "church-1", { id: "don-1" })).toBe(true);
      expect(db.tables.donations[0]).toMatchObject({ receipt_claimed_at: null, receipt_sent_at: null });
      expect(db.tables.donations[0].completed_at).toBeTruthy();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("not configured"), { donationId: "don-1" });
      warn.mockRestore();
    });

    it("recovers when the send itself throws (a network error), not only when the provider refuses", async () => {
      const db = dbWithLedger({ donations: [pendingGift()], churches: [] });
      sendEmailMock.mockRejectedValueOnce(new Error("fetch failed"));
      await expect(completeDonation(db.client, "church-1", { id: "don-1" })).rejects.toThrow(/fetch failed/);
      expect(db.tables.donations[0].receipt_claimed_at).toBeNull();
      await completeDonation(db.client, "church-1", { id: "don-1" });
      expect(db.tables.donations[0].completed_at).toBeTruthy();
    });

    it("never completes a gift while another attempt holds the receipt: that one may still fail (PR #177 review)", async () => {
      const db = dbWithLedger({ donations: [pendingGift({ receipt_claimed_at: new Date().toISOString() })], churches: [] });
      await expect(completeDonation(db.client, "church-1", { id: "don-1" })).rejects.toThrow(/Another attempt/);
      expect(sendEmailMock).not.toHaveBeenCalled();
      expect(db.tables.donations[0].completed_at ?? null).toBeNull();
    });

    it("takes over a claim left by a worker that stopped, once its lease ran out", async () => {
      const stale = new Date(Date.now() - 10 * 60_000).toISOString();
      const db = dbWithLedger({ donations: [pendingGift({ receipt_claimed_at: stale })], churches: [] });
      await completeDonation(db.client, "church-1", { id: "don-1" });
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(db.tables.donations[0].completed_at).toBeTruthy();
    });

    it("sends no second receipt when a later caller finds the gift already receipted but not yet complete", async () => {
      const db = dbWithLedger({ donations: [pendingGift({ status: "succeeded", receipt_sent_at: "2026-10-02T00:00:00Z" })] });
      await completeDonation(db.client, "church-1", { id: "don-1" });
      expect(sendEmailMock).not.toHaveBeenCalled();
      expect(db.tables.donations[0].completed_at).toBeTruthy();
    });

    it("does nothing for a completed gift, and never completes a cancelled or refunded one", async () => {
      const db = dbWithLedger({
        donations: [
          pendingGift({ id: "done", status: "succeeded", completed_at: "2026-10-01T00:00:00Z" }),
          pendingGift({ id: "gone", status: "cancelled", stripe_payment_intent_id: "pi_2" }),
        ],
      });
      expect(await completeDonation(db.client, "church-1", { id: "done" })).toBe(true);
      expect(await completeDonation(db.client, "church-1", { id: "gone" })).toBe(false);
      expect(db.tables.donations[1].status).toBe("cancelled");
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("finds an installment by its invoice, turns a failed one succeeded when Stripe's retry succeeds, and stays in its church", async () => {
      const db = dbWithLedger({
        donations: [pendingGift({ status: "failed", stripe_invoice_id: "in_1", stripe_payment_intent_id: null, donor_email: null })],
      });
      expect(await completeDonation(db.client, "church-2", { invoiceId: "in_1" })).toBe(false);
      expect(await completeDonation(db.client, "church-1", { invoiceId: "in_1" }, { receiptEmailFallback: "anon@example.org" })).toBe(true);
      expect(db.tables.donations[0].status).toBe("succeeded");
      expect(sendEmailMock.mock.calls[0][0]).toMatchObject({ to: "anon@example.org" });
    });

    it("returns false when there's no such gift", async () => {
      const db = dbWithLedger({ donations: [] });
      expect(await completeDonation(db.client, "church-1", { paymentIntentId: "pi_missing" })).toBe(false);
    });
  });
});
