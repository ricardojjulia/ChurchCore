import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// G3.1: a member's recurring gift, on the church's own Stripe account
// (ADR 0025). Ownership comes from the session (church and profile), so one
// member can't touch another's gift; admins act church-wide.

vi.mock("server-only", () => ({}));
const stripe = vi.hoisted(() => ({
  onlineGivingStatus: vi.fn(),
  onlineGivingNotice: vi.fn(),
  createOrGetStripeCustomer: vi.fn(),
  cancelStripeSubscription: vi.fn(),
  stripePublishableKey: vi.fn(),
  createRecurringSubscription: vi.fn(),
  retrieveSubscriptionState: vi.fn(),
  updateSubscriptionAmount: vi.fn(),
  replaceSubscriptionForFrequency: vi.fn(),
  setSubscriptionPaused: vi.fn(),
}));
vi.mock("@/lib/stripe/donations", () => ({
  onlineGivingStatus: stripe.onlineGivingStatus,
  onlineGivingNotice: stripe.onlineGivingNotice,
  createOrGetStripeCustomer: stripe.createOrGetStripeCustomer,
  cancelStripeSubscription: stripe.cancelStripeSubscription,
  stripePublishableKey: stripe.stripePublishableKey,
}));
vi.mock("@/lib/stripe/recurring", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/stripe/recurring")>()),
  createRecurringSubscription: stripe.createRecurringSubscription,
  retrieveSubscriptionState: stripe.retrieveSubscriptionState,
  updateSubscriptionAmount: stripe.updateSubscriptionAmount,
  replaceSubscriptionForFrequency: stripe.replaceSubscriptionForFrequency,
  setSubscriptionPaused: stripe.setSubscriptionPaused,
}));

import {
  cancelRecurringGift,
  confirmRecurringGift,
  listChurchRecurringGifts,
  setRecurringGiftPaused,
  startRecurringGift,
  updateRecurringGift,
} from "@/lib/recurring-gifts";
import { fakeDb } from "@/lib/stripe/fake-db.testing";

