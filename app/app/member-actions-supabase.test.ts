import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Supabase path of the member check-in and registration actions (S8,
// Council Review 22). member-actions.test.ts covers the local-SQL branch;
// this file covers what runs in production: admin-client reads and writes
// scoped to the church, the visibility rule, household members, capacity, and
// no raw database text reaching the member. The login id is never the church
// profile id here (S7).

const { requireChurchSessionMock, createPaymentIntentMock, tableResults, calls } = vi.hoisted(() => ({
  requireChurchSessionMock: vi.fn(),
  createPaymentIntentMock: vi.fn(),
  tableResults: new Map<string, Array<{ data?: unknown; error?: unknown; count?: number }>>(),
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireChurchSession: requireChurchSessionMock }));
vi.mock("@/lib/stripe/event-registrations", async (importOriginal) => ({
  createEventRegistrationPaymentIntent: createPaymentIntentMock,
  // The real helper: the demo payment route completes only this id.
  stubPaymentIntentId: (await importOriginal<typeof import("@/lib/stripe/event-registrations")>()).stubPaymentIntentId,
}));
vi.mock("@/lib/supabase/tenant", () => {
  function next(table: string) {
    const queue = tableResults.get(table) ?? [];
    return Promise.resolve(queue.shift() ?? { data: null, error: null });
  }
  function builder(table: string) {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "in", "is", "insert", "upsert", "update", "delete"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      };
    }
    chain.single = () => next(table);
    chain.maybeSingle = () => next(table);
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => next(table).then(resolve, reject);
    return chain;
  }
  return {
    createTenantAdminClient: vi.fn(() => ({ from: (table: string) => builder(table) })),
    hasTenantBackendEnv: () => true,
    queryTenantLocalDb: vi.fn(),
    shouldUseLocalTenantFallback: () => false,
  };
});

import {
  cancelUnpaidMemberRegistrationAction,
  memberMobileCheckInAction,
  memberRegisterForEventAction,
} from "@/app/app/member-actions";

const SESSION = {
  userId: "login-1",
  churchProfileId: "profile-1",
  profile: { id: "login-1" },
  source: "supabase",
  appContext: { roleId: "member", church: { id: "church-1" } },
};

function queue(table: string, ...results: Array<{ data?: unknown; error?: unknown; count?: number }>) {
  tableResults.set(table, [...(tableResults.get(table) ?? []), ...results]);
}
const inserts = (table: string) => calls.filter((c) => c.table === table && c.method === "insert");

beforeEach(() => {
  vi.clearAllMocks();
  tableResults.clear();
  calls.length = 0;
  requireChurchSessionMock.mockResolvedValue(SESSION);
});

describe("memberMobileCheckInAction (Supabase)", () => {
  const openGate = {
    mobile_member_check_in_enabled: true,
    mobile_member_check_in_starts_at: new Date(Date.now() - 60_000).toISOString(),
    mobile_member_check_in_ends_at: new Date(Date.now() + 60_000).toISOString(),
    mobile_member_check_in_access_code: null,
    mobile_member_check_in_allow_household: true,
    mobile_member_check_in_location_lat: null,
    mobile_member_check_in_location_lng: null,
    mobile_member_check_in_location_radius_meters: null,
    events: { id: "event-1", title: "Sunday", starts_at: "", ends_at: "", visibility: "members", church_id: "church-1" },
  };

  it("checks in a household member (profiles read through the scoped admin client) and records attendance", async () => {
    queue("event_registration_settings", { data: openGate, error: null });
    queue("profiles", {
      data: [
        { id: "profile-1", family_id: "fam-1" },
        { id: "profile-kid", family_id: "fam-1" },
      ],
      error: null,
    });
    queue("attendance", { data: null, error: null }, { error: null });

    expect(await memberMobileCheckInAction({ eventId: "event-1", targetProfileId: "profile-kid" })).toEqual({
      ok: true,
      alreadyCheckedIn: false,
    });
    expect(calls).toEqual(expect.arrayContaining([{ table: "profiles", method: "eq", args: ["church_id", "church-1"] }]));
    expect(inserts("attendance")[0].args[0]).toMatchObject({
      church_id: "church-1",
      event_id: "event-1",
      profile_id: "profile-kid",
      status: "present",
    });
  });

  it("refuses someone outside the member's household", async () => {
    queue("event_registration_settings", { data: openGate, error: null });
    queue("profiles", {
      data: [
        { id: "profile-1", family_id: "fam-1" },
        { id: "profile-other", family_id: "fam-2" },
      ],
      error: null,
    });

    expect(await memberMobileCheckInAction({ eventId: "event-1", targetProfileId: "profile-other" })).toEqual({
      ok: false,
      error: "You can only check in members from your own household.",
    });
    expect(inserts("attendance")).toHaveLength(0);
  });

  it("never shows the member raw database text", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    queue("event_registration_settings", { data: null, error: { message: 'relation "x" violates row-level security' } });

    const result = await memberMobileCheckInAction({ eventId: "event-1" });

    expect(result).toEqual({ ok: false, error: "Couldn't check you in. Please try again or see a volunteer." });
    errorSpy.mockRestore();
  });
});

