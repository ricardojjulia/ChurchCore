import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// G3.1: the exact requests a recurring gift sends to Stripe, on the church's
// own connected account (ADR 0025). Council Review 34 found a malformed
// parameter that meant no live PaymentIntent could ever be created, so the
// wire format is pinned here.

vi.mock("server-only", () => ({}));
const { tenant } = vi.hoisted(() => ({ tenant: { client: null as unknown } }));
vi.mock("@/lib/supabase/tenant", () => ({ createTenantAdminClient: () => tenant.client }));

import { fakeDb } from "@/lib/stripe/fake-db.testing";
import {
  createRecurringSubscription,
  ensureRecurringProduct,
  recurringStatusFromStripe,
  setSubscriptionPaused,
  stripeInterval,
  updateSubscriptionPlan,
} from "@/lib/stripe/recurring";

type Call = { url: string; method: string; body: URLSearchParams; account: string | undefined };

function stubStripe(responses: unknown[]) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    calls.push({ url, method: init.method ?? "GET", body: new URLSearchParams(String(init.body ?? "")), account: headers["Stripe-Account"] });
    return new Response(JSON.stringify(responses.shift() ?? {}), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const ACCOUNT_ROW = { church_id: "church-1", stripe_account_id: "acct_church1", stripe_recurring_product_id: null, disconnected_at: null };

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_platform");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("stripe recurring helpers", () => {
  it("maps frequencies to Stripe intervals", () => {
    expect(stripeInterval("weekly")).toEqual({ interval: "week", count: 1 });
    expect(stripeInterval("biweekly")).toEqual({ interval: "week", count: 2 });
    expect(stripeInterval("monthly")).toEqual({ interval: "month", count: 1 });
  });

  it("maps Stripe's statuses to the gift's", () => {
    expect(recurringStatusFromStripe("active", false)).toBe("active");
    expect(recurringStatusFromStripe("trialing", false)).toBe("active");
    expect(recurringStatusFromStripe("active", true)).toBe("paused");
    expect(recurringStatusFromStripe("past_due", false)).toBe("past_due");
    expect(recurringStatusFromStripe("unpaid", false)).toBe("past_due");
    expect(recurringStatusFromStripe("incomplete", false)).toBe("incomplete");
    expect(recurringStatusFromStripe("incomplete_expired", false)).toBe("cancelled");
    expect(recurringStatusFromStripe("canceled", false)).toBe("cancelled");
  });

  it("creates the church's product once, on its account, and remembers it", async () => {
    const db = fakeDb({ church_payment_accounts: [{ ...ACCOUNT_ROW }] });
    tenant.client = db.client;
    const calls = stubStripe([{ id: "prod_1" }]);

    expect(await ensureRecurringProduct("church-1", "acct_church1")).toBe("prod_1");
    expect(await ensureRecurringProduct("church-1", "acct_church1")).toBe("prod_1");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "https://api.stripe.com/v1/products", account: "acct_church1" });
    expect(db.tables.church_payment_accounts[0].stripe_recurring_product_id).toBe("prod_1");
  });

  it("refuses when the church's connected account changed meanwhile", async () => {
    tenant.client = fakeDb({ church_payment_accounts: [{ ...ACCOUNT_ROW, stripe_account_id: "acct_new" }] }).client;
    stubStripe([]);
    await expect(ensureRecurringProduct("church-1", "acct_church1")).rejects.toThrow(/changed/);
  });

  it("starting today: an incomplete subscription whose first invoice's PaymentIntent the card step confirms", async () => {
    tenant.client = fakeDb({ church_payment_accounts: [{ ...ACCOUNT_ROW, stripe_recurring_product_id: "prod_1" }] }).client;
    const calls = stubStripe([
      { id: "sub_1", status: "incomplete", current_period_end: 1_793_000_000, latest_invoice: { payment_intent: { client_secret: "pi_1_secret" } } },
    ]);

    const created = await createRecurringSubscription({
      churchId: "church-1",
      stripeAccount: "acct_church1",
      customerId: "cus_1",
      recurringGiftId: "rg-1",
      amountCents: 2500,
      currency: "usd",
      frequency: "biweekly",
      startDate: "2026-10-02",
      startsToday: true,
      timeZone: "America/Chicago",
    });

    expect(created).toMatchObject({ subscriptionId: "sub_1", intentType: "payment", clientSecret: "pi_1_secret" });
    const { body, account, url } = calls[0];
    expect(url).toBe("https://api.stripe.com/v1/subscriptions");
    expect(account).toBe("acct_church1");
    expect(Object.fromEntries(body)).toMatchObject({
      customer: "cus_1",
      "items[0][price_data][currency]": "usd",
      "items[0][price_data][product]": "prod_1",
      "items[0][price_data][unit_amount]": "2500",
      "items[0][price_data][recurring][interval]": "week",
      "items[0][price_data][recurring][interval_count]": "2",
      payment_behavior: "default_incomplete",
      "payment_settings[save_default_payment_method]": "on_subscription",
      "payment_settings[payment_method_types][]": "card",
      "metadata[church_id]": "church-1",
      "metadata[recurring_gift_id]": "rg-1",
      "expand[]": "latest_invoice.payment_intent",
    });
    expect(body.has("trial_end")).toBe(false);
  });

  it("a future start: a trial ending at the church's midnight that day, and a SetupIntent to save the card", async () => {
    tenant.client = fakeDb({ church_payment_accounts: [{ ...ACCOUNT_ROW, stripe_recurring_product_id: "prod_1" }] }).client;
    const calls = stubStripe([{ id: "sub_1", status: "trialing", trial_end: 1_793_000_000, pending_setup_intent: { client_secret: "seti_1_secret" } }]);

    const created = await createRecurringSubscription({
      churchId: "church-1",
      stripeAccount: "acct_church1",
      customerId: "cus_1",
      recurringGiftId: "rg-1",
      amountCents: 2500,
      currency: "usd",
      frequency: "monthly",
      startDate: "2026-11-01",
      startsToday: false,
      timeZone: "America/Chicago",
    });

    expect(created).toMatchObject({ intentType: "setup", clientSecret: "seti_1_secret", nextPaymentAt: new Date(1_793_000_000 * 1000).toISOString() });
    // Midnight Nov 1 in Chicago (CDT, UTC-5) is 05:00 UTC.
    expect(calls[0].body.get("trial_end")).toBe(String(Date.parse("2026-11-01T05:00:00Z") / 1000));
    expect(calls[0].body.get("expand[]")).toBe("pending_setup_intent");
  });

  it("throws when Stripe returns no payment step", async () => {
    tenant.client = fakeDb({ church_payment_accounts: [{ ...ACCOUNT_ROW, stripe_recurring_product_id: "prod_1" }] }).client;
    stubStripe([{ id: "sub_1", status: "incomplete", latest_invoice: "in_1" }]);
    await expect(
      createRecurringSubscription({
        churchId: "church-1",
        stripeAccount: "acct_church1",
        customerId: "cus_1",
        recurringGiftId: "rg-1",
        amountCents: 2500,
        currency: "usd",
        frequency: "monthly",
        startDate: "2026-10-02",
        startsToday: true,
        timeZone: null,
      }),
    ).rejects.toThrow(/payment step/);
  });

  it("changes the amount and frequency on the subscription's item, from the next installment (no proration)", async () => {
    tenant.client = fakeDb({ church_payment_accounts: [{ ...ACCOUNT_ROW, stripe_recurring_product_id: "prod_1" }] }).client;
    const calls = stubStripe([{ id: "sub_1", status: "active", items: { data: [{ id: "si_1" }] } }, {}]);

    await updateSubscriptionPlan({ subscriptionId: "sub_1", stripeAccount: "acct_church1", churchId: "church-1", amountCents: 5000, currency: "usd", frequency: "weekly" });

    expect(calls.map((c) => [c.method, c.url, c.account])).toEqual([
      ["GET", "https://api.stripe.com/v1/subscriptions/sub_1", "acct_church1"],
      ["POST", "https://api.stripe.com/v1/subscriptions/sub_1", "acct_church1"],
    ]);
    expect(Object.fromEntries(calls[1].body)).toMatchObject({
      "items[0][id]": "si_1",
      "items[0][price_data][unit_amount]": "5000",
      "items[0][price_data][recurring][interval]": "week",
      proration_behavior: "none",
    });
  });

  it("pauses by voiding collection, and resumes by unsetting it", async () => {
    const calls = stubStripe([{}, {}]);
    await setSubscriptionPaused("sub_1", "acct_church1", true);
    await setSubscriptionPaused("sub_1", "acct_church1", false);
    expect(calls[0].body.get("pause_collection[behavior]")).toBe("void");
    expect(calls[1].body.get("pause_collection")).toBe("");
    expect(calls.every((c) => c.account === "acct_church1")).toBe(true);
  });
});
