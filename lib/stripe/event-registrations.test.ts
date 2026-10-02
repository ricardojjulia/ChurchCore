import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getChurchStripeAccountMock } = vi.hoisted(() => ({ getChurchStripeAccountMock: vi.fn() }));
vi.mock("@/lib/stripe/connect", () => ({ getChurchStripeAccount: getChurchStripeAccountMock }));

import { createEventRegistrationPaymentIntent, stubPaymentIntentId } from "@/lib/stripe/event-registrations";

// Council Review 34 / PR #172 review: the event-registration PaymentIntent
// sent `automatic_payment_methods: "enabled"`, a form-encoded value Stripe
// rejects. Pin the request it actually sends.

describe("createEventRegistrationPaymentIntent's request to Stripe", () => {
  beforeEach(() => {
    getChurchStripeAccountMock.mockReset();
    getChurchStripeAccountMock.mockResolvedValue({ accountId: "acct_church1", chargesEnabled: true, detailsSubmitted: true });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("asks for card payments in a form Stripe accepts, with the registration in metadata", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      new Response(JSON.stringify({ id: "pi_9", client_secret: "pi_9_secret", url, sent: String(init?.body) }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createEventRegistrationPaymentIntent({
      amountCents: 2500,
      currency: "usd",
      churchId: "church-1",
      eventId: "event-1",
      registrationId: "reg-1",
    });

    expect(result).toEqual({ clientSecret: "pi_9_secret", paymentIntentId: "pi_9", isStub: false, stripeAccount: "acct_church1" });
    // Charged on the church's own account (ADR 0025).
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>)["Stripe-Account"]).toBe("acct_church1");
    const body = new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.getAll("payment_method_types[]")).toEqual(["card"]);
    expect(body.has("automatic_payment_methods")).toBe(false);
    expect(body.get("metadata[event_registration_id]")).toBe("reg-1");
  });

  it("refuses to charge, and never calls Stripe, for a church that hasn't connected or can't take charges yet", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const input = { amountCents: 2500, currency: "usd", churchId: "church-1", eventId: "event-1", registrationId: "reg-1" };

    getChurchStripeAccountMock.mockResolvedValueOnce(null);
    await expect(createEventRegistrationPaymentIntent(input)).rejects.toThrow();
    getChurchStripeAccountMock.mockResolvedValueOnce({ accountId: "acct_church1", chargesEnabled: false, detailsSubmitted: true });
    await expect(createEventRegistrationPaymentIntent(input)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("without Stripe keys, returns the stub id the demo payment route completes", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const result = await createEventRegistrationPaymentIntent({
      amountCents: 2500,
      currency: "usd",
      churchId: "church-1",
      eventId: "event-1",
      registrationId: "reg-1",
    });
    expect(result).toMatchObject({ paymentIntentId: stubPaymentIntentId("reg-1"), isStub: true });
  });
});