const CTX = { churchId: "church-1", profileId: "profile-1", timeZone: "America/Chicago" };
const PROFILE = { id: "profile-1", church_id: "church-1", full_name: "Maya", email: "maya@example.org" };
const GIFT = {
  id: "rg-1",
  church_id: "church-1",
  profile_id: "profile-1",
  amount_cents: 2500,
  currency: "usd",
  fund_designation: "General",
  frequency: "monthly",
  start_date: "2026-10-02",
  status: "active",
  is_anonymous: false,
  stripe_subscription_id: "sub_1",
  stripe_account_id: "acct_church1",
  next_payment_at: null,
  last_payment_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T15:00:00Z")); // Oct 2, 10 am in Chicago
  stripe.onlineGivingStatus.mockResolvedValue({ mode: "live", stripeAccount: "acct_church1" });
  stripe.onlineGivingNotice.mockReturnValue(null);
  stripe.stripePublishableKey.mockReturnValue("pk_test_1");
  stripe.createOrGetStripeCustomer.mockResolvedValue("cus_1");
  stripe.createRecurringSubscription.mockResolvedValue({
    subscriptionId: "sub_new",
    status: "incomplete",
    intentType: "payment",
    clientSecret: "pi_secret",
    nextPaymentAt: "2026-11-02T15:00:00.000Z",
  });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("startRecurringGift", () => {
  const input = { amountCents: 2500, fundDesignation: "Missions", frequency: "monthly" };

  it("writes the gift incomplete, creates the subscription on the church's account, and returns the card step", async () => {
    const db = fakeDb({ profiles: [PROFILE] });
    const result = await startRecurringGift(db.client, CTX, input);

    expect(result).toMatchObject({
      ok: true,
      checkout: { clientSecret: "pi_secret", intentType: "payment", publishableKey: "pk_test_1", stripeAccount: "acct_church1" },
    });
    expect(db.tables.recurring_gifts[0]).toMatchObject({
      church_id: "church-1",
      profile_id: "profile-1",
      amount_cents: 2500,
      fund_designation: "Missions",
      frequency: "monthly",
      start_date: "2026-10-02",
      status: "incomplete",
      stripe_subscription_id: "sub_new",
      stripe_customer_id: "cus_1",
      stripe_account_id: "acct_church1",
    });
    expect(stripe.createOrGetStripeCustomer).toHaveBeenCalledWith(expect.objectContaining({ email: "maya@example.org", stripeAccount: "acct_church1" }));
    expect(stripe.createRecurringSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ churchId: "church-1", stripeAccount: "acct_church1", startsToday: true, timeZone: "America/Chicago" }),
    );
  });

  it("starts later when given a future date in the church's time zone", async () => {
    const db = fakeDb({ profiles: [PROFILE] });
    await startRecurringGift(db.client, CTX, { ...input, startDate: "2026-11-01" });
    expect(stripe.createRecurringSubscription).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-11-01", startsToday: false }));
  });

  it.each([
    [{ amountCents: 0 }, /between/],
    [{ amountCents: 12.5 }, /between/],
    [{ frequency: "daily" }, /weekly, every two weeks, or monthly/],
    [{ startDate: "2026-10-01" }, /from today on/],
    [{ startDate: "2027-12-01" }, /within the next year/],
    [{ startDate: "not-a-date" }, /from today on/],
  ])("refuses %o, writing nothing and calling no Stripe API", async (change, error) => {
    const db = fakeDb({ profiles: [PROFILE] });
    expect(await startRecurringGift(db.client, CTX, { ...input, ...change })).toEqual({ ok: false, error: expect.stringMatching(error) });
    expect(db.tables.recurring_gifts ?? []).toHaveLength(0);
    expect(stripe.createRecurringSubscription).not.toHaveBeenCalled();
  });

  it("refuses while the church can't take online gifts", async () => {
    stripe.onlineGivingStatus.mockResolvedValue({ mode: "not_connected", stripeAccount: null });
    stripe.onlineGivingNotice.mockReturnValue("Online giving isn't set up for this church yet.");
    const db = fakeDb({ profiles: [PROFILE] });
    expect(await startRecurringGift(db.client, CTX, input)).toEqual({ ok: false, error: "Online giving isn't set up for this church yet." });
    expect(db.tables.recurring_gifts ?? []).toHaveLength(0);
  });

  it("needs an email on the member's profile, for the receipts", async () => {
    const db = fakeDb({ profiles: [{ ...PROFILE, email: null }] });
    expect(await startRecurringGift(db.client, CTX, input)).toMatchObject({ ok: false, error: expect.stringMatching(/email/) });
  });

  it("in stub mode (development, demo), makes the gift active with no card step", async () => {
    stripe.onlineGivingStatus.mockResolvedValue({ mode: "stub", stripeAccount: null });
    const db = fakeDb({ profiles: [PROFILE] });
    const result = await startRecurringGift(db.client, CTX, input);
    expect(result).toMatchObject({ ok: true, checkout: null });
    expect(db.tables.recurring_gifts[0]).toMatchObject({ status: "active", stripe_subscription_id: expect.stringMatching(/^sub_stub_/) });
    expect(stripe.createRecurringSubscription).not.toHaveBeenCalled();
  });

  it("cancels the subscription at Stripe too when recording it fails afterwards (Council Review 38)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stripe.cancelStripeSubscription.mockResolvedValue({ cancelled: true, isStub: false });
    const db = fakeDb({ profiles: [PROFILE] });
    // The first write (the insert) succeeds; the link update after the subscription fails.
    db.failOn.add("recurring_gifts");
    const insertFirst = await startRecurringGift(db.client, CTX, { amountCents: 2500, frequency: "monthly" });
    expect(insertFirst).toMatchObject({ ok: false });
    expect(stripe.createRecurringSubscription).not.toHaveBeenCalled();

    const db2 = fakeDb({ profiles: [PROFILE] });
    const realFrom = (db2.client as unknown as { from: (t: string) => unknown }).from;
    let recurringWrites = 0;
    (db2.client as unknown as { from: (t: string) => unknown }).from = (table: string) => {
      if (table === "recurring_gifts" && ++recurringWrites === 2) db2.failOn.add("recurring_gifts");
      return realFrom(table);
    };
    expect(await startRecurringGift(db2.client, CTX, { amountCents: 2500, frequency: "monthly" })).toMatchObject({ ok: false });
    expect(stripe.cancelStripeSubscription).toHaveBeenCalledWith("sub_new", "church-1", "acct_church1");
    expect(db2.tables.recurring_gifts[0].status).toBe("cancelled");
  });

  it("keeps a subscription Stripe set up with no card step only when Stripe holds a card for it (PR #177 review)", async () => {
    stripe.createRecurringSubscription.mockResolvedValue({ subscriptionId: "sub_new", status: "active", intentType: "payment", clientSecret: null, nextPaymentAt: null });
    stripe.retrieveSubscriptionState.mockResolvedValue({ status: "active", paused: false, nextPaymentAt: null, cardSaved: true });
    const db = fakeDb({ profiles: [PROFILE] });
    expect(await startRecurringGift(db.client, CTX, { amountCents: 2500, frequency: "monthly" })).toMatchObject({ ok: true, checkout: null });
    expect(db.tables.recurring_gifts[0]).toMatchObject({ status: "active", stripe_subscription_id: "sub_new" });

    vi.spyOn(console, "error").mockImplementation(() => {});
    stripe.retrieveSubscriptionState.mockResolvedValue({ status: "incomplete", paused: false, nextPaymentAt: null, cardSaved: false });
    stripe.cancelStripeSubscription.mockResolvedValue({ cancelled: true, isStub: false });
    const db2 = fakeDb({ profiles: [PROFILE] });
    expect(await startRecurringGift(db2.client, CTX, { amountCents: 2500, frequency: "monthly" })).toMatchObject({ ok: false });
    expect(stripe.cancelStripeSubscription).toHaveBeenCalledWith("sub_new", "church-1", "acct_church1");
  });

  it("cancels the half-made gift, and says so, when Stripe fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stripe.createRecurringSubscription.mockRejectedValue(new Error("card_error"));
    const db = fakeDb({ profiles: [PROFILE] });
    expect(await startRecurringGift(db.client, CTX, input)).toEqual({ ok: false, error: "Couldn't start your recurring gift. Please try again." });
    expect(db.tables.recurring_gifts[0].status).toBe("cancelled");
  });
});

