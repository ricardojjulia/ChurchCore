import { afterEach, describe, expect, it, vi } from "vitest";

// Council Review 22: stubbed payments recorded gifts as succeeded (and sent
// tax receipts) on any deployment without Stripe keys. Stubs are now allowed
// only outside production or in demo mode.

import {
  createOrGetStripeCustomer,
  createPaymentIntent,
  onlineGivingMode,
  onlineGivingNotice,
  cancelPaymentIntent,
  retrievePaymentIntentStatus,
} from "@/lib/stripe/donations";

function setEnv({ key, publishable, nodeEnv, demo }: { key?: string; publishable?: string; nodeEnv: string; demo?: string }) {
  vi.stubEnv("STRIPE_SECRET_KEY", key ?? "");
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", publishable ?? "");
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", demo ?? "");
}

describe("online giving mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stubs payments without keys outside production", async () => {
    setEnv({ nodeEnv: "development" });
    expect(onlineGivingMode()).toBe("stub");
    expect(onlineGivingNotice()).toBeNull();
    expect(await retrievePaymentIntentStatus("pi_stub")).toBe("succeeded");
    expect((await createPaymentIntent({ amountCents: 100, churchId: "c" })).isStub).toBe(true);
  });

  it("stubs payments in production only in demo mode", async () => {
    setEnv({ nodeEnv: "production", demo: "true" });
    expect(onlineGivingMode()).toBe("stub");
    expect(await retrievePaymentIntentStatus("pi_stub")).toBe("succeeded");
  });

  it("never records a stubbed payment as succeeded in production without keys", async () => {
    setEnv({ nodeEnv: "production" });
    expect(onlineGivingMode()).toBe("unconfigured");
    expect(onlineGivingNotice()).toMatch(/isn't set up for this church/);
    expect(await retrievePaymentIntentStatus("pi_stub")).not.toBe("succeeded");
    await expect(createPaymentIntent({ amountCents: 100, churchId: "c" })).rejects.toThrow(/not configured/);
    await expect(createOrGetStripeCustomer({ email: "a@example.org", churchId: "c" })).rejects.toThrow(/not configured/);
  });

  it("is unavailable when the secret key is set but the card form's publishable key isn't", () => {
    setEnv({ key: "sk_test_123", nodeEnv: "production" });
    expect(onlineGivingMode()).toBe("unavailable");
    expect(onlineGivingNotice()).toMatch(/isn't fully set up/);
  });

  it("is live with both keys: the member pays with the card form (G3.0)", () => {
    setEnv({ key: "sk_test_123", publishable: "pk_test_123", nodeEnv: "production" });
    expect(onlineGivingMode()).toBe("live");
    expect(onlineGivingNotice()).toBeNull();
  });
});

describe("cancelPaymentIntent (G3.0)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("cancels an abandoned PaymentIntent at Stripe", async () => {
    setEnv({ key: "sk_test_123", nodeEnv: "production" });
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({ status: "canceled", url }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await cancelPaymentIntent("pi_123")).toBe("canceled");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.stripe.com/v1/payment_intents/pi_123/cancel");
  });

  it("reports the real status when Stripe refuses (it already succeeded)", async () => {
    setEnv({ key: "sk_test_123", nodeEnv: "production" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "You cannot cancel this PaymentIntent because it has a status of succeeded." } }), { status: 400 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: "succeeded" }), { status: 200 })),
    );

    expect(await cancelPaymentIntent("pi_123")).toBe("succeeded");
  });
});

