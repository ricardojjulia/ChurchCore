import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Council Review 22: stubbed payments recorded gifts as succeeded (and sent
// tax receipts) on any deployment without Stripe keys. Stubs are now allowed
// only outside production or in demo mode. G3.0b (ADR 0025): a church gives
// online only on its own connected Stripe account, and every live Stripe call
// carries that account.

const { getChurchStripeAccountMock } = vi.hoisted(() => ({ getChurchStripeAccountMock: vi.fn() }));

vi.mock("@/lib/stripe/connect", () => ({
  getChurchStripeAccount: getChurchStripeAccountMock,
  stripeConnectClientId: () => process.env.STRIPE_CONNECT_CLIENT_ID || null,
}));

import {
  cancelPaymentIntent,
  createOrGetStripeCustomer,
  createPaymentIntent,
  onlineGivingNotice,
  onlineGivingStatus,
  retrievePaymentIntentStatus,
} from "@/lib/stripe/donations";

function setEnv({
  key,
  publishable,
  connectClient,
  nodeEnv,
  demo,
}: {
  key?: string;
  publishable?: string;
  connectClient?: string;
  nodeEnv: string;
  demo?: string;
}) {
  vi.stubEnv("STRIPE_SECRET_KEY", key ?? "");
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", publishable ?? "");
  vi.stubEnv("STRIPE_CONNECT_CLIENT_ID", connectClient ?? "");
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", demo ?? "");
}

const LIVE = { key: "sk_test_123", publishable: "pk_test_123", connectClient: "ca_123", nodeEnv: "production" };

describe("online giving status", () => {
  beforeEach(() => {
    getChurchStripeAccountMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stubs payments without keys outside production", async () => {
    setEnv({ nodeEnv: "development" });
    expect(await onlineGivingStatus("church-1")).toEqual({ mode: "stub", stripeAccount: null });
    expect(onlineGivingNotice("stub")).toBeNull();
    expect(await retrievePaymentIntentStatus("pi_stub")).toBe("succeeded");
    expect((await createPaymentIntent({ amountCents: 100, churchId: "c" })).isStub).toBe(true);
  });

  it("stubs payments in production only in demo mode", async () => {
    setEnv({ nodeEnv: "production", demo: "true" });
    expect((await onlineGivingStatus("church-1")).mode).toBe("stub");
    expect(await retrievePaymentIntentStatus("pi_stub")).toBe("succeeded");
  });

  it("never records a stubbed payment as succeeded in production without keys", async () => {
    setEnv({ nodeEnv: "production" });
    expect((await onlineGivingStatus("church-1")).mode).toBe("unconfigured");
    expect(onlineGivingNotice("unconfigured")).toMatch(/isn't set up for this church/);
    expect(await retrievePaymentIntentStatus("pi_stub")).not.toBe("succeeded");
    await expect(createPaymentIntent({ amountCents: 100, churchId: "c" })).rejects.toThrow(/not configured/);
    await expect(createOrGetStripeCustomer({ email: "a@example.org", churchId: "c" })).rejects.toThrow(/not configured/);
  });

  it("is unavailable while the platform's Stripe setup is incomplete (no publishable key or Connect client id)", async () => {
    setEnv({ key: "sk_test_123", nodeEnv: "production" });
    expect((await onlineGivingStatus("church-1")).mode).toBe("unavailable");
    setEnv({ key: "sk_test_123", publishable: "pk_test_123", nodeEnv: "production" });
    expect((await onlineGivingStatus("church-1")).mode).toBe("unavailable");
    expect(onlineGivingNotice("unavailable")).toMatch(/isn't fully set up/);
    expect(getChurchStripeAccountMock).not.toHaveBeenCalled();
  });

  it("is off for a church that hasn't connected, or that Stripe isn't letting take charges yet (G3.0b)", async () => {
    setEnv(LIVE);
    getChurchStripeAccountMock.mockResolvedValueOnce(null);
    expect(await onlineGivingStatus("church-1")).toEqual({ mode: "not_connected", stripeAccount: null });
    getChurchStripeAccountMock.mockResolvedValueOnce({ accountId: "acct_1", chargesEnabled: false, detailsSubmitted: true });
    expect((await onlineGivingStatus("church-1")).mode).toBe("not_connected");
    expect(onlineGivingNotice("not_connected")).toMatch(/isn't set up for this church/);
  });

  it("is live on the church's own connected account", async () => {
    setEnv(LIVE);
    getChurchStripeAccountMock.mockResolvedValueOnce({ accountId: "acct_church1", chargesEnabled: true, detailsSubmitted: true });
    expect(await onlineGivingStatus("church-1")).toEqual({ mode: "live", stripeAccount: "acct_church1" });
    expect(getChurchStripeAccountMock).toHaveBeenCalledWith("church-1");
    expect(onlineGivingNotice("live")).toBeNull();
  });
});

describe("live Stripe calls run on the church's account (ADR 0025)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function stubStripe(responses: Array<Record<string, unknown> & { httpStatus?: number }>) {
    const fetchMock = vi.fn();
    for (const response of responses) {
      const { httpStatus = 200, ...json } = response;
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(json), { status: httpStatus }));
    }
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  const headerOf = (fetchMock: ReturnType<typeof vi.fn>, call: number) =>
    (fetchMock.mock.calls[call][1] as RequestInit).headers as Record<string, string>;

  it("creates the PaymentIntent on the church's account, asking for cards in a form Stripe accepts (Council Review 34)", async () => {
    setEnv(LIVE);
    const fetchMock = stubStripe([{ id: "pi_1", client_secret: "pi_1_secret" }]);

    await createPaymentIntent({ amountCents: 2500, churchId: "church-1", donationId: "don-1", stripeAccount: "acct_church1" });

    expect(headerOf(fetchMock, 0)["Stripe-Account"]).toBe("acct_church1");
    const body = new URLSearchParams(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.getAll("payment_method_types[]")).toEqual(["card"]);
    expect(body.has("automatic_payment_methods")).toBe(false);
    expect(body.get("metadata[donation_id]")).toBe("don-1");
  });

  it("refuses a live call without a church account, rather than charging the platform's", async () => {
    setEnv(LIVE);
    const fetchMock = stubStripe([]);
    await expect(createPaymentIntent({ amountCents: 2500, churchId: "church-1" })).rejects.toThrow(/no connected Stripe account/);
    await expect(retrievePaymentIntentStatus("pi_1")).rejects.toThrow(/no connected Stripe account/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels an abandoned PaymentIntent on the church's account", async () => {
    setEnv(LIVE);
    const fetchMock = stubStripe([{ status: "canceled" }]);

    expect(await cancelPaymentIntent("pi_123", "acct_church1")).toBe("canceled");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.stripe.com/v1/payment_intents/pi_123/cancel");
    expect(headerOf(fetchMock, 0)["Stripe-Account"]).toBe("acct_church1");
  });

  it("reports the real status when Stripe refuses to cancel (it already succeeded)", async () => {
    setEnv(LIVE);
    const fetchMock = stubStripe([
      { httpStatus: 400, error: { message: "You cannot cancel this PaymentIntent because it has a status of succeeded." } },
      { status: "succeeded" },
    ]);

    expect(await cancelPaymentIntent("pi_123", "acct_church1")).toBe("succeeded");
    expect(headerOf(fetchMock, 1)["Stripe-Account"]).toBe("acct_church1");
  });
});
