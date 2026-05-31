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
});
