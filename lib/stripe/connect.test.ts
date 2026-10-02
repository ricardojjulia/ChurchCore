import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// G3.0b (ADR 0025): a church links its own Stripe account through Stripe
// OAuth. The OAuth state binds the callback to the church and admin who
// started it, so a callback can't attach an account to another church.

const { tableResults, calls } = vi.hoisted(() => ({
  tableResults: [] as Array<{ data?: unknown; error?: unknown }>,
  calls: [] as Array<{ method: string; args: unknown[] }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/tenant", () => {
  function builder() {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "update", "upsert"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ method, args });
        return chain;
      };
    }
    const next = () => Promise.resolve(tableResults.shift() ?? { data: null, error: null });
    chain.maybeSingle = next;
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => next().then(resolve, reject);
    return chain;
  }
  return { createTenantAdminClient: vi.fn(() => ({ from: () => builder() })) };
});

import {
  exchangeConnectCode,
  getChurchPaymentConnection,
  getChurchStripeAccount,
  markChurchStripeAccountDisconnected,
  saveChurchStripeAccount,
  signConnectState,
  stripeConnectAuthorizeUrl,
  verifyConnectState,
} from "@/lib/stripe/connect";

beforeEach(() => {
  tableResults.length = 0;
  calls.length = 0;
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_platform");
  vi.stubEnv("STRIPE_CONNECT_CLIENT_ID", "ca_platform");
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_platform");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Connect OAuth state", () => {
  const state = { churchId: "church-1", profileId: "profile-1" };

  it("round-trips the church and admin who started the connection", () => {
    expect(verifyConnectState(signConnectState(state))).toEqual(state);
  });

  it("rejects a tampered state (another church swapped into the payload)", () => {
    const [, signature] = signConnectState(state).split(".");
    const forged = Buffer.from(JSON.stringify({ c: "church-2", p: "profile-1", e: Date.now() + 60_000, n: "x" })).toString(
      "base64url",
    );
    expect(verifyConnectState(`${forged}.${signature}`)).toBeNull();
  });

  it("rejects an expired state, a malformed one, and one signed with another key", () => {
    const now = Date.now();
    const signed = signConnectState(state, now);
    expect(verifyConnectState(signed, now + 16 * 60 * 1000)).toBeNull();
    expect(verifyConnectState("nonsense")).toBeNull();
    expect(verifyConnectState("")).toBeNull();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_other");
    expect(verifyConnectState(signed, now)).toBeNull();
  });

  it("can't be signed or verified without the platform key", () => {
    const signed = signConnectState(state);
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(() => signConnectState(state)).toThrow(/not configured/);
    expect(verifyConnectState(signed)).toBeNull();
  });
});

describe("Connect OAuth handshake", () => {
  it("builds Stripe's authorize URL for a read_write Standard connection", () => {
    const url = new URL(stripeConnectAuthorizeUrl({ state: "s.t", redirectUri: "https://app.example/api/stripe/connect/callback" }));
    expect(url.origin + url.pathname).toBe("https://connect.stripe.com/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "ca_platform",
      scope: "read_write",
      state: "s.t",
      redirect_uri: "https://app.example/api/stripe/connect/callback",
    });
  });

  it("refuses to build the URL without a Connect client id", () => {
    vi.stubEnv("STRIPE_CONNECT_CLIENT_ID", "");
    expect(() => stripeConnectAuthorizeUrl({ state: "s", redirectUri: "r" })).toThrow(/not configured/);
  });

  it("exchanges the code at connect.stripe.com for the church's account id", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ stripe_user_id: "acct_church1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await exchangeConnectCode("ac_123")).toBe("acct_church1");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://connect.stripe.com/oauth/token");
    expect(new URLSearchParams(String(init.body)).get("code")).toBe("ac_123");
    expect((init.headers as Record<string, string>)["Stripe-Account"]).toBeUndefined();
  });

  it("fails when Stripe returns no account", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    await expect(exchangeConnectCode("ac_123")).rejects.toThrow(/didn't return a connected account/);
  });
});

describe("the church's link", () => {
  it("reads only a live (not disconnected) link for the church", async () => {
    tableResults.push({ data: { stripe_account_id: "acct_church1", charges_enabled: true, details_submitted: true }, error: null });
    expect(await getChurchStripeAccount("church-1")).toEqual({
      accountId: "acct_church1",
      chargesEnabled: true,
      detailsSubmitted: true,
    });
    expect(calls).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["church_id", "church-1"] },
        { method: "is", args: ["disconnected_at", null] },
      ]),
    );
  });

  it("throws on a read error rather than treating the church as unconnected", async () => {
    tableResults.push({ data: null, error: { message: "boom" } });
    await expect(getChurchStripeAccount("church-1")).rejects.toThrow("boom");
  });

  it("saves one link per church, clearing any earlier disconnect", async () => {
    await saveChurchStripeAccount({
      churchId: "church-1",
      accountId: "acct_church1",
      chargesEnabled: false,
      detailsSubmitted: false,
      connectedBy: "profile-1",
    });
    const upsert = calls.find((c) => c.method === "upsert")!;
    expect(upsert.args[0]).toMatchObject({ church_id: "church-1", stripe_account_id: "acct_church1", disconnected_at: null });
    expect(upsert.args[1]).toEqual({ onConflict: "church_id" });
  });

  it("disconnects by account, turning charges off", async () => {
    await markChurchStripeAccountDisconnected("acct_church1");
    expect(calls.find((c) => c.method === "update")!.args[0]).toMatchObject({ charges_enabled: false });
    expect(calls).toEqual(expect.arrayContaining([{ method: "eq", args: ["stripe_account_id", "acct_church1"] }]));
  });

  it("shows the admin card only the account's last characters", async () => {
    tableResults.push({ data: { stripe_account_id: "acct_1234567890", charges_enabled: true, details_submitted: true }, error: null });
    expect(await getChurchPaymentConnection("church-1")).toEqual({
      platformReady: true,
      connected: true,
      chargesEnabled: true,
      detailsSubmitted: true,
      accountHint: "…567890",
    });
  });

  it("reports the platform not ready without a Connect client id", async () => {
    vi.stubEnv("STRIPE_CONNECT_CLIENT_ID", "");
    expect(await getChurchPaymentConnection("church-1")).toMatchObject({ platformReady: false, connected: false });
  });
});
