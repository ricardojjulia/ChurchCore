import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// G3.0c: paying for an event registration on the church's own account
// (ADR 0025), refusing a paid registration the church can't take, and
// cancelling one the registrant left without paying.

const mocks = vi.hoisted(() => ({
  onlineGivingStatus: vi.fn(),
  cancelPaymentIntent: vi.fn(),
  stripePublishableKey: vi.fn(),
  createEventRegistrationPaymentIntent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/stripe/donations", () => ({
  onlineGivingStatus: mocks.onlineGivingStatus,
  cancelPaymentIntent: mocks.cancelPaymentIntent,
  stripePublishableKey: mocks.stripePublishableKey,
}));
vi.mock("@/lib/stripe/event-registrations", () => ({
  createEventRegistrationPaymentIntent: mocks.createEventRegistrationPaymentIntent,
  stubPaymentIntentId: (id: string) => `pi_event_registration_stub_${id}`,
}));

import {
  EVENT_PAYMENT_UNAVAILABLE,
  cancelUnpaidRegistration,
  eventPaymentReadiness,
  startRegistrationPayment,
} from "@/lib/event-registration-payment";

type Call = { table: string; method: string; args: unknown[] };

/** A fake admin client: each table answers its queued results in order. */
function fakeAdmin(results: Record<string, Array<{ data?: unknown; error?: unknown }>> = {}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const next = () => Promise.resolve(results[table]?.shift() ?? { data: null, error: null });
      for (const method of ["select", "eq", "neq", "in", "update", "upsert", "delete"]) {
        chain[method] = (...args: unknown[]) => (calls.push({ table, method, args }), chain);
      }
      chain.maybeSingle = next;
      chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => next().then(resolve, reject);
      return chain;
    },
  };
  return { client: client as never, calls };
}

const INPUT = {
  churchId: "church-1",
  eventId: "event-1",
  registrationId: "reg-1",
  amountCents: 2500,
  currency: "usd",
  registrantEmail: "a@example.org",
  registrantName: "A",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stripePublishableKey.mockReturnValue("pk_test_1");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("eventPaymentReadiness", () => {
  it.each(["live", "stub"])("takes a paid registration in %s mode", async (mode) => {
    mocks.onlineGivingStatus.mockResolvedValue({ mode, stripeAccount: null });
    expect(await eventPaymentReadiness("church-1")).toEqual({ ok: true });
    expect(mocks.onlineGivingStatus).toHaveBeenCalledWith("church-1");
  });

  it.each(["not_connected", "unconfigured", "unavailable"])("refuses one in %s mode", async (mode) => {
    mocks.onlineGivingStatus.mockResolvedValue({ mode, stripeAccount: null });
    expect(await eventPaymentReadiness("church-1")).toEqual({ ok: false, error: EVENT_PAYMENT_UNAVAILABLE });
  });
});

describe("startRegistrationPayment", () => {
  it("creates the PaymentIntent, records it with the church's account, and returns the card form's details", async () => {
    mocks.createEventRegistrationPaymentIntent.mockResolvedValue({
      clientSecret: "pi_1_secret",
      paymentIntentId: "pi_1",
      isStub: false,
      stripeAccount: "acct_church1",
    });
    const admin = fakeAdmin();

    expect(await startRegistrationPayment(admin.client, INPUT)).toEqual({
      paymentIntentId: "pi_1",
      checkout: { clientSecret: "pi_1_secret", publishableKey: "pk_test_1", stripeAccount: "acct_church1" },
    });
    const upsert = admin.calls.find((c) => c.method === "upsert")!;
    expect(upsert.args[0]).toMatchObject({
      registration_id: "reg-1",
      church_id: "church-1",
      payment_intent_id: "pi_1",
      stripe_account_id: "acct_church1",
      status: "pending",
    });
  });

  it("throws, rather than leave a registration nobody can pay, when Stripe fails", async () => {
    mocks.createEventRegistrationPaymentIntent.mockRejectedValue(new Error("card_error"));
    const admin = fakeAdmin();
    await expect(startRegistrationPayment(admin.client, INPUT)).rejects.toThrow("card_error");
    expect(admin.calls).toHaveLength(0);
  });

  it("throws when the payment row can't be written", async () => {
    mocks.createEventRegistrationPaymentIntent.mockResolvedValue({
      clientSecret: "s",
      paymentIntentId: "pi_1",
      isStub: false,
      stripeAccount: "acct_church1",
    });
    mocks.cancelPaymentIntent.mockResolvedValue("canceled");
    const admin = fakeAdmin({ event_registration_payments: [{ error: { message: "boom" } }] });
    await expect(startRegistrationPayment(admin.client, INPUT)).rejects.toThrow(/boom/);
    // Nobody was given that PaymentIntent: it's cancelled, not left open (Council Review 36).
    expect(mocks.cancelPaymentIntent).toHaveBeenCalledWith("pi_1", "acct_church1");
  });

  it("has no card form for a stubbed payment (no Stripe keys)", async () => {
    mocks.createEventRegistrationPaymentIntent.mockResolvedValue({
      clientSecret: "pi_event_registration_stub_reg-1_secret_test",
      paymentIntentId: "pi_event_registration_stub_reg-1",
      isStub: true,
      stripeAccount: null,
    });
    expect((await startRegistrationPayment(fakeAdmin().client, INPUT)).checkout).toBeNull();
  });

  it("in demo mode, records the stub id the demo payment route completes, without calling Stripe (S4)", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    const admin = fakeAdmin();
    expect(await startRegistrationPayment(admin.client, INPUT)).toEqual({
      paymentIntentId: "pi_event_registration_stub_reg-1",
      checkout: null,
    });
    expect(mocks.createEventRegistrationPaymentIntent).not.toHaveBeenCalled();
  });
});

