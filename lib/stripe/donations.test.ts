import { afterEach, describe, expect, it, vi } from "vitest";

// Council Review 22: stubbed payments recorded gifts as succeeded (and sent
// tax receipts) on any deployment without Stripe keys. Stubs are now allowed
// only outside production or in demo mode.

import {
  createOrGetStripeCustomer,
  createPaymentIntent,
  onlineGivingMode,
  onlineGivingNotice,
  retrievePaymentIntentStatus,
} from "@/lib/stripe/donations";

function setEnv({ key, nodeEnv, demo }: { key?: string; nodeEnv: string; demo?: string }) {
  vi.stubEnv("STRIPE_SECRET_KEY", key ?? "");
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

  it("is unavailable with keys until the card form ships (G3.0)", () => {
    setEnv({ key: "sk_test_123", nodeEnv: "production" });
    expect(onlineGivingMode()).toBe("unavailable");
    expect(onlineGivingNotice()).toMatch(/card giving isn't available yet/);
  });
});