describe("memberRegisterForEventAction (Supabase)", () => {
  const settings = (visibility: string, extra: Record<string, unknown> = {}) => ({
    registration_open: true,
    capacity: null,
    waitlist_enabled: false,
    approval_required: false,
    household_registration_enabled: true,
    deadline: null,
    price_cents: 0,
    currency: "usd",
    events: { id: "event-1", visibility },
    ...extra,
  });
  const me = { id: "profile-1", full_name: "David", email: "d@example.org", phone: null, family_id: "fam-1" };

  it("refuses a staff-only event, even though the settings read bypasses RLS (Council Review 22)", async () => {
    queue("event_registration_settings", { data: settings("staff"), error: null });

    expect(await memberRegisterForEventAction({ eventId: "event-1" })).toEqual({
      ok: false,
      error: "Registration is closed for this event.",
    });
    expect(inserts("event_registrations")).toHaveLength(0);
  });

  it("registers a household member through the scoped admin client", async () => {
    queue("event_registration_settings", { data: settings("members"), error: null });
    queue(
      "profiles",
      { data: me, error: null },
      { data: { id: "profile-kid", full_name: "Kid", email: null, phone: null, family_id: "fam-1" }, error: null },
    );
    queue("event_registrations", { data: null, error: null }, { data: { id: "reg-1" }, error: null });

    const result = await memberRegisterForEventAction({ eventId: "event-1", targetProfileId: "profile-kid" });

    expect(result).toMatchObject({ ok: true, registrationId: "reg-1" });
    expect(inserts("event_registrations")[0].args[0]).toMatchObject({
      church_id: "church-1",
      event_id: "event-1",
      profile_id: "profile-kid",
    });
  });

  it("counts everyone's registrations for capacity, and refuses a full event without a waitlist", async () => {
    queue("event_registration_settings", { data: settings("public", { capacity: 1 }), error: null });
    queue("profiles", { data: me, error: null });
    queue("event_registrations", { data: null, error: null }, { data: null, error: null, count: 1 });

    expect(await memberRegisterForEventAction({ eventId: "event-1" })).toEqual({
      ok: false,
      error: "This event is full and does not have a waitlist.",
    });
    expect(inserts("event_registrations")).toHaveLength(0);
  });

  it("in demo mode, records the stub payment id the demo payment route completes (PR #170 review)", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    queue("event_registration_settings", { data: settings("members", { price_cents: 2500 }), error: null });
    queue("profiles", { data: me, error: null });
    queue("event_registrations", { data: null, error: null }, { data: { id: "reg-9" }, error: null });

    const result = await memberRegisterForEventAction({ eventId: "event-1" });

    expect(result).toMatchObject({ ok: true, registrationId: "reg-9", paymentIntentId: "pi_event_registration_stub_reg-9" });
    const paymentUpsert = calls.find((c) => c.table === "event_registration_payments" && c.method === "upsert");
    expect(paymentUpsert?.args[0]).toMatchObject({ payment_intent_id: "pi_event_registration_stub_reg-9" });
    vi.unstubAllEnvs();
  });

  describe("paid events: Stripe's card form on the church's account (G3.0c)", () => {
    function goLive() {
      vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_platform");
      vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_platform");
      vi.stubEnv("STRIPE_CONNECT_CLIENT_ID", "ca_platform");
    }
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("returns the card form's details for a connected church", async () => {
      goLive();
      queue("church_payment_accounts", {
        data: { stripe_account_id: "acct_church1", charges_enabled: true, details_submitted: true },
        error: null,
      });
      queue("event_registration_settings", { data: settings("members", { price_cents: 2500 }), error: null });
      queue("profiles", { data: me, error: null });
      queue("event_registrations", { data: null, error: null }, { data: { id: "reg-9" }, error: null });
      createPaymentIntentMock.mockResolvedValue({
        clientSecret: "pi_9_secret",
        paymentIntentId: "pi_9",
        isStub: false,
        stripeAccount: "acct_church1",
      });

      expect(await memberRegisterForEventAction({ eventId: "event-1" })).toMatchObject({
        ok: true,
        registrationId: "reg-9",
        paymentIntentId: "pi_9",
        checkout: { clientSecret: "pi_9_secret", publishableKey: "pk_test_platform", stripeAccount: "acct_church1" },
      });
      const paymentUpsert = calls.find((c) => c.table === "event_registration_payments" && c.method === "upsert");
      expect(paymentUpsert?.args[0]).toMatchObject({ payment_intent_id: "pi_9", stripe_account_id: "acct_church1" });
    });

    it("refuses a paid registration, writing nothing, when the church hasn't connected Stripe (Council Review 35)", async () => {
      goLive();
      queue("church_payment_accounts", { data: null, error: null });
      queue("event_registration_settings", { data: settings("members", { price_cents: 2500 }), error: null });
      queue("profiles", { data: me, error: null });
      queue("event_registrations", { data: null, error: null });

      expect(await memberRegisterForEventAction({ eventId: "event-1" })).toEqual({
        ok: false,
        error: "This event takes payment online, but online payment isn't set up for this church yet. Please contact the church office to register.",
      });
      expect(inserts("event_registrations")).toHaveLength(0);
      expect(createPaymentIntentMock).not.toHaveBeenCalled();
    });

    it("undoes the registration, instead of leaving one nobody can pay, when Stripe fails", async () => {
      goLive();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      queue("church_payment_accounts", {
        data: { stripe_account_id: "acct_church1", charges_enabled: true, details_submitted: true },
        error: null,
      });
      queue("event_registration_settings", { data: settings("members", { price_cents: 2500 }), error: null });
      queue("profiles", { data: me, error: null });
      queue("event_registrations", { data: null, error: null }, { data: { id: "reg-9" }, error: null });
      createPaymentIntentMock.mockRejectedValue(new Error("stripe down"));

      expect(await memberRegisterForEventAction({ eventId: "event-1" })).toEqual({
        ok: false,
        error: "Couldn't start the payment for this registration. Please try again.",
      });
      expect(calls).toEqual(
        expect.arrayContaining([
          { table: "event_registrations", method: "delete", args: [] },
          { table: "event_registrations", method: "eq", args: ["id", "reg-9"] },
        ]),
      );
      errorSpy.mockRestore();
    });
  });

  it("never shows the member raw database text when the insert fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    queue("event_registration_settings", { data: settings("members"), error: null });
    queue("profiles", { data: me, error: null });
    queue("event_registrations", { data: null, error: null }, { data: null, error: { message: "duplicate key value" } });

    expect(await memberRegisterForEventAction({ eventId: "event-1" })).toEqual({
      ok: false,
      error: "Couldn't complete your registration. Please try again.",
    });
    errorSpy.mockRestore();
  });
});

describe("cancelUnpaidMemberRegistrationAction (G3.0c)", () => {
  it("cancels only within the member's own church", async () => {
    queue("event_registration_payments", { data: null, error: null });
    expect(await cancelUnpaidMemberRegistrationAction("reg-1", "pi_1")).toEqual({ ok: true, cancelled: false });
    expect(calls).toContainEqual({ table: "event_registration_payments", method: "eq", args: ["church_id", "church-1"] });
  });

  it("is for members only", async () => {
    requireChurchSessionMock.mockResolvedValue({ ...SESSION, appContext: { ...SESSION.appContext, roleId: "pastor" } });
    expect(await cancelUnpaidMemberRegistrationAction("reg-1", "pi_1")).toMatchObject({ ok: false, cancelled: false });
    expect(calls).toHaveLength(0);
  });
});
