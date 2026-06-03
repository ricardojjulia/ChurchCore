import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  createTenantAdminClientMock,
  getStripeWebhookSecretMock,
  sendEmailMock,
} = vi.hoisted(() => ({
  queryTenantLocalDbMock: vi.fn(),
  shouldUseLocalTenantFallbackMock: vi.fn(),
  createTenantAdminClientMock: vi.fn(),
  getStripeWebhookSecretMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
  createTenantAdminClient: createTenantAdminClientMock,
}));

vi.mock("@/lib/stripe/client", () => ({
  getStripeWebhookSecret: getStripeWebhookSecretMock,
}));

vi.mock("@/lib/notifications/send-email", () => ({
  sendEmail: sendEmailMock,
}));

import { POST as stripeWebhookPost } from "@/app/api/webhooks/stripe/route";

describe("stripe webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    getStripeWebhookSecretMock.mockReturnValue(null);
    queryTenantLocalDbMock.mockResolvedValue({ rows: [] });
    sendEmailMock.mockResolvedValue(undefined);
  });

  it("reconciles event registration payment as paid on payment_intent.succeeded", async () => {
    const response = await stripeWebhookPost(
      new NextRequest("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify({
          type: "payment_intent.succeeded",
          data: {
            object: {
              id: "pi_reg_1",
              amount: 4500,
              currency: "usd",
              metadata: {
                church_id: "church-1",
                event_registration_id: "reg-1",
              },
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.event_registrations"),
      ["reg-1", "church-1", "pi_reg_1", 4500],
    );
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.event_registration_payments"),
      ["reg-1", "church-1", "pi_reg_1", 4500, "usd"],
    );
  });

  it("reconciles event registration payment by intent id when metadata omits registration id", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ registration_id: "reg-by-intent" }] })
      .mockResolvedValue({ rows: [] });

    const response = await stripeWebhookPost(
      new NextRequest("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify({
          type: "payment_intent.succeeded",
          data: {
            object: {
              id: "pi_lookup_1",
              amount: 4500,
              currency: "usd",
              metadata: {
                church_id: "church-1",
              },
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("where payment_intent_id = $1"),
      ["pi_lookup_1", "church-1"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.event_registrations"),
      ["reg-by-intent", "church-1", "pi_lookup_1", 4500],
    );
  });

  it("reconciles event registration payment as failed on payment_intent.payment_failed", async () => {
    const response = await stripeWebhookPost(
      new NextRequest("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify({
          type: "payment_intent.payment_failed",
          data: {
            object: {
              id: "pi_reg_2",
              metadata: {
                church_id: "church-1",
                registration_id: "reg-2",
              },
              last_payment_error: {
                code: "card_declined",
                message: "Card was declined.",
              },
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.event_registrations"),
      ["reg-2", "church-1", "pi_reg_2"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.event_registration_payments"),
      ["reg-2", "church-1", "pi_reg_2", "card_declined", "Card was declined."],
    );
  });

  it("reconciles failed event registration payment by intent id", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ registration_id: "reg-failed-by-intent" }] })
      .mockResolvedValue({ rows: [] });

    const response = await stripeWebhookPost(
      new NextRequest("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify({
          type: "payment_intent.payment_failed",
          data: {
            object: {
              id: "pi_failed_lookup_1",
              metadata: {
                church_id: "church-1",
              },
              last_payment_error: {
                code: "expired_card",
                message: "Card expired.",
              },
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("where payment_intent_id = $1"),
      ["pi_failed_lookup_1", "church-1"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.event_registrations"),
      ["reg-failed-by-intent", "church-1", "pi_failed_lookup_1"],
    );
  });

  describe("charge.refunded", () => {
    it("processes full charge.refunded and sets refunded status", async () => {
      // Default mock returns { rows: [] } — idempotency check finds nothing, updates succeed.
      const response = await stripeWebhookPost(
        new NextRequest("http://localhost/api/webhooks/stripe", {
          method: "POST",
          body: JSON.stringify({
            type: "charge.refunded",
            data: {
              object: {
                payment_intent: "pi_ch_full_1",
                amount: 5000,
                amount_refunded: 5000,
                metadata: {
                  church_id: "church-1",
                  event_registration_id: "reg-1",
                },
                refunds: {
                  data: [{ id: "re_ch_full_1", amount: 5000 }],
                },
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);

      // event_registrations updated to 'refunded'
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("update public.event_registrations"),
        ["reg-1", "refunded", "church-1"],
      );

      // event_registration_payments updated with refund_completed_at (SQL-side now())
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("update public.event_registration_payments"),
        ["reg-1", "refunded", "re_ch_full_1", 5000, "church-1"],
      );
    });

    it("processes partial charge.refunded and sets partially_refunded status", async () => {
      const response = await stripeWebhookPost(
        new NextRequest("http://localhost/api/webhooks/stripe", {
          method: "POST",
          body: JSON.stringify({
            type: "charge.refunded",
            data: {
              object: {
                payment_intent: "pi_ch_partial_1",
                amount: 5000,
                amount_refunded: 2000, // partial
                metadata: {
                  church_id: "church-1",
                  event_registration_id: "reg-2",
                },
                refunds: {
                  data: [{ id: "re_ch_partial_1", amount: 2000 }],
                },
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);

      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("update public.event_registrations"),
        ["reg-2", "partially_refunded", "church-1"],
      );
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("update public.event_registration_payments"),
        ["reg-2", "partially_refunded", "re_ch_partial_1", 2000, "church-1"],
      );
    });

    it("is idempotent when refund_id already stored", async () => {
      // First DB call is the idempotency check; returning a row causes early return.
      queryTenantLocalDbMock.mockResolvedValueOnce({
        rows: [{ registration_id: "reg-1" }],
      });

      const response = await stripeWebhookPost(
        new NextRequest("http://localhost/api/webhooks/stripe", {
          method: "POST",
          body: JSON.stringify({
            type: "charge.refunded",
            data: {
              object: {
                payment_intent: "pi_ch_idem_1",
                amount: 5000,
                amount_refunded: 5000,
                metadata: {
                  church_id: "church-1",
                  event_registration_id: "reg-1",
                },
                refunds: {
                  data: [{ id: "re_existing_1", amount: 5000 }],
                },
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);

      // Only the idempotency check query should have fired — no updates.
      expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(1);
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("where refund_id = $1"),
        ["re_existing_1"],
      );
      expect(queryTenantLocalDbMock).not.toHaveBeenCalledWith(
        expect.stringContaining("update public.event_registrations"),
        expect.anything(),
      );
    });

    it("skips when no church_id in metadata", async () => {
      const response = await stripeWebhookPost(
        new NextRequest("http://localhost/api/webhooks/stripe", {
          method: "POST",
          body: JSON.stringify({
            type: "charge.refunded",
            data: {
              object: {
                payment_intent: "pi_ch_nochurch_1",
                amount: 5000,
                amount_refunded: 5000,
                metadata: {}, // no church_id
                refunds: {
                  data: [{ id: "re_ch_nochurch_1", amount: 5000 }],
                },
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
    });

    it("skips when registration not found via payment intent lookup", async () => {
      // No event_registration_id in metadata; resolveRegistrationIdFromPaymentIntent
      // is called but returns null (default mock → empty rows).
      const response = await stripeWebhookPost(
        new NextRequest("http://localhost/api/webhooks/stripe", {
          method: "POST",
          body: JSON.stringify({
            type: "charge.refunded",
            data: {
              object: {
                payment_intent: "pi_ch_noreg_1",
                amount: 5000,
                amount_refunded: 5000,
                metadata: {
                  church_id: "church-1",
                  // no event_registration_id or registration_id
                },
                refunds: {
                  data: [{ id: "re_ch_noreg_1", amount: 5000 }],
                },
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);

      // Only the payment-intent lookup fires; no update queries.
      expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(1);
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("where payment_intent_id = $1"),
        ["pi_ch_noreg_1", "church-1"],
      );
      expect(queryTenantLocalDbMock).not.toHaveBeenCalledWith(
        expect.stringContaining("update public.event_registrations"),
        expect.anything(),
      );
    });

    // AC13 — payment_intent fallback resolves registration and processes refund
    it("resolves registration via payment_intent fallback and processes refund", async () => {
      // First call: resolveRegistrationIdFromPaymentIntent (no event_registration_id in metadata)
      // Second call: idempotency check (returns no existing row → proceed)
      // Third and fourth calls: the two update queries
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ registration_id: "reg-fallback-1" }] }) // payment_intent lookup
        .mockResolvedValue({ rows: [] }); // idempotency check + updates

      const response = await stripeWebhookPost(
        new NextRequest("http://localhost/api/webhooks/stripe", {
          method: "POST",
          body: JSON.stringify({
            type: "charge.refunded",
            data: {
              object: {
                payment_intent: "pi_ch_fallback_1",
                amount: 5000,
                amount_refunded: 5000,
                metadata: {
                  church_id: "church-1",
                  // no event_registration_id — must fall back to payment_intent lookup
                },
                refunds: {
                  data: [{ id: "re_ch_fallback_1", amount: 5000 }],
                },
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);

      // payment_intent lookup fired first
      expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("where payment_intent_id = $1"),
        ["pi_ch_fallback_1", "church-1"],
      );

      // Both tables updated with the resolved registration id and 'refunded' status
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("update public.event_registrations"),
        ["reg-fallback-1", "refunded", "church-1"],
      );
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("update public.event_registration_payments"),
        ["reg-fallback-1", "refunded", "re_ch_fallback_1", 5000, "church-1"],
      );
    });

    // ── Supabase path (shouldUseLocalTenantFallback = false) ─────────────────

    it("handleChargeRefunded — Supabase: processes full refund (shouldUseLocalTenantFallback=false)", async () => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(false);

      const fromMock = vi.fn();
      const selectMock = vi.fn();
      const updateMock = vi.fn();
      const eqMock = vi.fn();
      const maybeSingleMock = vi.fn();

      // idempotency check: no existing refund
      maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
      // update event_registrations — resolves immediately
      // update event_registration_payments — resolves immediately
      // these chained calls all return the same proxy; we only verify calls below

      const chainProxy = {
        from: fromMock,
        select: selectMock,
        update: updateMock,
        eq: eqMock,
        maybeSingle: maybeSingleMock,
      };

      // Proxy all methods to return chainProxy so chaining works
      fromMock.mockReturnValue(chainProxy);
      selectMock.mockReturnValue(chainProxy);
      updateMock.mockReturnValue(chainProxy);
      eqMock.mockReturnValue(chainProxy);
      // maybeSingle terminates the chain for idempotency check
      maybeSingleMock.mockResolvedValue({ data: null, error: null });

      createTenantAdminClientMock.mockReturnValue(chainProxy);

      const response = await stripeWebhookPost(
        new NextRequest("http://localhost/api/webhooks/stripe", {
          method: "POST",
          body: JSON.stringify({
            type: "charge.refunded",
            data: {
              object: {
                payment_intent: "pi_sb_refund_1",
                amount: 5000,
                amount_refunded: 5000,
                metadata: {
                  church_id: "church-sb-1",
                  event_registration_id: "reg-sb-1",
                },
                refunds: {
                  data: [{ id: "re_sb_1", amount: 5000 }],
                },
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      // Supabase path does not call queryTenantLocalDb
      expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
      // createTenantAdminClient was called
      expect(createTenantAdminClientMock).toHaveBeenCalled();
      // update was called (event_registrations and event_registration_payments)
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ payment_status: "refunded" }),
      );
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ refund_id: "re_sb_1", refund_amount_cents: 5000 }),
      );
    });

    it("handleChargeRefunded — Supabase: is idempotent when refund_id found in Supabase", async () => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(false);

      const fromMock = vi.fn();
      const selectMock = vi.fn();
      const updateMock = vi.fn();
      const eqMock = vi.fn();
      const maybeSingleMock = vi.fn();

      const chainProxy = {
        from: fromMock,
        select: selectMock,
        update: updateMock,
        eq: eqMock,
        maybeSingle: maybeSingleMock,
      };

      fromMock.mockReturnValue(chainProxy);
      selectMock.mockReturnValue(chainProxy);
      updateMock.mockReturnValue(chainProxy);
      eqMock.mockReturnValue(chainProxy);
      // Idempotency: found existing row → return early
      maybeSingleMock.mockResolvedValue({ data: { id: "existing-pay-row" }, error: null });

      createTenantAdminClientMock.mockReturnValue(chainProxy);

      const response = await stripeWebhookPost(
        new NextRequest("http://localhost/api/webhooks/stripe", {
          method: "POST",
          body: JSON.stringify({
            type: "charge.refunded",
            data: {
              object: {
                payment_intent: "pi_sb_idem_1",
                amount: 5000,
                amount_refunded: 5000,
                metadata: {
                  church_id: "church-sb-1",
                  event_registration_id: "reg-sb-1",
                },
                refunds: {
                  data: [{ id: "re_sb_idem_1", amount: 5000 }],
                },
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      // update should NOT have been called (early return after idempotency check)
      expect(updateMock).not.toHaveBeenCalled();
      expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
    });
  });

  // ── Supabase path — handlePaymentIntentSucceeded ──────────────────────────

  describe("handlePaymentIntentSucceeded — Supabase path", () => {
    beforeEach(() => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    });

    it("handlePaymentIntentSucceeded — Supabase: updates all tables with church_id filter", async () => {
      const fromMock = vi.fn();
      const selectMock = vi.fn();
      const updateMock = vi.fn();
      const eqMock = vi.fn();
      const maybeSingleMock = vi.fn();

      const chainProxy = {
        from: fromMock,
        select: selectMock,
        update: updateMock,
        eq: eqMock,
        maybeSingle: maybeSingleMock,
      };

      fromMock.mockReturnValue(chainProxy);
      selectMock.mockReturnValue(chainProxy);
      updateMock.mockReturnValue(chainProxy);
      eqMock.mockReturnValue(chainProxy);
      // donations update → maybeSingle returns a donation record
      maybeSingleMock.mockResolvedValue({
        data: {
          id: "don-sb-1",
          donor_email: null,
          donor_name: null,
          amount_cents: 5000,
          fund_designation: "General",
        },
        error: null,
      });

      createTenantAdminClientMock.mockReturnValue(chainProxy);

      const response = await stripeWebhookPost(
        new NextRequest("http://localhost/api/webhooks/stripe", {
          method: "POST",
          body: JSON.stringify({
            type: "payment_intent.succeeded",
            data: {
              object: {
                id: "pi_sb_succ_1",
                amount: 5000,
                currency: "usd",
                metadata: {
                  church_id: "church-sb-1",
                  event_registration_id: "reg-sb-1",
                },
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
      expect(createTenantAdminClientMock).toHaveBeenCalled();
      // event_registrations update with payment_status: "paid"
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ payment_status: "paid", stripe_payment_intent_id: "pi_sb_succ_1" }),
      );
      // event_registration_payments update with status: "succeeded"
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "succeeded", payment_intent_id: "pi_sb_succ_1" }),
      );
      // donations update with status: "succeeded"
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "succeeded" }),
      );
    });

    it("handlePaymentIntentSucceeded — Supabase: resolves registration via payment_intent lookup", async () => {
      const fromMock = vi.fn();
      const selectMock = vi.fn();
      const updateMock = vi.fn();
      const eqMock = vi.fn();
      const maybeSingleMock = vi.fn();

      const chainProxy = {
        from: fromMock,
        select: selectMock,
        update: updateMock,
        eq: eqMock,
        maybeSingle: maybeSingleMock,
      };

      fromMock.mockReturnValue(chainProxy);
      selectMock.mockReturnValue(chainProxy);
      updateMock.mockReturnValue(chainProxy);
      eqMock.mockReturnValue(chainProxy);
      // First maybeSingle: resolveRegistrationIdFromPaymentIntent lookup → found
      // Second maybeSingle: donations update → no donation (returns early)
      maybeSingleMock
        .mockResolvedValueOnce({
          data: { registration_id: "reg-sb-resolved" },
          error: null,
        })
        .mockResolvedValue({ data: null, error: null });

      createTenantAdminClientMock.mockReturnValue(chainProxy);

      const response = await stripeWebhookPost(
        new NextRequest("http://localhost/api/webhooks/stripe", {
          method: "POST",
          body: JSON.stringify({
            type: "payment_intent.succeeded",
            data: {
              object: {
                id: "pi_sb_lookup_1",
                amount: 4500,
                currency: "usd",
                metadata: {
                  church_id: "church-sb-1",
                  // no event_registration_id — must resolve via Supabase lookup
                },
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
      // event_registrations updated with resolved registration id
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ payment_status: "paid" }),
      );
    });

    it("handlePaymentIntentSucceeded — Supabase: returns 200 when Supabase update errors", async () => {
      const fromMock = vi.fn();
      const selectMock = vi.fn();
      const updateMock = vi.fn();
      const eqMock = vi.fn();
      const maybeSingleMock = vi.fn();

      const chainProxy = {
        from: fromMock,
        select: selectMock,
        update: updateMock,
        eq: eqMock,
        maybeSingle: maybeSingleMock,
      };

      fromMock.mockReturnValue(chainProxy);
      selectMock.mockReturnValue(chainProxy);
      // update throws to simulate Supabase error — outer try/catch returns 200
      updateMock.mockImplementation(() => {
        throw new Error("Supabase update failed");
      });
      eqMock.mockReturnValue(chainProxy);
      maybeSingleMock.mockResolvedValue({ data: null, error: null });

      createTenantAdminClientMock.mockReturnValue(chainProxy);

      const response = await stripeWebhookPost(
        new NextRequest("http://localhost/api/webhooks/stripe", {
          method: "POST",
          body: JSON.stringify({
            type: "payment_intent.succeeded",
            data: {
              object: {
                id: "pi_sb_err_1",
                amount: 5000,
                currency: "usd",
                metadata: {
                  church_id: "church-sb-err",
                  event_registration_id: "reg-sb-err",
                },
              },
            },
          }),
        }),
      );

      // Outer handler catch block returns 200 with warning
      expect(response.status).toBe(200);
      const body = await response.json() as { received: boolean; warning?: string };
      expect(body.received).toBe(true);
      expect(body.warning).toBeDefined();
    });
  });

  // ── Supabase path — handlePaymentIntentFailed ─────────────────────────────

  describe("handlePaymentIntentFailed — Supabase path", () => {
    beforeEach(() => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    });

    it("handlePaymentIntentFailed — Supabase: updates all tables with church_id filter", async () => {
      const fromMock = vi.fn();
      const selectMock = vi.fn();
      const updateMock = vi.fn();
      const eqMock = vi.fn();
      const maybeSingleMock = vi.fn();

      const chainProxy = {
        from: fromMock,
        select: selectMock,
        update: updateMock,
        eq: eqMock,
        maybeSingle: maybeSingleMock,
      };

      fromMock.mockReturnValue(chainProxy);
      selectMock.mockReturnValue(chainProxy);
      updateMock.mockReturnValue(chainProxy);
      eqMock.mockReturnValue(chainProxy);
      maybeSingleMock.mockResolvedValue({ data: null, error: null });

      createTenantAdminClientMock.mockReturnValue(chainProxy);

      const response = await stripeWebhookPost(
        new NextRequest("http://localhost/api/webhooks/stripe", {
          method: "POST",
          body: JSON.stringify({
            type: "payment_intent.payment_failed",
            data: {
              object: {
                id: "pi_sb_fail_1",
                metadata: {
                  church_id: "church-sb-1",
                  event_registration_id: "reg-sb-2",
                },
                last_payment_error: {
                  code: "card_declined",
                  message: "Your card was declined.",
                },
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
      expect(createTenantAdminClientMock).toHaveBeenCalled();
      // event_registrations updated to failed
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ payment_status: "failed" }),
      );
      // event_registration_payments updated with failure details
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed", failure_code: "card_declined" }),
      );
      // donations updated to failed
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed" }),
      );
    });

    it("handlePaymentIntentFailed — Supabase: returns 200 when Supabase update errors", async () => {
      const fromMock = vi.fn();
      const selectMock = vi.fn();
      const updateMock = vi.fn();
      const eqMock = vi.fn();
      const maybeSingleMock = vi.fn();

      const chainProxy = {
        from: fromMock,
        select: selectMock,
        update: updateMock,
        eq: eqMock,
        maybeSingle: maybeSingleMock,
      };

      fromMock.mockReturnValue(chainProxy);
      selectMock.mockReturnValue(chainProxy);
      updateMock.mockImplementation(() => {
        throw new Error("Supabase unavailable");
      });
      eqMock.mockReturnValue(chainProxy);
      maybeSingleMock.mockResolvedValue({ data: null, error: null });

      createTenantAdminClientMock.mockReturnValue(chainProxy);

      const response = await stripeWebhookPost(
        new NextRequest("http://localhost/api/webhooks/stripe", {
          method: "POST",
          body: JSON.stringify({
            type: "payment_intent.payment_failed",
            data: {
              object: {
                id: "pi_sb_fail_err_1",
                metadata: {
                  church_id: "church-sb-err",
                  event_registration_id: "reg-sb-err",
                },
                last_payment_error: { code: "timeout", message: "Timeout." },
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      const body = await response.json() as { received: boolean; warning?: string };
      expect(body.received).toBe(true);
      expect(body.warning).toBeDefined();
    });
  });
});
