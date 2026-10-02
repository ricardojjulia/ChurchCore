import { beforeEach, describe, expect, it, vi } from "vitest";

// S8: members have no INSERT/UPDATE policy on donations, so these actions
// write through a server-side-scoped admin client, and a gift's row is written
// before Stripe is called. Tests use realistic ids: the login id is never the
// church profile id (S7).

const {
  revalidatePathMock,
  requireChurchSessionMock,
  createPaymentIntentMock,
  createOrGetStripeCustomerMock,
  cancelStripeSubscriptionMock,
  retrievePaymentIntentStatusMock,
  cancelPaymentIntentMock,
  onlineGivingNoticeMock,
  postDonationToGlMock,
  sendDonationReceiptMock,
  tableResults,
  calls,
} = vi.hoisted(() => {
  const tableResults = new Map<string, Array<{ data?: unknown; error?: unknown }>>();
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  return {
    revalidatePathMock: vi.fn(),
    requireChurchSessionMock: vi.fn(),
    createPaymentIntentMock: vi.fn(),
    createOrGetStripeCustomerMock: vi.fn(),
    cancelStripeSubscriptionMock: vi.fn(),
    retrievePaymentIntentStatusMock: vi.fn(),
    cancelPaymentIntentMock: vi.fn(),
    onlineGivingNoticeMock: vi.fn(),
    postDonationToGlMock: vi.fn(),
    sendDonationReceiptMock: vi.fn(),
    tableResults,
    calls,
  };
});

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/auth", () => ({ requireChurchSession: requireChurchSessionMock }));
vi.mock("@/lib/stripe/donations", () => ({
  createPaymentIntent: createPaymentIntentMock,
  createOrGetStripeCustomer: createOrGetStripeCustomerMock,
  cancelStripeSubscription: cancelStripeSubscriptionMock,
  retrievePaymentIntentStatus: retrievePaymentIntentStatusMock,
  cancelPaymentIntent: cancelPaymentIntentMock,
  onlineGivingNotice: onlineGivingNoticeMock,
}));
vi.mock("@/lib/stripe/donation-completion", () => ({
  postDonationToGl: postDonationToGlMock,
  sendDonationReceipt: sendDonationReceiptMock,
}));
vi.mock("@/lib/supabase/tenant", () => {
  function next(table: string) {
    const queue = tableResults.get(table) ?? [];
    return Promise.resolve(queue.shift() ?? { data: null, error: null });
  }
  function builder(table: string) {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "insert", "update"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      };
    }
    chain.single = () => next(table);
    chain.maybeSingle = () => next(table);
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => next(table).then(resolve, reject);
    return chain;
  }
  return { createTenantAdminClient: vi.fn(() => ({ from: (table: string) => builder(table) })) };
});

import {
  cancelPendingDonationAction,
  cancelRecurringDonationAction,
  confirmDonationAction,
  initiateDonationAction,
} from "@/app/app/donations-actions";

const SESSION = {
  userId: "login-1",
  churchProfileId: "profile-1",
  profile: { id: "login-1" },
  appContext: { roleId: "member", church: { id: "church-1", name: "Grace Harbor" } },
};

function queue(table: string, ...results: Array<{ data?: unknown; error?: unknown }>) {
  tableResults.set(table, [...(tableResults.get(table) ?? []), ...results]);
}

const methodCalls = (method: string) => calls.filter((c) => c.method === method);