describe("managing a recurring gift", () => {
  it("confirms from Stripe's own report, not the browser's", async () => {
    stripe.retrieveSubscriptionState.mockResolvedValue({ status: "active", paused: false, nextPaymentAt: "2026-11-02T00:00:00Z", cardSaved: true });
    const db = fakeDb({ recurring_gifts: [{ ...GIFT, status: "incomplete" }] });
    const result = await confirmRecurringGift(db.client, "church-1", "profile-1", "rg-1");
    expect(stripe.retrieveSubscriptionState).toHaveBeenCalledWith("sub_1", "acct_church1");
    expect(result).toMatchObject({ ok: true, gift: { status: "active", nextPaymentAt: "2026-11-02T00:00:00Z" } });
  });

  it("keeps a future-dated gift incomplete until Stripe holds a card for it (PR #177 review)", async () => {
    stripe.retrieveSubscriptionState.mockResolvedValue({ status: "trialing", paused: false, nextPaymentAt: "2026-11-02T00:00:00Z", cardSaved: false });
    const db = fakeDb({ recurring_gifts: [{ ...GIFT, status: "incomplete" }] });
    expect(await confirmRecurringGift(db.client, "church-1", "profile-1", "rg-1")).toMatchObject({ ok: true, gift: { status: "incomplete" } });

    stripe.retrieveSubscriptionState.mockResolvedValue({ status: "trialing", paused: false, nextPaymentAt: "2026-11-02T00:00:00Z", cardSaved: true });
    expect(await confirmRecurringGift(db.client, "church-1", "profile-1", "rg-1")).toMatchObject({ ok: true, gift: { status: "active" } });
  });

  it("refuses another member's gift, and another church's, touching nothing at Stripe", async () => {
    const db = fakeDb({ recurring_gifts: [{ ...GIFT }] });
    expect(await cancelRecurringGift(db.client, "church-1", "profile-2", "rg-1")).toMatchObject({ ok: false });
    expect(await setRecurringGiftPaused(db.client, "church-2", null, "rg-1", true)).toMatchObject({ ok: false });
    expect(await updateRecurringGift(db.client, "church-1", "profile-2", "rg-1", { amountCents: 100 })).toMatchObject({ ok: false });
    expect(stripe.cancelStripeSubscription).not.toHaveBeenCalled();
    expect(stripe.setSubscriptionPaused).not.toHaveBeenCalled();
    expect(db.tables.recurring_gifts[0].status).toBe("active");
  });

  it("changes the amount on the subscription, from the next gift", async () => {
    const db = fakeDb({ recurring_gifts: [{ ...GIFT }] });
    const result = await updateRecurringGift(db.client, "church-1", "profile-1", "rg-1", { amountCents: 5000, fundDesignation: "Missions" });
    expect(stripe.updateSubscriptionAmount).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: "sub_1", stripeAccount: "acct_church1", amountCents: 5000, frequency: "monthly" }));
    expect(stripe.replaceSubscriptionForFrequency).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, gift: { amountCents: 5000, frequency: "monthly", fundDesignation: "Missions" } });
  });

  it("changes the frequency from the next gift date on a replacement subscription, and records it (PR #177 review)", async () => {
    stripe.replaceSubscriptionForFrequency.mockResolvedValue({ subscriptionId: "sub_2", nextPaymentAt: "2026-11-02T15:00:00.000Z" });
    const db = fakeDb({ recurring_gifts: [{ ...GIFT, status: "paused" }] });
    await updateRecurringGift(db.client, "church-1", "profile-1", "rg-1", { frequency: "weekly", amountCents: 1000 });
    expect(stripe.replaceSubscriptionForFrequency).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: "sub_1", recurringGiftId: "rg-1", frequency: "weekly", amountCents: 1000, paused: true }),
    );
    expect(db.tables.recurring_gifts[0]).toMatchObject({ stripe_subscription_id: "sub_2", frequency: "weekly", next_payment_at: "2026-11-02T15:00:00.000Z" });
  });

  it("refuses a frequency change while a payment is past due", async () => {
    const db = fakeDb({ recurring_gifts: [{ ...GIFT, status: "past_due" }] });
    expect(await updateRecurringGift(db.client, "church-1", "profile-1", "rg-1", { frequency: "weekly" })).toMatchObject({ ok: false, error: expect.stringMatching(/settled/) });
    expect(stripe.replaceSubscriptionForFrequency).not.toHaveBeenCalled();
  });

  it("changes only the fund without calling Stripe", async () => {
    const db = fakeDb({ recurring_gifts: [{ ...GIFT }] });
    await updateRecurringGift(db.client, "church-1", "profile-1", "rg-1", { fundDesignation: "Missions" });
    expect(stripe.updateSubscriptionAmount).not.toHaveBeenCalled();
    expect(db.tables.recurring_gifts[0].fund_designation).toBe("Missions");
  });

  it("pauses an active gift and resumes a paused one; refuses the wrong way round", async () => {
    const db = fakeDb({ recurring_gifts: [{ ...GIFT }] });
    expect(await setRecurringGiftPaused(db.client, "church-1", "profile-1", "rg-1", false)).toMatchObject({ ok: false });
    expect(await setRecurringGiftPaused(db.client, "church-1", "profile-1", "rg-1", true)).toMatchObject({ ok: true, gift: { status: "paused" } });
    expect(stripe.setSubscriptionPaused).toHaveBeenCalledWith("sub_1", "acct_church1", true);
    expect(await setRecurringGiftPaused(db.client, "church-1", "profile-1", "rg-1", false)).toMatchObject({ ok: true, gift: { status: "active" } });
  });

  it("an admin (no profile) can pause or cancel any gift in their church", async () => {
    const db = fakeDb({ recurring_gifts: [{ ...GIFT }] });
    expect(await cancelRecurringGift(db.client, "church-1", null, "rg-1")).toMatchObject({ ok: true, gift: { status: "cancelled" } });
    expect(stripe.cancelStripeSubscription).toHaveBeenCalledWith("sub_1", "church-1", "acct_church1");
  });

  it("cancels a stubbed gift without calling Stripe", async () => {
    const db = fakeDb({ recurring_gifts: [{ ...GIFT, stripe_subscription_id: "sub_stub_rg-1" }] });
    await cancelRecurringGift(db.client, "church-1", "profile-1", "rg-1");
    expect(stripe.cancelStripeSubscription).not.toHaveBeenCalled();
    expect(db.tables.recurring_gifts[0].status).toBe("cancelled");
  });

  it("shows admins the giver's name, never an anonymous giver's", async () => {
    const db = fakeDb({
      recurring_gifts: [
        { ...GIFT, profiles: { full_name: "Maya" } },
        { ...GIFT, id: "rg-2", is_anonymous: true, profiles: { full_name: "Hidden Giver" } },
      ],
    });
    const gifts = await listChurchRecurringGifts(db.client, "church-1");
    expect(gifts.map((gift) => gift.donorName)).toEqual(["Maya", null]);
  });
});