describe("cancelUnpaidRegistration", () => {
  const UNPAID_ROW = { data: { registration_id: "reg-1", church_id: "church-1", stripe_account_id: "acct_church1" }, error: null };
  const CANCELLED = { data: [{ id: "reg-1" }], error: null };
  const cancel = (admin: ReturnType<typeof fakeAdmin>, paymentIntentId = "pi_1") =>
    cancelUnpaidRegistration(admin.client, { registrationId: "reg-1", paymentIntentId });

  it("cancels the PaymentIntent on the church's account, then the registration, matched by both ids while unpaid", async () => {
    mocks.cancelPaymentIntent.mockResolvedValue("canceled");
    const admin = fakeAdmin({ event_registration_payments: [UNPAID_ROW], event_registrations: [CANCELLED] });

    expect(await cancel(admin)).toEqual({ ok: true, cancelled: true });
    expect(mocks.cancelPaymentIntent).toHaveBeenCalledWith("pi_1", "acct_church1");
    expect(admin.calls).toEqual(
      expect.arrayContaining([
        { table: "event_registration_payments", method: "eq", args: ["registration_id", "reg-1"] },
        { table: "event_registration_payments", method: "eq", args: ["payment_intent_id", "pi_1"] },
        // Unpaid includes "failed": the webhook marks it so after a declined card (PR #175 review).
        { table: "event_registration_payments", method: "in", args: ["event_registrations.payment_status", ["pending", "failed"]] },
        { table: "event_registrations", method: "update", args: [{ status: "cancelled" }] },
        { table: "event_registrations", method: "in", args: ["payment_status", ["pending", "failed"]] },
        { table: "event_registration_payments", method: "in", args: ["status", ["pending", "failed"]] },
      ]),
    );
  });

  it("cancels a stubbed (demo or keyless) payment without calling Stripe (PR #175 review)", async () => {
    const admin = fakeAdmin({ event_registration_payments: [{ ...UNPAID_ROW, data: { ...UNPAID_ROW.data, stripe_account_id: null } }], event_registrations: [CANCELLED] });
    expect(await cancel(admin, "pi_event_registration_stub_reg-1")).toEqual({ ok: true, cancelled: true });
    expect(mocks.cancelPaymentIntent).not.toHaveBeenCalled();
  });

  it("narrows to the member's church when given", async () => {
    const admin = fakeAdmin();
    await cancelUnpaidRegistration(admin.client, { registrationId: "reg-1", paymentIntentId: "pi_1", churchId: "church-1" });
    expect(admin.calls).toContainEqual({ table: "event_registration_payments", method: "eq", args: ["church_id", "church-1"] });
  });

  it("does nothing, and never calls Stripe, when the ids don't match an unpaid registration", async () => {
    const admin = fakeAdmin({ event_registration_payments: [{ data: null, error: null }] });
    expect(await cancel(admin, "pi_other")).toEqual({ ok: true, cancelled: false });
    expect(mocks.cancelPaymentIntent).not.toHaveBeenCalled();
  });

  it.each(["succeeded", "processing"])(
    "keeps the registration when Stripe says the payment is %s, and says which; the webhook records it",
    async (status) => {
      mocks.cancelPaymentIntent.mockResolvedValue(status);
      const admin = fakeAdmin({ event_registration_payments: [UNPAID_ROW] });
      expect(await cancel(admin)).toEqual({ ok: true, cancelled: false, paymentStatus: status });
      expect(admin.calls.some((c) => c.table === "event_registrations" && c.method === "update")).toBe(false);
    },
  );

  it("treats any other status as a failed cancel to retry, not as paid (PR #175 review)", async () => {
    mocks.cancelPaymentIntent.mockResolvedValue("requires_payment_method");
    const admin = fakeAdmin({ event_registration_payments: [UNPAID_ROW] });
    expect(await cancel(admin)).toMatchObject({ ok: false, cancelled: false });
    expect(admin.calls.some((c) => c.table === "event_registrations" && c.method === "update")).toBe(false);
  });

  it("overwrites nothing, and says so, when an admin recorded the payment meanwhile (PR #175 review)", async () => {
    mocks.cancelPaymentIntent.mockResolvedValue("canceled");
    const admin = fakeAdmin({ event_registration_payments: [UNPAID_ROW], event_registrations: [{ data: [], error: null }] });
    expect(await cancel(admin)).toMatchObject({ ok: false, cancelled: false, error: expect.stringMatching(/updated by the church/) });
    expect(admin.calls.some((c) => c.table === "event_registration_payments" && c.method === "update")).toBe(false);
  });

  it("returns an error, not a throw, when Stripe can't be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.cancelPaymentIntent.mockRejectedValue(new Error("network"));
    const admin = fakeAdmin({ event_registration_payments: [UNPAID_ROW] });
    expect(await cancel(admin)).toMatchObject({ ok: false, cancelled: false });
  });
});

describe("eventPaymentReadiness in demo mode", () => {
  it("takes the demo payment even when Stripe keys are set and the church isn't connected (PR #175 review)", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    mocks.onlineGivingStatus.mockResolvedValue({ mode: "not_connected", stripeAccount: null });
    expect(await eventPaymentReadiness("church-1")).toEqual({ ok: true });
    expect(mocks.onlineGivingStatus).not.toHaveBeenCalled();
  });
});