describe("donations actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResults.clear();
    calls.length = 0;
    requireChurchSessionMock.mockResolvedValue(SESSION);
    createPaymentIntentMock.mockResolvedValue({ clientSecret: "pi_secret", paymentIntentId: "pi_123", isStub: false });
    createOrGetStripeCustomerMock.mockResolvedValue("cus_1");
    retrievePaymentIntentStatusMock.mockResolvedValue("succeeded");
    onlineGivingNoticeMock.mockReturnValue(null);
    postDonationToGlMock.mockResolvedValue(undefined);
    sendDonationReceiptMock.mockResolvedValue(undefined);
  });

  describe("initiateDonationAction", () => {
    it("writes the pending row before creating the PaymentIntent, then links them", async () => {
      queue("donations", { data: { id: "don-1" }, error: null }, { error: null });

      const result = await initiateDonationAction({
        amountCents: 2500,
        fundDesignation: "General",
        donorEmail: "maya@example.org",
        donorName: "Maya",
      });

      expect(result).toEqual({ ok: true, clientSecret: "pi_secret", donationId: "don-1", paymentIntentId: "pi_123", isStub: false });
      const [insert] = methodCalls("insert");
      expect(insert.args[0]).toMatchObject({
        church_id: "church-1",
        profile_id: "profile-1",
        amount_cents: 2500,
        status: "pending",
      });
      expect(insert.args[0]).not.toHaveProperty("stripe_payment_intent_id");
      // The PaymentIntent carries our row id, and the row is linked after.
      expect(createPaymentIntentMock).toHaveBeenCalledWith(expect.objectContaining({ donationId: "don-1", churchId: "church-1" }));
      expect(methodCalls("update")[0].args[0]).toEqual({ stripe_payment_intent_id: "pi_123", stripe_customer_id: "cus_1" });
    });

    it("keeps an anonymous gift unlinked from the donor", async () => {
      queue("donations", { data: { id: "don-2" }, error: null }, { error: null });

      await initiateDonationAction({ amountCents: 1000, isAnonymous: true, donorEmail: "x@example.org", donorName: "X" });

      expect(methodCalls("insert")[0].args[0]).toMatchObject({
        profile_id: null,
        donor_name: null,
        donor_email: null,
        is_anonymous: true,
      });
      expect(createOrGetStripeCustomerMock).not.toHaveBeenCalled();
    });

    it("marks the row failed, and says so, when Stripe fails", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      createPaymentIntentMock.mockRejectedValueOnce(new Error("card_declined"));
      queue("donations", { data: { id: "don-3" }, error: null }, { error: null });

      const result = await initiateDonationAction({ amountCents: 1000 });

      expect(result).toEqual({ ok: false, error: "Couldn't start the payment. Please try again." });
      expect(methodCalls("update")[0].args[0]).toMatchObject({ status: "failed" });
      errorSpy.mockRestore();
    });

    it("never calls Stripe when the row can't be written", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      queue("donations", { data: null, error: { message: "boom" } });

      expect(await initiateDonationAction({ amountCents: 1000 })).toEqual({
        ok: false,
        error: "Couldn't start your gift. Please try again.",
      });
      expect(createPaymentIntentMock).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("writes nothing and calls no Stripe API when online giving is off (production without keys, or no card form yet)", async () => {
      const notice = "Online card giving isn't available yet. Please give in person or contact the church office.";
      onlineGivingNoticeMock.mockReturnValue(notice);

      expect(await initiateDonationAction({ amountCents: 1000 })).toEqual({ ok: false, error: notice });
      expect(methodCalls("insert")).toHaveLength(0);
      expect(createPaymentIntentMock).not.toHaveBeenCalled();
      expect(createOrGetStripeCustomerMock).not.toHaveBeenCalled();
    });

    it("rejects invalid amounts and people with no profile in this church", async () => {
      for (const amountCents of [0, -5, 12.5, 10_000_001]) {
        expect(await initiateDonationAction({ amountCents })).toMatchObject({ ok: false });
      }
      requireChurchSessionMock.mockResolvedValue({ ...SESSION, churchProfileId: null });
      expect(await initiateDonationAction({ amountCents: 1000 })).toEqual({
        ok: false,
        error: "Your account has no profile in this church.",
      });
      expect(methodCalls("insert")).toHaveLength(0);
    });
  });

  describe("confirmDonationAction", () => {
    it("marks the gift succeeded only when Stripe says so, only from pending, then posts it to the GL and sends the receipt", async () => {
      queue(
        "donations",
        { data: { profile_id: "profile-1" }, error: null },
        { data: [{ donor_email: "maya@example.org", donor_name: "Maya", amount_cents: 2500, fund_designation: "General" }], error: null },
        { error: null },
      );

      expect(await confirmDonationAction("don-1", "pi_123")).toEqual({ ok: true });

      expect(retrievePaymentIntentStatusMock).toHaveBeenCalledWith("pi_123");
      expect(calls).toEqual(
        expect.arrayContaining([
          { table: "donations", method: "eq", args: ["stripe_payment_intent_id", "pi_123"] },
          { table: "donations", method: "eq", args: ["status", "pending"] },
          { table: "donations", method: "eq", args: ["church_id", "church-1"] },
        ]),
      );
      expect(postDonationToGlMock).toHaveBeenCalledWith(expect.anything(), "don-1", "church-1", 2500, "General");
      expect(sendDonationReceiptMock).toHaveBeenCalledWith(
        expect.objectContaining({ to: "maya@example.org", donationId: "don-1", churchName: "Grace Harbor" }),
      );
    });

    it("returns an error, not a throw, when Stripe can't be reached", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      queue("donations", { data: { profile_id: "profile-1" }, error: null });
      retrievePaymentIntentStatusMock.mockRejectedValueOnce(new Error("network"));
      expect(await confirmDonationAction("don-1", "pi_123")).toEqual({
        ok: false,
        error: "Couldn't check your payment. Please try again.",
      });
      expect(methodCalls("update")).toHaveLength(0);
      errorSpy.mockRestore();
    });

    it("refuses when Stripe hasn't confirmed the payment", async () => {
      queue("donations", { data: { profile_id: "profile-1" }, error: null });
      retrievePaymentIntentStatusMock.mockResolvedValueOnce("requires_payment_method");
      expect(await confirmDonationAction("don-1", "pi_123")).toEqual({
        ok: false,
        error: "Your payment hasn't completed yet.",
      });
      expect(methodCalls("update")).toHaveLength(0);
    });

    it("does nothing more when the webhook already confirmed it", async () => {
      queue("donations", { data: { profile_id: "profile-1" }, error: null }, { data: [], error: null });
      expect(await confirmDonationAction("don-1", "pi_123")).toEqual({ ok: true });
      // The webhook won the update, so it posted and receipted; this call must not.
      expect(postDonationToGlMock).not.toHaveBeenCalled();
      expect(sendDonationReceiptMock).not.toHaveBeenCalled();
    });
  });

  describe("only the giver confirms or cancels a named gift (Council Review 34)", () => {
    it("refuses to confirm another member's gift, without asking Stripe", async () => {
      queue("donations", { data: { profile_id: "someone-else" }, error: null });

      expect(await confirmDonationAction("don-1", "pi_123")).toEqual({ ok: false, error: "This gift isn't yours to confirm." });
      expect(retrievePaymentIntentStatusMock).not.toHaveBeenCalled();
      expect(methodCalls("update")).toHaveLength(0);
    });

    it("refuses to cancel another member's gift, without touching Stripe", async () => {
      queue("donations", { data: { id: "don-1", profile_id: "someone-else" }, error: null });

      expect(await cancelPendingDonationAction("don-1", "pi_123")).toMatchObject({ ok: false, cancelled: false });
      expect(cancelPaymentIntentMock).not.toHaveBeenCalled();
    });

    it("fails closed when the gift can't be read, rather than treating it as anonymous (PR #172 review)", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      queue("donations", { data: null, error: { message: "connection reset" } });

      expect(await confirmDonationAction("don-1", "pi_123")).toEqual({ ok: false, error: "Couldn't check your gift. Please try again." });
      expect(retrievePaymentIntentStatusMock).not.toHaveBeenCalled();
      expect(methodCalls("update")).toHaveLength(0);
      errorSpy.mockRestore();
    });

    it("does nothing for ids that match no gift here", async () => {
      queue("donations", { data: null, error: null });
      expect(await confirmDonationAction("don-1", "pi_123")).toEqual({ ok: true });
      expect(retrievePaymentIntentStatusMock).not.toHaveBeenCalled();
    });

    it("lets an anonymous gift (no profile) be confirmed by whoever holds both ids", async () => {
      queue("donations", { data: { profile_id: null }, error: null }, { data: [], error: null });
      expect(await confirmDonationAction("don-1", "pi_123")).toEqual({ ok: true });
    });
  });

  describe("cancelPendingDonationAction (G3.0: a gift abandoned at the card step)", () => {
    it("cancels the PaymentIntent at Stripe, then the pending gift, matched by both ids in this church", async () => {
      queue("donations", { data: { id: "don-1", profile_id: "profile-1" }, error: null }, { data: null, error: null });
      cancelPaymentIntentMock.mockResolvedValue("canceled");

      expect(await cancelPendingDonationAction("don-1", "pi_123")).toEqual({ ok: true, cancelled: true });
      expect(cancelPaymentIntentMock).toHaveBeenCalledWith("pi_123");
      const lookup = calls.filter((c) => c.method === "eq").slice(0, 4).map((c) => c.args);
      expect(lookup).toEqual([
        ["id", "don-1"],
        ["church_id", "church-1"],
        ["stripe_payment_intent_id", "pi_123"],
        ["status", "pending"],
      ]);
      expect(methodCalls("update")[0].args[0]).toMatchObject({ status: "cancelled" });
    });

    it("does nothing, and never calls Stripe, when the ids don't match a pending gift here", async () => {
      queue("donations", { data: null, error: null });

      expect(await cancelPendingDonationAction("don-1", "pi_other")).toEqual({ ok: true, cancelled: false });
      expect(cancelPaymentIntentMock).not.toHaveBeenCalled();
      expect(methodCalls("update")).toHaveLength(0);
    });

    it("leaves the gift for the webhook when Stripe says it was paid after all", async () => {
      queue("donations", { data: { id: "don-1" }, error: null });
      cancelPaymentIntentMock.mockResolvedValue("succeeded");

      expect(await cancelPendingDonationAction("don-1", "pi_123")).toEqual({ ok: true, cancelled: false });
      expect(methodCalls("update")).toHaveLength(0);
    });

    it("returns an error, not a throw, when Stripe can't be reached", async () => {
      queue("donations", { data: { id: "don-1" }, error: null });
      cancelPaymentIntentMock.mockRejectedValue(new Error("network"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(await cancelPendingDonationAction("don-1", "pi_123")).toMatchObject({ ok: false, cancelled: false });
      expect(methodCalls("update")).toHaveLength(0);
      errorSpy.mockRestore();
    });
  });

  describe("cancelRecurringDonationAction", () => {
    it("cancels the member's own subscription and marks the row cancelled", async () => {
      queue("donations", { data: { stripe_subscription_id: "sub_1" }, error: null }, { error: null });

      expect(await cancelRecurringDonationAction("don-9")).toEqual({ ok: true });

      expect(cancelStripeSubscriptionMock).toHaveBeenCalledWith("sub_1");
      expect(calls).toEqual(
        expect.arrayContaining([{ table: "donations", method: "eq", args: ["profile_id", "profile-1"] }]),
      );
      expect(methodCalls("update")[0].args[0]).toMatchObject({ status: "cancelled" });
    });

    it("skips Stripe when the gift has no subscription id", async () => {
      queue("donations", { data: { stripe_subscription_id: null }, error: null }, { error: null });
      expect(await cancelRecurringDonationAction("don-9")).toEqual({ ok: true });
      expect(cancelStripeSubscriptionMock).not.toHaveBeenCalled();
    });

    it("refuses someone else's gift without touching Stripe", async () => {
      queue("donations", { data: null, error: null });
      expect(await cancelRecurringDonationAction("not-mine")).toEqual({
        ok: false,
        error: "That gift isn't yours to cancel.",
      });
      expect(cancelStripeSubscriptionMock).not.toHaveBeenCalled();
      expect(methodCalls("update")).toHaveLength(0);
    });
  });
});
