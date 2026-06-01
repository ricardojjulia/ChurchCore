import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  getStripeWebhookSecretMock,
  sendEmailMock,
} = vi.hoisted(() => ({
  queryTenantLocalDbMock: vi.fn(),
  shouldUseLocalTenantFallbackMock: vi.fn(),
  getStripeWebhookSecretMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
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
  });
});
