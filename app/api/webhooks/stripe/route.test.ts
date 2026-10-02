import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  createTenantAdminClientMock,
  getStripeWebhookSecretMock,
  sendEmailMock,
  connectMocks,
} = vi.hoisted(() => ({
  connectMocks: {
    churchForStripeAccount: vi.fn(),
    markChurchStripeAccountDisconnected: vi.fn(),
    updateChurchStripeAccountStatus: vi.fn(),
  },
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

vi.mock("@/lib/stripe/connect", () => connectMocks);

vi.mock("@/lib/notifications/send-email", () => ({
  sendEmail: sendEmailMock,
}));

import { POST as stripeWebhookPost } from "@/app/api/webhooks/stripe/route";

const TEST_SECRET = "whsec_route_test";

// A request Stripe signed with TEST_SECRET just now (S2: unsigned events are
// rejected, so the handler tests sign theirs).
function stripeRequest(init: { method: string; body: string }, secret = TEST_SECRET, signedAt = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${signedAt}.${init.body}`, "utf8").digest("hex");
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    ...init,
    headers: { "stripe-signature": `t=${signedAt},v1=${v1}` },
  });
}

describe("stripe webhook signature (S2: fail closed, replay window)", () => {
  const body = JSON.stringify({ type: "payment_intent.succeeded", data: { object: { id: "pi_1", metadata: {} } } });

  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    queryTenantLocalDbMock.mockResolvedValue({ rows: [] });
  });

  it("rejects every event when STRIPE_WEBHOOK_SECRET is unset, even a well-formed one", async () => {
    getStripeWebhookSecretMock.mockReturnValue(null);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await stripeWebhookPost(stripeRequest({ method: "POST", body }));
    expect(response.status).toBe(401);
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
  });

  it("rejects an unsigned event and one signed with another secret", async () => {
    getStripeWebhookSecretMock.mockReturnValue(TEST_SECRET);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const unsigned = await stripeWebhookPost(new NextRequest("http://localhost/api/webhooks/stripe", { method: "POST", body }));
    expect(unsigned.status).toBe(401);
    const wrong = await stripeWebhookPost(stripeRequest({ method: "POST", body }, "whsec_someone_else"));
    expect(wrong.status).toBe(401);
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
  });

  it("rejects a correctly signed event older than five minutes (a replay), accepts a fresh one", async () => {
    getStripeWebhookSecretMock.mockReturnValue(TEST_SECRET);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const stale = await stripeWebhookPost(
      stripeRequest({ method: "POST", body }, TEST_SECRET, Math.floor(Date.now() / 1000) - 301),
    );
    expect(stale.status).toBe(401);
    const fresh = await stripeWebhookPost(stripeRequest({ method: "POST", body }));
    expect(fresh.status).toBe(200);
  });
});

describe("stripe webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    getStripeWebhookSecretMock.mockReturnValue(TEST_SECRET);
    queryTenantLocalDbMock.mockResolvedValue({ rows: [] });
    sendEmailMock.mockResolvedValue(undefined);
  });

  it("reconciles event registration payment as paid on payment_intent.succeeded", async () => {
    const response = await stripeWebhookPost(
      stripeRequest({
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
      stripeRequest({
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
      stripeRequest({
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
      stripeRequest({
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
        stripeRequest({
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
        stripeRequest({
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
        stripeRequest({
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
        stripeRequest({
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
        stripeRequest({
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
        stripeRequest({
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
        stripeRequest({
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
        stripeRequest({
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
        stripeRequest({
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
        stripeRequest({
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
        stripeRequest({
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
        stripeRequest({
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
        stripeRequest({
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

  // ── Supabase path — autoPostToGlSupabase & reverseGlEntryForRefundSupabase ──

  describe("GL auto-post — Supabase path", () => {
    beforeEach(() => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    });

    function makeGlChainProxy() {
      const fromMock = vi.fn();
      const selectMock = vi.fn();
      const updateMock = vi.fn();
      const insertMock = vi.fn();
      const eqMock = vi.fn();
      const maybeSingleMock = vi.fn();
      const singleMock = vi.fn();

      const chainProxy = {
        from: fromMock,
        select: selectMock,
        update: updateMock,
        insert: insertMock,
        eq: eqMock,
        maybeSingle: maybeSingleMock,
        single: singleMock,
      };

      fromMock.mockReturnValue(chainProxy);
      selectMock.mockReturnValue(chainProxy);
      updateMock.mockReturnValue(chainProxy);
      insertMock.mockReturnValue(chainProxy);
      eqMock.mockReturnValue(chainProxy);

      return { chainProxy, fromMock, insertMock, updateMock, maybeSingleMock, singleMock };
    }

    it("handlePaymentIntentSucceeded — Supabase: posts to GL when fund mapping found", async () => {
      const { chainProxy, fromMock, insertMock, maybeSingleMock, singleMock } = makeGlChainProxy();

      // Sequence:
      // 1. donations update → maybySingle → donation record
      // 2. autoPostToGlSupabase: donation_gl_posts idempotency → null
      // 3. autoPostToGlSupabase: giving_fund_accounts fund mapping → found
      maybeSingleMock
        .mockResolvedValueOnce({
          data: { id: "don-gl-1", donor_email: null, donor_name: null, amount_cents: 5000, fund_designation: "General" },
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: null }) // gl idempotency: not posted yet
        .mockResolvedValueOnce({
          data: { asset_account_id: "acc-asset-1", income_account_id: "acc-income-1" },
          error: null,
        });

      // autoPostToGlSupabase: finance_journals insert → single → journal id
      singleMock.mockResolvedValue({ data: { id: "journal-gl-1" }, error: null });

      createTenantAdminClientMock.mockReturnValue(chainProxy);

      const response = await stripeWebhookPost(
        stripeRequest({
          method: "POST",
          body: JSON.stringify({
            type: "payment_intent.succeeded",
            data: {
              object: {
                id: "pi_gl_post_1",
                amount: 5000,
                currency: "usd",
                metadata: {
                  church_id: "church-gl-1",
                  event_registration_id: "reg-gl-1",
                },
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
      // finance_journals and finance_journal_lines were inserted
      expect(fromMock).toHaveBeenCalledWith("finance_journals");
      expect(fromMock).toHaveBeenCalledWith("finance_journal_lines");
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ journal_type: "giving", status: "posted" }),
      );
      expect(insertMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ side: "debit", amount_cents: 5000 }),
          expect.objectContaining({ side: "credit", amount_cents: 5000 }),
        ]),
      );
    });

    it("handlePaymentIntentSucceeded — Supabase: skips GL post when fund mapping missing", async () => {
      const { chainProxy, fromMock, insertMock, maybeSingleMock } = makeGlChainProxy();

      // donations → donation found; gl idempotency → not posted; fund mapping → null
      maybeSingleMock
        .mockResolvedValueOnce({
          data: { id: "don-gl-2", donor_email: null, donor_name: null, amount_cents: 3000, fund_designation: "Special" },
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: null }) // gl idempotency
        .mockResolvedValueOnce({ data: null, error: null }); // fund mapping missing

      createTenantAdminClientMock.mockReturnValue(chainProxy);

      const response = await stripeWebhookPost(
        stripeRequest({
          method: "POST",
          body: JSON.stringify({
            type: "payment_intent.succeeded",
            data: {
              object: {
                id: "pi_gl_nofund_1",
                amount: 3000,
                currency: "usd",
                metadata: {
                  church_id: "church-gl-1",
                  event_registration_id: "reg-gl-2",
                },
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      // No journal or line inserts when fund mapping is absent
      expect(fromMock).not.toHaveBeenCalledWith("finance_journals");
      expect(insertMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ journal_type: "giving" }),
      );
    });

    it("handlePaymentIntentSucceeded — Supabase: is idempotent when donation_gl_posts row exists", async () => {
      const { chainProxy, fromMock, insertMock, maybeSingleMock } = makeGlChainProxy();

      // donations → donation found; gl idempotency → already posted (truthy data)
      maybeSingleMock
        .mockResolvedValueOnce({
          data: { id: "don-gl-3", donor_email: null, donor_name: null, amount_cents: 2000, fund_designation: "General" },
          error: null,
        })
        .mockResolvedValueOnce({ data: { id: "existing-gl-post" }, error: null }); // already posted

      createTenantAdminClientMock.mockReturnValue(chainProxy);

      const response = await stripeWebhookPost(
        stripeRequest({
          method: "POST",
          body: JSON.stringify({
            type: "payment_intent.succeeded",
            data: {
              object: {
                id: "pi_gl_idem_1",
                amount: 2000,
                currency: "usd",
                metadata: {
                  church_id: "church-gl-1",
                  event_registration_id: "reg-gl-3",
                },
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      // GL was already posted — no new journal insert
      expect(fromMock).not.toHaveBeenCalledWith("finance_journals");
      expect(insertMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ journal_type: "giving" }),
      );
    });

    it("handleChargeRefunded — Supabase: voids GL journal on refund", async () => {
      const { chainProxy, fromMock, updateMock, maybeSingleMock } = makeGlChainProxy();

      // Charge refunded path (Supabase):
      // 1. idempotency check on event_registration_payments by refund_id → null
      // 2. event_registrations update
      // 3. event_registration_payments update
      // 4. reverseGlEntryForRefundSupabase: donations lookup → donation found
      // 5. reverseGlEntryForRefundSupabase: donation_gl_posts lookup → journal found
      maybeSingleMock
        .mockResolvedValueOnce({ data: null, error: null }) // idempotency: no existing refund row
        .mockResolvedValueOnce({ data: { id: "don-ref-1" }, error: null }) // donations lookup
        .mockResolvedValueOnce({ data: { journal_id: "journal-ref-1" }, error: null }); // donation_gl_posts

      createTenantAdminClientMock.mockReturnValue(chainProxy);

      const response = await stripeWebhookPost(
        stripeRequest({
          method: "POST",
          body: JSON.stringify({
            type: "charge.refunded",
            data: {
              object: {
                payment_intent: "pi_gl_ref_1",
                amount: 5000,
                amount_refunded: 5000,
                metadata: {
                  church_id: "church-gl-1",
                  event_registration_id: "reg-gl-ref-1",
                },
                refunds: {
                  data: [{ id: "re_gl_ref_1", amount: 5000 }],
                },
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
      // Journal voided via update on finance_journals
      expect(fromMock).toHaveBeenCalledWith("finance_journals");
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "voided", voided_by: "system-webhook-refund" }),
      );
    });
  });

  // ── Supabase path — handleSubscriptionDeleted ─────────────────────────────

  describe("handleSubscriptionDeleted — Supabase path", () => {
    beforeEach(() => {
      shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    });

    it("handleSubscriptionDeleted — Supabase: cancels donations on subscription deletion", async () => {
      const fromMock = vi.fn();
      const updateMock = vi.fn();
      const eqMock = vi.fn();

      const chainProxy = { from: fromMock, update: updateMock, eq: eqMock };
      fromMock.mockReturnValue(chainProxy);
      updateMock.mockReturnValue(chainProxy);
      eqMock.mockReturnValue(chainProxy);

      createTenantAdminClientMock.mockReturnValue(chainProxy);

      const response = await stripeWebhookPost(
        stripeRequest({
          method: "POST",
          body: JSON.stringify({
            type: "customer.subscription.deleted",
            data: {
              object: {
                id: "sub_cancelled_1",
                metadata: { church_id: "church-sb-1" },
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
      expect(fromMock).toHaveBeenCalledWith("donations");
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "cancelled" }),
      );
      expect(eqMock).toHaveBeenCalledWith("stripe_subscription_id", "sub_cancelled_1");
      expect(eqMock).toHaveBeenCalledWith("church_id", "church-sb-1");
    });

    it("handleSubscriptionDeleted — Supabase: skips when no church_id in metadata", async () => {
      const response = await stripeWebhookPost(
        stripeRequest({
          method: "POST",
          body: JSON.stringify({
            type: "customer.subscription.deleted",
            data: {
              object: {
                id: "sub_nochurch_1",
                metadata: {},
              },
            },
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(createTenantAdminClientMock).not.toHaveBeenCalled();
      expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
    });
  });
});

// ── Connected church accounts (G3.0b, ADR 0025) ─────────────────────────────
describe("stripe webhook — events from connected church accounts", () => {
  const CONNECT_SECRET = "whsec_connect_test";
  const succeeded = (account: string, metadata: Record<string, string>) =>
    JSON.stringify({
      type: "payment_intent.succeeded",
      account,
      data: { object: { id: "pi_c1", amount: 2500, currency: "usd", metadata } },
    });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_CONNECT_WEBHOOK_SECRET", CONNECT_SECRET);
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    getStripeWebhookSecretMock.mockReturnValue(TEST_SECRET);
    queryTenantLocalDbMock.mockResolvedValue({ rows: [] });
    connectMocks.churchForStripeAccount.mockResolvedValue("church-1");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts an event signed with the Connect endpoint's secret and scopes it to the account's church", async () => {
    const response = await stripeWebhookPost(
      stripeRequest({ method: "POST", body: succeeded("acct_church1", { event_registration_id: "reg-1" }) }, CONNECT_SECRET),
    );
    expect(response.status).toBe(200);
    expect(connectMocks.churchForStripeAccount).toHaveBeenCalledWith("acct_church1");
    // A Charge or PaymentIntent without church metadata gets the account's church.
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.event_registrations"),
      ["reg-1", "church-1", "pi_c1", 2500],
    );
  });

  it("still rejects an event signed with neither secret", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await stripeWebhookPost(
      stripeRequest({ method: "POST", body: succeeded("acct_church1", {}) }, "whsec_someone_else"),
    );
    expect(response.status).toBe(401);
    expect(connectMocks.churchForStripeAccount).not.toHaveBeenCalled();
  });

  it("ignores a payment naming another church than the account's — one church can't settle another's gift", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await stripeWebhookPost(
      stripeRequest({ method: "POST", body: succeeded("acct_church1", { church_id: "church-2", donation_id: "don-1" }) }, CONNECT_SECRET),
    );
    expect(response.status).toBe(200);
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
  });

  it("ignores an event from an account no church has connected", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    connectMocks.churchForStripeAccount.mockResolvedValue(null);
    const response = await stripeWebhookPost(
      stripeRequest({ method: "POST", body: succeeded("acct_unknown", { church_id: "church-1", donation_id: "don-1" }) }, CONNECT_SECRET),
    );
    expect(response.status).toBe(200);
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
  });

  it("records Stripe's account status on account.updated", async () => {
    const body = JSON.stringify({
      type: "account.updated",
      account: "acct_church1",
      created: 1_790_000_000,
      data: { object: { id: "acct_church1", charges_enabled: true, details_submitted: true } },
    });
    expect((await stripeWebhookPost(stripeRequest({ method: "POST", body }, CONNECT_SECRET))).status).toBe(200);
    expect(connectMocks.updateChurchStripeAccountStatus).toHaveBeenCalledWith(
      "acct_church1",
      { chargesEnabled: true, detailsSubmitted: true },
      new Date(1_790_000_000 * 1000),
    );
  });

  it("marks the church disconnected when it revokes ChurchCore's access in Stripe", async () => {
    const body = JSON.stringify({
      type: "account.application.deauthorized",
      account: "acct_church1",
      created: 1_790_000_000,
      data: { object: { id: "ca_platform" } },
    });
    expect((await stripeWebhookPost(stripeRequest({ method: "POST", body }, CONNECT_SECRET))).status).toBe(200);
    // With the event's own time, so a late or retried deauthorization from
    // before the church reconnected can't disconnect the new link (PR #174 review).
    expect(connectMocks.markChurchStripeAccountDisconnected).toHaveBeenCalledWith(
      "acct_church1",
      new Date(1_790_000_000 * 1000),
    );
  });
});
