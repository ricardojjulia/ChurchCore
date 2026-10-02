import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  hasTenantBackendEnvMock,
  hasTenantDbUrlMock,
  createTenantServerClientMock,
  createTenantAdminClientMock,
  getRequestedPublicChurchMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();
  const hasTenantBackendEnv = vi.fn();
  const hasTenantDbUrl = vi.fn();
  const createTenantServerClient = vi.fn();
  const createTenantAdminClient = vi.fn();
  const getRequestedPublicChurch = vi.fn();

  return {
    revalidatePathMock: revalidatePath,
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
    hasTenantBackendEnvMock: hasTenantBackendEnv,
    hasTenantDbUrlMock: hasTenantDbUrl,
    createTenantServerClientMock: createTenantServerClient,
    createTenantAdminClientMock: createTenantAdminClient,
    getRequestedPublicChurchMock: getRequestedPublicChurch,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

// Each call gets its own address so the per-IP rate limit never trips,
// unless a test pins one.
let ipCounter = 0;
let fixedIp: string | null = null;
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": fixedIp ?? `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` }),
}));

vi.mock("@/lib/public-portal-data", () => ({
  getRequestedPublicChurch: getRequestedPublicChurchMock,
}));

vi.mock("@/lib/supabase/config", () => ({
  hasTenantDbUrl: hasTenantDbUrlMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantAdminClient: createTenantAdminClientMock,
  createTenantServerClient: createTenantServerClientMock,
  hasTenantBackendEnv: hasTenantBackendEnvMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

import { cancelUnpaidPublicRegistrationAction, submitPublicEventRegistrationAction } from "@/app/portal/actions";

describe("submitPublicEventRegistrationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasTenantBackendEnvMock.mockReturnValue(true);
    hasTenantDbUrlMock.mockReturnValue(true);
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    getRequestedPublicChurchMock.mockResolvedValue(null);
  });

  it("sets pending payment status for paid public registrations", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [
          {
            registration_open: true,
            capacity: null,
            waitlist_enabled: false,
            approval_required: false,
            deadline: null,
            price_cents: 5000,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "reg-public-paid-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await submitPublicEventRegistrationAction({
      churchId: "church-1",
      eventId: "event-1",
      registrantName: "Public Guest",
      registrantEmail: "guest@example.com",
    });

    expect(result).toEqual({
      ok: true,
      status: "confirmed",
      paymentIntentId: "pi_event_registration_stub_reg-public-paid-1",
      paymentClientSecret: "pi_event_registration_stub_reg-public-paid-1_secret_test",
    });
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("payment_status"),
      [
        "event-1",
        "church-1",
        "Public Guest",
        "guest@example.com",
        null,
        "confirmed",
        false,
        "pending",
        null,
        null,
      ],
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("payment_intent_id"),
      [
        "reg-public-paid-1",
        "event-1",
        "church-1",
        5000,
        "usd",
        "pi_event_registration_stub_reg-public-paid-1",
      ],
    );
  });

  it("keeps waitlisted paid public registrations as not_required payment status", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [
          {
            registration_open: true,
            capacity: 1,
            waitlist_enabled: true,
            approval_required: false,
            deadline: null,
            price_cents: 5000,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await submitPublicEventRegistrationAction({
      churchId: "church-1",
      eventId: "event-1",
      registrantName: "Public Waitlist Guest",
      registrantEmail: "waitlist@example.com",
    });

    expect(result).toEqual({ ok: true, status: "waitlisted" });
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("payment_status"),
      [
        "event-1",
        "church-1",
        "Public Waitlist Guest",
        "waitlist@example.com",
        null,
        "waitlisted",
        true,
        "not_required",
        null,
        null,
      ],
    );
  });
});

// A Supabase admin client for the public registration action: the event's
// settings, its form fields, no existing registration, and the insert.
function publicRegistrationClient(options: {
  settings?: Record<string, unknown> | null;
  fields?: Array<{ field_key: string; label: string; field_type?: string; is_required: boolean }>;
  count?: number;
  insertError?: { message: string } | null;
  paymentError?: { message: string } | null;
} = {}) {
  const inserts: Array<Record<string, unknown>> = [];
  const upserts: Array<Record<string, unknown>> = [];
  const deletes: string[] = [];
  const settingsFilters: Array<[string, unknown]> = [];
  const settings =
    options.settings === null
      ? null
      : {
          registration_open: true,
          capacity: null,
          waitlist_enabled: false,
          approval_required: false,
          deadline: null,
          price_cents: 0,
          currency: "usd",
          ...options.settings,
        };
  const chain = (result: unknown) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "ilike", "neq", "in", "is"]) builder[method] = () => builder;
    builder.maybeSingle = async () => result;
    builder.single = async () => result;
    builder.then = (resolve: (value: unknown) => void) => resolve(result);
    return builder;
  };
  const client = {
    from: (table: string) => {
      if (table === "event_registration_settings") {
        const builder = chain({ data: settings, error: null }) as Record<string, unknown>;
        builder.eq = (column: string, value: unknown) => (settingsFilters.push([column, value]), builder);
        return builder;
      }
      if (table === "event_registration_form_fields") return chain({ data: options.fields ?? [], error: null });
      if (table === "event_registration_payments") {
        return {
          upsert: async (row: Record<string, unknown>) => (upserts.push(row), { error: options.paymentError ?? null }),
        };
      }
      // event_registrations: the existing-registration and capacity reads,
      // the insert, and the undo.
      return {
        ...chain({ data: null, error: null, count: options.count ?? 0 }),
        insert: (row: Record<string, unknown>) => {
          inserts.push(row);
          return chain(options.insertError ? { data: null, error: options.insertError } : { data: { id: "reg-123" }, error: null });
        },
        delete: () => {
          const builder = { eq: (column: string, value: string) => (deletes.push(`${column}=${value}`), builder) };
          return builder;
        },
      };
    },
  };
  return { client, inserts, upserts, deletes, settingsFilters };
}

