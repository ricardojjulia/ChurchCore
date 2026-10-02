import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// G3.0b (ADR 0025): "Connect with Stripe" sends a church admin to Stripe's
// OAuth page, or back to settings with a reason it can't.

const mocks = vi.hoisted(() => ({
  requireChurchSession: vi.fn(),
  getChurchStripeAccount: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireChurchSession: mocks.requireChurchSession }));
vi.mock("@/lib/app-url", () => ({ appBaseUrl: () => "https://app.example" }));
vi.mock("@/lib/stripe/connect", () => ({
  getChurchStripeAccount: mocks.getChurchStripeAccount,
  signConnectState: () => "signed.state",
  stripeConnectClientId: () => process.env.STRIPE_CONNECT_CLIENT_ID || null,
  stripeConnectAuthorizeUrl: ({ state, redirectUri }: { state: string; redirectUri: string }) =>
    `https://connect.stripe.com/oauth/authorize?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`,
}));

import { GET } from "@/app/api/stripe/connect/start/route";

const ADMIN = { userId: "login-1", churchProfileId: "profile-1", appContext: { roleId: "church-admin", church: { id: "church-1" } } };

describe("GET /api/stripe/connect/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_platform");
    vi.stubEnv("STRIPE_CONNECT_CLIENT_ID", "ca_platform");
    mocks.requireChurchSession.mockResolvedValue(ADMIN);
    mocks.getChurchStripeAccount.mockResolvedValue(null);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends a church admin to Stripe, coming back to the callback", async () => {
    const location = (await GET()).headers.get("location")!;
    expect(location).toMatch(/^https:\/\/connect\.stripe\.com\/oauth\/authorize\?/);
    expect(decodeURIComponent(location)).toContain("redirect_uri=https://app.example/api/stripe/connect/callback");
  });

  it("returns not_configured, not a 500, when the platform's secret key is missing (PR #174 review)", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const response = await GET();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example/app/church-admin/giving?stripe=not_configured");
  });

  it("returns not_configured without a Connect client id", async () => {
    vi.stubEnv("STRIPE_CONNECT_CLIENT_ID", "");
    expect((await GET()).headers.get("location")).toContain("?stripe=not_configured");
  });

  it("refuses to start a second connection while the church is connected", async () => {
    mocks.getChurchStripeAccount.mockResolvedValue({ accountId: "acct_1", chargesEnabled: true, detailsSubmitted: true });
    expect((await GET()).headers.get("location")).toContain("?stripe=already_connected");
  });

  it("is church-admin only", async () => {
    mocks.requireChurchSession.mockResolvedValue({ ...ADMIN, appContext: { ...ADMIN.appContext, roleId: "pastor" } });
    expect((await GET()).status).toBe(403);
  });
});
