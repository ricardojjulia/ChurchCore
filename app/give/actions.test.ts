import { beforeEach, describe, expect, it, vi } from "vitest";

// G3.1: one-time gifts from the public giving page, by signed-out visitors.
// Until this, the page showed "thank you" without charging or recording
// anything. The church comes from the live page's slug, never the browser.

const mocks = vi.hoisted(() => ({
  getPublicGivingPage: vi.fn(),
  onlineGivingStatus: vi.fn(),
  onlineGivingNotice: vi.fn(),
  createPaymentIntent: vi.fn(),
  cancelPaymentIntent: vi.fn(),
  stripePublishableKey: vi.fn(),
  completeDonation: vi.fn(),
  tenant: { client: null as unknown },
  ip: { value: "198.51.100.1" },
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": mocks.ip.value }) }));
vi.mock("@/lib/public-giving", () => ({ getPublicGivingPage: mocks.getPublicGivingPage }));
vi.mock("@/lib/stripe/donations", () => ({
  onlineGivingStatus: mocks.onlineGivingStatus,
  onlineGivingNotice: mocks.onlineGivingNotice,
  createPaymentIntent: mocks.createPaymentIntent,
  cancelPaymentIntent: mocks.cancelPaymentIntent,
  stripePublishableKey: mocks.stripePublishableKey,
}));
vi.mock("@/lib/stripe/donation-completion", () => ({ completeDonation: mocks.completeDonation }));
vi.mock("@/lib/supabase/tenant", () => ({ createTenantAdminClient: () => mocks.tenant.client }));

import { cancelPublicGiftAction, submitPublicGiftAction } from "@/app/give/actions";
import { fakeDb } from "@/lib/stripe/fake-db.testing";

const PAGE = {
  churchId: "church-1",
  churchName: "Grace Harbor",
  headline: "Give",
  description: null,
  funds: ["General Fund", "Missions"],
  allowAnonymous: true,
  slug: "grace-harbor",
};
const GIFT = { slug: "grace-harbor", amountCents: 5000, fund: "Missions", donorName: "Visitor", donorEmail: "Visitor@Example.org" };

let ipCounter = 0;

describe("public giving actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ip.value = `198.51.100.${++ipCounter}`;
    mocks.getPublicGivingPage.mockResolvedValue(PAGE);
    mocks.onlineGivingStatus.mockResolvedValue({ mode: "live", stripeAccount: "acct_church1" });
    mocks.onlineGivingNotice.mockReturnValue(null);
    mocks.stripePublishableKey.mockReturnValue("pk_test_1");
    mocks.createPaymentIntent.mockResolvedValue({ clientSecret: "pi_1_secret", paymentIntentId: "pi_1", isStub: false });
    mocks.completeDonation.mockResolvedValue(true);
  });

  it("records a pending gift for the page's church and returns the card step on its account", async () => {
    const db = fakeDb();
    mocks.tenant.client = db.client;

    const result = await submitPublicGiftAction(GIFT);

    expect(result).toMatchObject({ ok: true, paymentIntentId: "pi_1", checkout: { clientSecret: "pi_1_secret", stripeAccount: "acct_church1", publishableKey: "pk_test_1" } });
    expect(db.tables.donations[0]).toMatchObject({
      church_id: "church-1",
      profile_id: null,
      donor_name: "Visitor",
      donor_email: "visitor@example.org",
      amount_cents: 5000,
      fund_designation: "Missions",
      status: "pending",
      stripe_account_id: "acct_church1",
      stripe_payment_intent_id: "pi_1",
    });
    expect(mocks.getPublicGivingPage).toHaveBeenCalledWith("grace-harbor");
    expect(mocks.createPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ churchId: "church-1", stripeAccount: "acct_church1", amountCents: 5000 }));
    expect(mocks.completeDonation).not.toHaveBeenCalled(); // the webhook records it when Stripe says so
  });

  it.each([
    ["an unknown or unpublished page", (): void => void mocks.getPublicGivingPage.mockResolvedValue(null), {}, /isn't available/],
    ["a fund the church doesn't have", (): void => undefined, { fund: "Someone else's fund" }, /funds/],
    ["less than $1", (): void => undefined, { amountCents: 50 }, /at least \$1/],
    ["no email when not anonymous", (): void => undefined, { donorEmail: "" }, /email/],
    ["a malformed email", (): void => undefined, { donorEmail: "not-an-email" }, /email/],
  ] as const)("refuses %s, writing nothing", async (_label, arrange, change, error) => {
    arrange();
    const db = fakeDb();
    mocks.tenant.client = db.client;
    expect(await submitPublicGiftAction({ ...GIFT, ...change })).toEqual({ ok: false, error: expect.stringMatching(error) });
    expect(db.tables.donations ?? []).toHaveLength(0);
    expect(mocks.createPaymentIntent).not.toHaveBeenCalled();
  });

  it("refuses while the church can't take online gifts", async () => {
    mocks.onlineGivingStatus.mockResolvedValue({ mode: "not_connected", stripeAccount: null });
    mocks.onlineGivingNotice.mockReturnValue("Online giving isn't set up for this church yet.");
    const db = fakeDb();
    mocks.tenant.client = db.client;
    expect(await submitPublicGiftAction(GIFT)).toEqual({ ok: false, error: "Online giving isn't set up for this church yet." });
    expect(db.tables.donations ?? []).toHaveLength(0);
  });

  it("keeps an anonymous gift's name out of church records", async () => {
    const db = fakeDb();
    mocks.tenant.client = db.client;
    await submitPublicGiftAction({ ...GIFT, isAnonymous: true, donorEmail: null });
    expect(db.tables.donations[0]).toMatchObject({ donor_name: null, is_anonymous: true });
  });

  it("ignores anonymity when the page doesn't allow it, and then needs an email", async () => {
    mocks.getPublicGivingPage.mockResolvedValue({ ...PAGE, allowAnonymous: false });
    mocks.tenant.client = fakeDb().client;
    expect(await submitPublicGiftAction({ ...GIFT, isAnonymous: true, donorEmail: null })).toMatchObject({ ok: false, error: expect.stringMatching(/email/) });
  });

  it("in stub mode, records the gift at once, by its id (every stub shares one PaymentIntent id)", async () => {
    mocks.onlineGivingStatus.mockResolvedValue({ mode: "stub", stripeAccount: null });
    mocks.createPaymentIntent.mockResolvedValue({ clientSecret: "pi_stub_secret_test", paymentIntentId: "pi_stub", isStub: true });
    const db = fakeDb();
    mocks.tenant.client = db.client;
    const result = await submitPublicGiftAction(GIFT);
    expect(result).toMatchObject({ ok: true, checkout: null });
    const id = db.tables.donations[0].id;
    expect(mocks.completeDonation).toHaveBeenCalledWith(db.client, "church-1", { id }, { churchName: "Grace Harbor" });
  });

  it("marks the gift failed, and says so, when Stripe fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createPaymentIntent.mockRejectedValue(new Error("stripe down"));
    const db = fakeDb();
    mocks.tenant.client = db.client;
    expect(await submitPublicGiftAction(GIFT)).toEqual({ ok: false, error: "Couldn't start the payment. Please try again." });
    expect(db.tables.donations[0].status).toBe("failed");
  });

  it("limits how fast one connection can give", async () => {
    mocks.tenant.client = fakeDb().client;
    const results = [];
    for (let i = 0; i < 11; i++) results.push(await submitPublicGiftAction(GIFT));
    expect(results[10]).toEqual({ ok: false, error: expect.stringMatching(/Too many gifts/) });
  });

  describe("cancelPublicGiftAction", () => {
    const PENDING = { id: "don-1", church_id: "church-1", profile_id: null, status: "pending", stripe_payment_intent_id: "pi_1", stripe_account_id: "acct_church1" };

    it("cancels the PaymentIntent on the church's account, then the pending gift", async () => {
      mocks.cancelPaymentIntent.mockResolvedValue("canceled");
      const db = fakeDb({ donations: [{ ...PENDING }] });
      mocks.tenant.client = db.client;
      expect(await cancelPublicGiftAction("don-1", "pi_1")).toEqual({ ok: true, cancelled: true });
      expect(mocks.cancelPaymentIntent).toHaveBeenCalledWith("pi_1", "acct_church1");
      expect(db.tables.donations[0].status).toBe("cancelled");
    });

    it("needs the matching pair, and never touches a member's gift or a paid one", async () => {
      const db = fakeDb({
        donations: [
          { ...PENDING },
          { ...PENDING, id: "don-2", profile_id: "profile-1", stripe_payment_intent_id: "pi_2" },
          { ...PENDING, id: "don-3", status: "succeeded", stripe_payment_intent_id: "pi_3" },
        ],
      });
      mocks.tenant.client = db.client;
      expect(await cancelPublicGiftAction("don-1", "pi_other")).toEqual({ ok: true, cancelled: false });
      expect(await cancelPublicGiftAction("don-2", "pi_2")).toEqual({ ok: true, cancelled: false });
      expect(await cancelPublicGiftAction("don-3", "pi_3")).toEqual({ ok: true, cancelled: false });
      expect(mocks.cancelPaymentIntent).not.toHaveBeenCalled();
    });

    it("leaves the gift for the webhook when Stripe says it was paid after all", async () => {
      mocks.cancelPaymentIntent.mockResolvedValue("succeeded");
      const db = fakeDb({ donations: [{ ...PENDING }] });
      mocks.tenant.client = db.client;
      expect(await cancelPublicGiftAction("don-1", "pi_1")).toEqual({ ok: true, cancelled: false });
      expect(db.tables.donations[0].status).toBe("pending");
    });
  });
});