describe("demo-mode registration payment id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasTenantBackendEnvMock.mockReturnValue(true);
    hasTenantDbUrlMock.mockReturnValue(true);
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });

  it("records the stub payment id the demo payment route completes (not pi_demo_…)", async () => {
    const fake = publicRegistrationClient({ settings: { price_cents: 2500 } });
    createTenantAdminClientMock.mockReturnValue(fake.client);
    const upserts = fake.upserts;

    const result = await submitPublicEventRegistrationAction({
      churchId: "church-1",
      eventId: "event-1",
      registrantName: "Guest",
      registrantEmail: "guest@example.test",
    });

    expect(result).toMatchObject({ ok: true, registrationId: "reg-123", paymentIntentId: "pi_event_registration_stub_reg-123" });
    expect(upserts[0]).toMatchObject({ payment_intent_id: "pi_event_registration_stub_reg-123" });
    vi.unstubAllEnvs();
  });
});

describe("submitPublicEventRegistrationAction on Supabase (S10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasTenantBackendEnvMock.mockReturnValue(true);
    hasTenantDbUrlMock.mockReturnValue(true);
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
  });

  const register = (customFields?: Record<string, unknown>) =>
    submitPublicEventRegistrationAction({
      churchId: "church-1",
      eventId: "event-1",
      registrantName: "Guest",
      registrantEmail: "Guest@Example.test",
      customFields,
    });

  it("registers for a public, open event through the church-scoped admin client, never the visitor's client", async () => {
    const fake = publicRegistrationClient();
    createTenantAdminClientMock.mockReturnValue(fake.client);

    expect(await register()).toEqual({ ok: true, status: "confirmed", registrationId: "reg-123" });
    expect(fake.inserts[0]).toMatchObject({
      church_id: "church-1",
      event_id: "event-1",
      registrant_email: "guest@example.test",
      status: "confirmed",
      payment_status: "not_required",
    });
    expect(createTenantServerClientMock).not.toHaveBeenCalled();
  });

  it("refuses an event that isn't public and open (no settings match), writing nothing", async () => {
    const fake = publicRegistrationClient({ settings: null });
    createTenantAdminClientMock.mockReturnValue(fake.client);

    expect(await register()).toEqual({ ok: false, error: "Registration is closed for this event." });
    expect(fake.inserts).toEqual([]);
  });

  it("refuses a full event without a waitlist", async () => {
    const fake = publicRegistrationClient({ settings: { capacity: 10 }, count: 10 });
    createTenantAdminClientMock.mockReturnValue(fake.client);

    expect(await register()).toEqual({ ok: false, error: "This event is full and does not have a waitlist." });
    expect(fake.inserts).toEqual([]);
  });

  it("keeps only the event's own custom fields, and requires its required ones", async () => {
    const fields = [
      { field_key: "tshirt", label: "T-shirt size", field_type: "select", is_required: true },
      { field_key: "diet", label: "Dietary needs", field_type: "text", is_required: false },
    ];
    let fake = publicRegistrationClient({ fields });
    createTenantAdminClientMock.mockReturnValue(fake.client);
    expect(await register({ diet: "none" })).toEqual({ ok: false, error: "T-shirt size is required." });
    expect(fake.inserts).toEqual([]);

    fake = publicRegistrationClient({ fields });
    createTenantAdminClientMock.mockReturnValue(fake.client);
    await register({ tshirt: "M", diet: "", payment_status: "paid", status: "confirmed" });
    expect(fake.inserts[0].custom_fields).toEqual({ tshirt: "M" });
  });

  it("requires a literal true for a required checkbox: false, \"false\", 0 or an object don't count (PR #171 review)", async () => {
    const fields = [{ field_key: "waiver", label: "I accept the waiver", field_type: "checkbox", is_required: true }];
    for (const forged of [false, "false", 0, { checked: true }, "true"]) {
      const fake = publicRegistrationClient({ fields });
      createTenantAdminClientMock.mockReturnValue(fake.client);
      expect(await register({ waiver: forged }), JSON.stringify(forged)).toEqual({
        ok: false,
        error: "I accept the waiver is required.",
      });
      expect(fake.inserts).toEqual([]);
    }

    const fake = publicRegistrationClient({ fields });
    createTenantAdminClientMock.mockReturnValue(fake.client);
    expect((await register({ waiver: true })).ok).toBe(true);
    expect(fake.inserts[0].custom_fields).toEqual({ waiver: true });
  });

  it("looks the event up only as this church's own event (PR #171 review)", async () => {
    const fake = publicRegistrationClient();
    createTenantAdminClientMock.mockReturnValue(fake.client);
    await register();
    expect(fake.settingsFilters).toContainEqual(["events.church_id", "church-1"]);
    expect(fake.settingsFilters).toContainEqual(["events.visibility", "public"]);
  });

  it("never shows a visitor raw database text", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    createTenantAdminClientMock.mockReturnValue(
      publicRegistrationClient({ insertError: { message: 'duplicate key value violates unique constraint "event_registrations_pkey"' } }).client,
    );

    expect(await register()).toEqual({ ok: false, error: "Couldn't complete your registration. Please try again." });
    errorSpy.mockRestore();
  });

  it("undoes a paid registration whose payment couldn't be started", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = publicRegistrationClient({ settings: { price_cents: 2500 }, paymentError: { message: "insert failed" } });
    createTenantAdminClientMock.mockReturnValue(fake.client);

    expect(await register()).toEqual({
      ok: false,
      error: "Couldn't start the payment for this registration. Please try again.",
    });
    expect(fake.deletes).toEqual(["id=reg-123", "church_id=church-1"]);
    errorSpy.mockRestore();
  });

  describe("a paid event at a church that can't take payments (G3.0c, Council Review 35)", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("refuses before writing anything when the church hasn't connected Stripe", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_platform");
      vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_platform");
      vi.stubEnv("STRIPE_CONNECT_CLIENT_ID", "ca_platform");
      // The fake has no church_payment_accounts row: not connected.
      const fake = publicRegistrationClient({ settings: { price_cents: 2500 } });
      createTenantAdminClientMock.mockReturnValue(fake.client);

      expect(await register()).toEqual({
        ok: false,
        error: "This event takes payment online, but online payment isn't set up for this church yet. Please contact the church office to register.",
      });
      expect(fake.inserts).toHaveLength(0);
      expect(fake.upserts).toHaveLength(0);
    });

    it("refuses in production without Stripe keys, where payments can't be stubbed", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
      vi.stubEnv("STRIPE_SECRET_KEY", "");
      const fake = publicRegistrationClient({ settings: { price_cents: 2500 } });
      createTenantAdminClientMock.mockReturnValue(fake.client);

      expect(await register()).toMatchObject({ ok: false });
      expect(fake.inserts).toHaveLength(0);
    });

    it("still takes a free registration there", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("STRIPE_SECRET_KEY", "");
      const fake = publicRegistrationClient();
      createTenantAdminClientMock.mockReturnValue(fake.client);

      expect(await register()).toMatchObject({ ok: true, status: "confirmed" });
    });
  });

  it("limits how fast one address can register", async () => {
    fixedIp = "203.0.113.7";
    createTenantAdminClientMock.mockImplementation(() => publicRegistrationClient().client);
    const results = [];
    for (let i = 0; i < 11; i++) results.push(await register());
    fixedIp = null;

    expect(results.slice(0, 10).every((r) => r.ok)).toBe(true);
    expect(results[10]).toEqual({
      ok: false,
      error: "Too many registrations from this connection. Please wait a minute and try again.",
    });
  });
});


describe("cancelUnpaidPublicRegistrationAction (G3.0c)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("acts only on the registration and PaymentIntent pair, through the admin client, while the payment is unpaid", async () => {
    const calls: Array<[string, unknown[]]> = [];
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "in"]) {
      builder[method] = (...args: unknown[]) => (calls.push([method, args]), builder);
    }
    builder.maybeSingle = async () => ({ data: null, error: null });
    createTenantAdminClientMock.mockReturnValue({ from: () => builder });

    expect(await cancelUnpaidPublicRegistrationAction("reg-1", "pi_1")).toEqual({ ok: true, cancelled: false });
    expect(calls).toEqual(
      expect.arrayContaining([
        ["eq", ["registration_id", "reg-1"]],
        ["eq", ["payment_intent_id", "pi_1"]],
        ["in", ["event_registrations.payment_status", ["pending", "failed"]]],
      ]),
    );
  });

  it("does nothing without both ids", async () => {
    expect(await cancelUnpaidPublicRegistrationAction("reg-1", "")).toEqual({ ok: true, cancelled: false });
    expect(createTenantAdminClientMock).not.toHaveBeenCalled();
  });
});
