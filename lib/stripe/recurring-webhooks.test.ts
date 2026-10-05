import { beforeEach, describe, expect, it, vi } from "vitest";

// G3.2: each recurring installment becomes one donation (keyed by its
// invoice), completed retry-safely; a failed one is recorded and the donor
// told once; subscription events keep the gift in step, in order.

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/send-email", () => ({ sendEmail: sendEmailMock }));

import { fakeDb } from "@/lib/stripe/fake-db.testing";
import { handleInvoicePaid, handleInvoicePaymentFailed, syncRecurringGiftFromSubscription } from "@/lib/stripe/recurring-webhooks";

const GIFT = {
  id: "rg-1",
  church_id: "church-1",
  profile_id: "profile-1",
  fund_designation: "Missions",
  is_anonymous: false,
  status: "active",
  stripe_subscription_id: "sub_1",
  stripe_account_id: "acct_church1",
  stripe_customer_id: "cus_1",
  stripe_event_at: null,
};
const PROFILE = { id: "profile-1", church_id: "church-1", full_name: "Maya", email: "maya@example.org" };
const INVOICE = {
  id: "in_1",
  subscription: "sub_1",
  amount_paid: 2500,
  amount_due: 2500,
  currency: "usd",
  payment_intent: "pi_1",
  customer: "cus_1",
  lines: { data: [{ period: { end: 1_793_000_000 } }] },
};

function seed(gift: Record<string, unknown> = {}) {
  const db = fakeDb({ recurring_gifts: [{ ...GIFT, ...gift }], profiles: [PROFILE], churches: [{ id: "church-1", name: "Grace Harbor" }] });
  db.rpcs.post_donation_to_gl = () => ({ data: "unmapped" });
  return db;
}

