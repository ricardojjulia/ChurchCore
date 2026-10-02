import { afterEach, describe, expect, it, vi } from "vitest";

import { createEventRegistrationPaymentIntent, stubPaymentIntentId } from "@/lib/stripe/event-registrations";

// Council Review 34 / PR #172 review: the event-registration PaymentIntent
// sent `automatic_payment_methods: "enabled"`, a form-encoded value Stripe
// rejects. Pin the request it actually sends.

describe("createEventRegistrationPaymentIntent's request to Stripe", () => {
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

    expect(result).toEqual({ clientSecret: "pi_9_secret", paymentIntentId: "pi_9", isStub: false });
    const body = new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.getAll("payment_method_types[]")).toEqual(["card"]);
    expect(body.has("automatic_payment_methods")).toBe(false);
    expect(body.get("metadata[event_registration_id]")).toBe("reg-1");
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
