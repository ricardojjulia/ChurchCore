import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// G3.0b (ADR 0025): the OAuth callback links a Stripe account to a church
// only when the signed state names the signed-in church admin and church.

const mocks = vi.hoisted(() => ({
  requireChurchSession: vi.fn(),
  verifyConnectState: vi.fn(),
  exchangeConnectCode: vi.fn(),
  retrieveConnectedAccountStatus: vi.fn(),
  saveChurchStripeAccount: vi.fn(),
  logAuditEvent: vi.fn(),
  getChurchStripeAccount: vi.fn(),
  churchForStripeAccount: vi.fn(),
  deauthorizeConnectedAccount: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireChurchSession: mocks.requireChurchSession }));
vi.mock("@/lib/app-url", () => ({ appBaseUrl: () => "https://app.example" }));
vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock("@/lib/stripe/connect", () => ({
  verifyConnectState: mocks.verifyConnectState,
  exchangeConnectCode: mocks.exchangeConnectCode,
  retrieveConnectedAccountStatus: mocks.retrieveConnectedAccountStatus,
  saveChurchStripeAccount: mocks.saveChurchStripeAccount,
  getChurchStripeAccount: mocks.getChurchStripeAccount,
  churchForStripeAccount: mocks.churchForStripeAccount,
  deauthorizeConnectedAccount: mocks.deauthorizeConnectedAccount,
}));

import { GET } from "@/app/api/stripe/connect/callback/route";

const ADMIN = {
  userId: "login-1",
  churchProfileId: "profile-1",
  appContext: { roleId: "church-admin", church: { id: "church-1" } },
};

const callback = (query: string) => GET(new NextRequest(`https://app.example/api/stripe/connect/callback?${query}`));
const resultOf = (response: Response) => new URL(response.headers.get("location")!).searchParams.get("stripe");

describe("GET /api/stripe/connect/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireChurchSession.mockResolvedValue(ADMIN);
    mocks.verifyConnectState.mockReturnValue({ churchId: "church-1", profileId: "profile-1" });
    mocks.exchangeConnectCode.mockResolvedValue("acct_church1");
    mocks.retrieveConnectedAccountStatus.mockResolvedValue({ chargesEnabled: true, detailsSubmitted: true });
    mocks.saveChurchStripeAccount.mockResolvedValue(undefined);
    mocks.logAuditEvent.mockResolvedValue(undefined);
    mocks.getChurchStripeAccount.mockResolvedValue(null);
    mocks.churchForStripeAccount.mockResolvedValue(null);
    mocks.deauthorizeConnectedAccount.mockResolvedValue(undefined);
  });

  it("links the authorized account to the admin's church and audits it", async () => {
    const response = await callback("code=ac_1&state=signed");
    expect(resultOf(response)).toBe("connected");
    expect(mocks.exchangeConnectCode).toHaveBeenCalledWith("ac_1");
    expect(mocks.saveChurchStripeAccount).toHaveBeenCalledWith({
      churchId: "church-1",
      accountId: "acct_church1",
      chargesEnabled: true,
      detailsSubmitted: true,
      connectedBy: "profile-1",
    });
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tableName: "church_payment_accounts", churchId: "church-1", actorId: "login-1" }),
    );
  });

  it("reports pending when Stripe isn't letting the account take charges yet", async () => {
    mocks.retrieveConnectedAccountStatus.mockResolvedValue({ chargesEnabled: false, detailsSubmitted: false });
    expect(resultOf(await callback("code=ac_1&state=signed"))).toBe("pending");
    expect(mocks.saveChurchStripeAccount).toHaveBeenCalledWith(expect.objectContaining({ chargesEnabled: false }));
  });

  it.each([
    ["an invalid or expired state", () => mocks.verifyConnectState.mockReturnValue(null)],
    ["a state for another church", () => mocks.verifyConnectState.mockReturnValue({ churchId: "church-2", profileId: "profile-1" })],
    ["a state another admin started", () => mocks.verifyConnectState.mockReturnValue({ churchId: "church-1", profileId: "profile-2" })],
    ["a caller who isn't a church admin", () => mocks.requireChurchSession.mockResolvedValue({ ...ADMIN, appContext: { ...ADMIN.appContext, roleId: "pastor" } })],
  ])("links nothing for %s", async (_label, arrange) => {
    arrange();
    expect(resultOf(await callback("code=ac_1&state=signed"))).toBe("invalid");
    expect(mocks.exchangeConnectCode).not.toHaveBeenCalled();
    expect(mocks.saveChurchStripeAccount).not.toHaveBeenCalled();
  });

  it("links nothing without a code", async () => {
    expect(resultOf(await callback("state=signed"))).toBe("invalid");
    expect(mocks.exchangeConnectCode).not.toHaveBeenCalled();
  });

  it("reports cancelled when the admin declined at Stripe", async () => {
    expect(resultOf(await callback("error=access_denied&state=signed"))).toBe("cancelled");
    expect(mocks.verifyConnectState).not.toHaveBeenCalled();
  });

  it("refuses a second account while the church is connected: disconnect first to switch", async () => {
    mocks.getChurchStripeAccount.mockResolvedValue({ accountId: "acct_current", chargesEnabled: true, detailsSubmitted: true });
    expect(resultOf(await callback("code=ac_1&state=signed"))).toBe("already_connected");
    expect(mocks.exchangeConnectCode).not.toHaveBeenCalled();
  });

  it("refuses an account another church is connected to, without revoking it (that would cut the other church off)", async () => {
    mocks.churchForStripeAccount.mockResolvedValue("church-2");
    expect(resultOf(await callback("code=ac_1&state=signed"))).toBe("in_use");
    expect(mocks.churchForStripeAccount).toHaveBeenCalledWith("acct_church1", { activeOnly: true });
    expect(mocks.saveChurchStripeAccount).not.toHaveBeenCalled();
    expect(mocks.deauthorizeConnectedAccount).not.toHaveBeenCalled();
  });

  it("revokes the just-authorized account when linking it fails, so no access is left unlinked (PR #174 review)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.saveChurchStripeAccount.mockRejectedValue(new Error("db down"));
    expect(resultOf(await callback("code=ac_1&state=signed"))).toBe("failed");
    expect(mocks.deauthorizeConnectedAccount).toHaveBeenCalledWith("acct_church1");
  });

  it("doesn't revoke when it can't tell whether another church relies on the account", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.churchForStripeAccount.mockRejectedValue(new Error("db down"));
    expect(resultOf(await callback("code=ac_1&state=signed"))).toBe("failed");
    expect(mocks.deauthorizeConnectedAccount).not.toHaveBeenCalled();
  });

  it("reports failed, saving nothing, when Stripe's exchange fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.exchangeConnectCode.mockRejectedValue(new Error("invalid_grant"));
    expect(resultOf(await callback("code=ac_1&state=signed"))).toBe("failed");
    expect(mocks.saveChurchStripeAccount).not.toHaveBeenCalled();
  });
});