describe("recurring gift webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmailMock.mockResolvedValue({ accepted: true });
  });

  describe("invoice.paid", () => {
    it("records the installment as a donation, completes it with a receipt, and moves the gift on", async () => {
      const db = seed({ status: "past_due" });
      await handleInvoicePaid(db.client, "church-1", INVOICE);

      expect(db.tables.donations).toHaveLength(1);
      expect(db.tables.donations[0]).toMatchObject({
        church_id: "church-1",
        profile_id: "profile-1",
        amount_cents: 2500,
        fund_designation: "Missions",
        is_recurring: true,
        recurring_gift_id: "rg-1",
        stripe_invoice_id: "in_1",
        stripe_account_id: "acct_church1",
        status: "succeeded",
      });
      expect(db.tables.donations[0].completed_at).toBeTruthy();
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(db.tables.recurring_gifts[0]).toMatchObject({ status: "active", next_payment_at: new Date(1_793_000_000 * 1000).toISOString() });
      expect(db.tables.recurring_gifts[0].last_payment_at).toBeTruthy();
    });

    it("records one donation and one receipt however often Stripe retries the event", async () => {
      const db = seed();
      await handleInvoicePaid(db.client, "church-1", INVOICE);
      await handleInvoicePaid(db.client, "church-1", INVOICE);
      expect(db.tables.donations).toHaveLength(1);
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
    });

    it("finishes the installment on a retry after a failure partway through", async () => {
      const db = seed();
      sendEmailMock.mockResolvedValueOnce({ accepted: false, error: "SendGrid 503" });
      await expect(handleInvoicePaid(db.client, "church-1", INVOICE)).rejects.toThrow(/SendGrid 503/);
      expect(db.tables.donations[0].completed_at ?? null).toBeNull();

      await handleInvoicePaid(db.client, "church-1", INVOICE);
      expect(db.tables.donations).toHaveLength(1);
      expect(db.tables.donations[0].completed_at).toBeTruthy();
    });

    it("keeps an anonymous gift's installment unlinked from the giver, while the receipt still reaches them", async () => {
      const db = seed({ is_anonymous: true });
      await handleInvoicePaid(db.client, "church-1", INVOICE);
      expect(db.tables.donations[0]).toMatchObject({ profile_id: null, donor_name: null, donor_email: null, is_anonymous: true });
      expect(sendEmailMock.mock.calls[0][0]).toMatchObject({ to: "maya@example.org" });
    });

    it("records nothing for a $0 invoice (a future-dated gift's trial) or a subscription that isn't a ChurchCore gift", async () => {
      const db = seed();
      await handleInvoicePaid(db.client, "church-1", { ...INVOICE, amount_paid: 0 });
      await handleInvoicePaid(db.client, "church-1", { ...INVOICE, id: "in_2", subscription: "sub_other" });
      expect(db.tables.donations ?? []).toHaveLength(0);
    });

    it("finds the gift only in the event's church", async () => {
      const db = seed();
      await handleInvoicePaid(db.client, "church-2", INVOICE);
      expect(db.tables.donations ?? []).toHaveLength(0);
    });

    it("never moves the payment dates back when an older invoice is replayed after a newer one (PR #177 review)", async () => {
      const db = seed();
      const NOVEMBER = { ...INVOICE, id: "in_nov", status_transitions: { paid_at: 1_793_500_000 }, lines: { data: [{ period: { end: 1_796_000_000 } }] } };
      const OCTOBER = { ...INVOICE, id: "in_oct", status_transitions: { paid_at: 1_791_000_000 }, lines: { data: [{ period: { end: 1_793_500_000 } }] } };
      await handleInvoicePaid(db.client, "church-1", NOVEMBER);
      await handleInvoicePaid(db.client, "church-1", OCTOBER);
      expect(db.tables.recurring_gifts[0]).toMatchObject({
        next_payment_at: new Date(1_796_000_000 * 1000).toISOString(),
        last_payment_at: new Date(1_793_500_000 * 1000).toISOString(),
      });
    });

    it("gives a cancelled gift no next payment date", async () => {
      const db = seed({ status: "cancelled", next_payment_at: null });
      await handleInvoicePaid(db.client, "church-1", INVOICE);
      expect(db.tables.recurring_gifts[0].next_payment_at).toBeNull();
    });

    it("leaves a paused gift paused", async () => {
      const db = seed({ status: "paused" });
      await handleInvoicePaid(db.client, "church-1", INVOICE);
      expect(db.tables.recurring_gifts[0].status).toBe("paused");
    });
  });

  describe("invoice.payment_failed", () => {
    it("records the failed installment, tells the donor once, and marks the gift past due", async () => {
      const db = seed();
      await handleInvoicePaymentFailed(db.client, "church-1", INVOICE);
      await handleInvoicePaymentFailed(db.client, "church-1", INVOICE); // Stripe retries the event

      expect(db.tables.donations).toHaveLength(1);
      expect(db.tables.donations[0]).toMatchObject({ status: "failed", stripe_invoice_id: "in_1" });
      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      expect(sendEmailMock.mock.calls[0][0]).toMatchObject({ to: "maya@example.org", subject: "Your recurring gift to Grace Harbor couldn't be processed", idempotencyKey: "recurring-failure:in_1" });
      expect(db.tables.recurring_gifts[0].status).toBe("past_due");
    });

    it("records nothing, and sends nothing, for a gift never set up or since cancelled", async () => {
      for (const status of ["incomplete", "cancelled"]) {
        const db = seed({ status });
        await handleInvoicePaymentFailed(db.client, "church-1", INVOICE);
        expect(db.tables.donations ?? []).toHaveLength(0);
        expect(db.tables.recurring_gifts[0].status).toBe(status);
      }
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("leaves the notice unsent, releases the claim and does not throw when no email provider is configured (Council Review 42)", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const db = seed();
      sendEmailMock.mockResolvedValueOnce({ accepted: false, error: "provider_not_configured" });
      await handleInvoicePaymentFailed(db.client, "church-1", INVOICE);
      expect(db.tables.donations[0]).toMatchObject({ failure_notice_claimed_at: null });
      expect(db.tables.donations[0].failure_notice_sent_at ?? null).toBeNull();
      expect(db.tables.recurring_gifts[0].status).toBe("past_due");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("not configured"), { invoiceId: "in_1" });
      warn.mockRestore();
    });

    it("sends the notice again on a retry when the first send was refused or threw", async () => {
      for (const failure of [() => sendEmailMock.mockResolvedValueOnce({ accepted: false, error: "SendGrid 503" }), () => sendEmailMock.mockRejectedValueOnce(new Error("fetch failed"))]) {
        vi.clearAllMocks();
        sendEmailMock.mockResolvedValue({ accepted: true });
        const db = seed();
        failure();
        await expect(handleInvoicePaymentFailed(db.client, "church-1", INVOICE)).rejects.toThrow();
        expect(db.tables.donations[0]).toMatchObject({ failure_notice_claimed_at: null });
        expect(db.tables.donations[0].failure_notice_sent_at ?? null).toBeNull();
        await handleInvoicePaymentFailed(db.client, "church-1", INVOICE);
        expect(db.tables.donations[0].failure_notice_sent_at).toBeTruthy();
      }
    });

    it("ignores a failure delivered after the same invoice was paid: the payment and the gift stand (PR #177 review)", async () => {
      const db = seed();
      await handleInvoicePaid(db.client, "church-1", INVOICE);
      await handleInvoicePaymentFailed(db.client, "church-1", INVOICE);
      expect(db.tables.donations).toHaveLength(1);
      expect(db.tables.donations[0].status).toBe("succeeded");
      expect(db.tables.recurring_gifts[0].status).toBe("active");
      expect(sendEmailMock).toHaveBeenCalledTimes(1); // only the receipt
    });

    it("turns the failed installment succeeded when Stripe's own retry is paid", async () => {
      const db = seed();
      await handleInvoicePaymentFailed(db.client, "church-1", INVOICE);
      await handleInvoicePaid(db.client, "church-1", INVOICE);
      expect(db.tables.donations).toHaveLength(1);
      expect(db.tables.donations[0].status).toBe("succeeded");
      expect(db.tables.recurring_gifts[0].status).toBe("active");
    });
  });

  describe("subscription events", () => {
    const at = (unix: number) => new Date(unix * 1000).toISOString();

    it("brings the gift's status and next payment in line with Stripe", async () => {
      const db = seed();
      await syncRecurringGiftFromSubscription(
        db.client,
        "church-1",
        { id: "sub_1", status: "active", pause_collection: { behavior: "void" }, current_period_end: 1_794_000_000 },
        1_790_000_000,
      );
      expect(db.tables.recurring_gifts[0]).toMatchObject({ status: "paused", next_payment_at: at(1_794_000_000), stripe_event_at: at(1_790_000_000) });
    });

    it("ignores an event older than the last one applied (Stripe doesn't deliver in order)", async () => {
      const db = seed({ status: "paused", stripe_event_at: at(1_790_000_100) });
      await syncRecurringGiftFromSubscription(db.client, "church-1", { id: "sub_1", status: "active" }, 1_790_000_000);
      expect(db.tables.recurring_gifts[0].status).toBe("paused");
    });

    it("leaves a gift whose card was never confirmed incomplete, even if Stripe calls it trialing (Council Review 38)", async () => {
      const db = seed({ status: "incomplete" });
      await syncRecurringGiftFromSubscription(db.client, "church-1", { id: "sub_1", status: "trialing", trial_end: 1_794_000_000 }, 1_790_000_000);
      expect(db.tables.recurring_gifts[0].status).toBe("incomplete");
    });

    it("never brings a cancelled gift back", async () => {
      const db = seed({ status: "cancelled" });
      await syncRecurringGiftFromSubscription(db.client, "church-1", { id: "sub_1", status: "active" }, 1_790_000_000);
      expect(db.tables.recurring_gifts[0].status).toBe("cancelled");
    });

    it("cancels the gift when Stripe deletes the subscription", async () => {
      const db = seed();
      await syncRecurringGiftFromSubscription(db.client, "church-1", { id: "sub_1", status: "canceled" }, 1_790_000_000);
      expect(db.tables.recurring_gifts[0]).toMatchObject({ status: "cancelled", next_payment_at: null });
      expect(db.tables.recurring_gifts[0].cancelled_at).toBeTruthy();
    });
  });
});
