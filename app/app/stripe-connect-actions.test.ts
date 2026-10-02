import { beforeEach, describe, expect, it, vi } from "vitest";

// G3.0b (ADR 0025): disconnecting revokes ChurchCore's access at Stripe and
// then marks the link disconnected; church admins only.

const mocks = vi.hoisted(() => ({
  requireChurchSession: vi.fn(),
  getChurchStripeAccount: vi.fn(),
  deauthorizeConnectedAccount: vi.fn(),
  markChurchStripeAccountDisconnected: vi.fn(),
  logAuditEvent: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ requireChurchSession: mocks.requireChurchSession }));
vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock("@/lib/stripe/connect", () => ({
  getChurchStripeAccount: mocks.getChurchStripeAccount,
  deauthorizeConnectedAccount: mocks.deauthorizeConnectedAccount,
  markChurchStripeAccountDisconnected: mocks.markChurchStripeAccountDisconnected,
}));

import { disconnectStripeAccountAction } from "@/app/app/stripe-connect-actions";

const ADMIN = { userId: "login-1", churchProfileId: "profile-1", appContext: { roleId: "church-admin", church: { id: "church-1" } } };

describe("disconnectStripeAccountAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireChurchSession.mockResolvedValue(ADMIN);
    mocks.getChurchStripeAccount.mockResolvedValue({ accountId: "acct_church1", chargesEnabled: true, detailsSubmitted: true });
    mocks.deauthorizeConnectedAccount.mockResolvedValue(undefined);
    mocks.markChurchStripeAccountDisconnected.mockResolvedValue(undefined);
    mocks.logAuditEvent.mockResolvedValue(undefined);
  });

  it("revokes access at Stripe, then marks this church's link disconnected", async () => {
    expect(await disconnectStripeAccountAction()).toEqual({ ok: true });
    expect(mocks.getChurchStripeAccount).toHaveBeenCalledWith("church-1");
    expect(mocks.deauthorizeConnectedAccount).toHaveBeenCalledWith("acct_church1");
    expect(mocks.markChurchStripeAccountDisconnected).toHaveBeenCalledWith("acct_church1");
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ operation: "UPDATE", churchId: "church-1" }));
  });

  it("refuses anyone but a church admin, touching nothing", async () => {
    mocks.requireChurchSession.mockResolvedValue({ ...ADMIN, appContext: { ...ADMIN.appContext, roleId: "pastor" } });
    expect(await disconnectStripeAccountAction()).toMatchObject({ ok: false });
    expect(mocks.getChurchStripeAccount).not.toHaveBeenCalled();
    expect(mocks.deauthorizeConnectedAccount).not.toHaveBeenCalled();
  });

  it("still records the disconnect when the church already revoked access at Stripe", async () => {
    mocks.deauthorizeConnectedAccount.mockRejectedValue(
      new Error("This application is not connected to stripe account acct_church1, or that account does not exist."),
    );
    expect(await disconnectStripeAccountAction()).toEqual({ ok: true });
    expect(mocks.markChurchStripeAccountDisconnected).toHaveBeenCalledWith("acct_church1");
  });

  it("keeps the link when Stripe fails for any other reason, so ChurchCore and Stripe agree", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.deauthorizeConnectedAccount.mockRejectedValue(new Error("Invalid API Key provided"));
    expect(await disconnectStripeAccountAction()).toMatchObject({ ok: false });
    expect(mocks.markChurchStripeAccountDisconnected).not.toHaveBeenCalled();
  });

  it("does nothing when the church isn't connected", async () => {
    mocks.getChurchStripeAccount.mockResolvedValue(null);
    expect(await disconnectStripeAccountAction()).toEqual({ ok: true });
    expect(mocks.deauthorizeConnectedAccount).not.toHaveBeenCalled();
  });
});
