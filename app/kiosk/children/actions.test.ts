import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase } from "@/tests/fixtures/fake-supabase";

const mocks = vi.hoisted(() => ({
  cookie: { current: undefined as string | undefined },
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  getSession: vi.fn(),
  admin: { current: null as unknown },
  logAuditEvent: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "cc_kiosk" && mocks.cookie.current ? { name, value: mocks.cookie.current } : undefined,
    set: mocks.cookieSet,
    delete: mocks.cookieDelete,
  }),
}));
vi.mock("@/lib/auth", () => ({
  getSession: mocks.getSession,
  isChurchAppContext: (ctx: { kind: string }) => ctx.kind === "church",
}));
vi.mock("@/lib/supabase/tenant", () => ({ createTenantAdminClient: () => mocks.admin.current }));
vi.mock("@/lib/supabase/config", () => ({
  getTenantSupabaseEnv: () => ({ url: "http://localhost:4201", publishableKey: "pk" }),
}));
vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut } }),
}));

import {
  exitKioskAction,
  getKioskOptionsAction,
  kioskCheckinAction,
  lookupByCodeAction,
  lookupByPhoneAction,
} from "@/app/kiosk/children/actions";

const CHURCH = "00000000-0000-4000-8000-0000000000c1";
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const KIOSK = "00000000-0000-4000-8000-0000000000b1";
const DEVICE = "00000000-0000-4000-8000-0000000000d1";
const FAMILY = "00000000-0000-4000-8000-0000000000f1";
const FAMILY_2 = "00000000-0000-4000-8000-0000000000f2";
const ANA = "00000000-0000-4000-8000-000000000011";
const LEO = "00000000-0000-4000-8000-000000000012";
const MATEO = "00000000-0000-4000-8000-000000000014";
const STRANGER = "00000000-0000-4000-8000-000000000099";
const SERVICE = "00000000-0000-4000-8000-000000000051";
const ROOM = "00000000-0000-4000-8000-000000000061";
const ROOM_OTHER_MINISTRY = "00000000-0000-4000-8000-000000000062";

function adminSession(roleId = "church-admin", userId = ADMIN) {
  return {
    userId,
    profile: { email: "admin@example.test" },
    appContext: { kind: "church", roleId, church: { id: CHURCH, timezone: "America/New_York" } },
  };
}

function setup(
  overrides: Record<string, Array<Record<string, unknown>>> = {},
  insertError?: () => { code: string; message: string } | null,
) {
  const fake = createFakeSupabase({
    insertError: insertError ? (table) => (table === "ccm_checkin_sessions" ? insertError() : null) : undefined,
    defaults: { ccm_checkin_sessions: { status: "checked_in" } },
    tables: {
      ccm_kiosk_sessions: [
        { id: KIOSK, church_id: CHURCH, admin_login_id: ADMIN, device_id: DEVICE, started_at: new Date().toISOString(), ended_at: null },
      ],
      families: [
        { id: FAMILY, church_id: CHURCH, checkin_code: "HK7M2QX9" },
        { id: FAMILY_2, church_id: CHURCH, checkin_code: "ZZ7M2QX9" },
      ],
      profiles: [
        { id: "p-parent", church_id: CHURCH, full_name: "Marta Rivera", phone_digits: "5550199", family_id: FAMILY },
        { id: ANA, church_id: CHURCH, full_name: "Ana Rivera", family_id: FAMILY },
        { id: LEO, church_id: CHURCH, full_name: "Leo Rivera", family_id: FAMILY },
        { id: MATEO, church_id: CHURCH, full_name: "Mateo Rivera", family_id: FAMILY },
        { id: STRANGER, church_id: CHURCH, full_name: "Stranger Kid", family_id: FAMILY_2 },
      ],
      profile_sensitive_fields: [
        { church_id: CHURCH, profile_id: LEO, date_of_birth: "2000-01-01" },
        { church_id: CHURCH, profile_id: STRANGER, date_of_birth: "2020-01-01" },
      ],
      children_sensitive_data: [
        { church_id: CHURCH, child_profile_id: ANA, dob: "2018-03-04" },
        { church_id: CHURCH, child_profile_id: MATEO, dob: "2020-03-04" },
      ],
      ccm_custody_restrictions: [{ church_id: CHURCH, child_profile_id: MATEO }],
      ccm_services: [
        { id: SERVICE, church_id: CHURCH, ministry_id: "m1", service_name: "Sunday", service_date: "2026-10-04", started_at: "2026-10-04T10:00:00Z", status: "open", checkin_session_status: "enabled", checkin_session_starts_at: null, checkin_session_ends_at: null },
      ],
      children_rooms: [
        { id: ROOM, church_id: CHURCH, ministry_id: "m1", name: "Nursery", is_active: true },
        { id: ROOM_OTHER_MINISTRY, church_id: CHURCH, ministry_id: "m2", name: "Youth", is_active: true },
        { id: "00000000-0000-4000-8000-000000000063", church_id: CHURCH, ministry_id: "m1", name: "Retired", is_active: false },
      ],
      ccm_checkin_sessions: [],
      ccm_kiosk_lookup_attempts: [],
      ...overrides,
    },
    rpc: { generate_checkin_pin: () => ({ data: "ACEFGH", error: null }) },
  });
  mocks.admin.current = fake.client;
  return fake;
}

async function tokenFor(phone = "5550199") {
  const result = await lookupByPhoneAction({ phone });
  if (result.status !== "found") throw new Error(`expected found, got ${result.status}`);
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookie.current = KIOSK;
  mocks.getSession.mockResolvedValue(adminSession());
  mocks.logAuditEvent.mockResolvedValue(undefined);
  mocks.signOut.mockResolvedValue({ error: null });
});

describe("every kiosk action authenticates its own caller", () => {
  const actions: Array<[string, () => Promise<{ status: string }>]> = [
    ["lookupByPhoneAction", () => lookupByPhoneAction({ phone: "5550199" })],
    ["lookupByCodeAction", () => lookupByCodeAction({ code: "HK7M2QX9" })],
    ["getKioskOptionsAction", () => getKioskOptionsAction()],
    [
      "kioskCheckinAction",
      () => kioskCheckinAction({ householdToken: "x".repeat(32), childIds: [ANA], roomId: ROOM, serviceId: SERVICE }),
    ],
    ["exitKioskAction", () => exitKioskAction({ password: "pw" })],
  ];
  const denials: Array<[string, () => void]> = [
    ["a member", () => mocks.getSession.mockResolvedValue(adminSession("member"))],
    ["a pastor", () => mocks.getSession.mockResolvedValue(adminSession("pastor"))],
    ["a ministry leader", () => mocks.getSession.mockResolvedValue(adminSession("ministry-leader"))],
    ["a secretary", () => mocks.getSession.mockResolvedValue(adminSession("secretary"))],
    ["a signed-out caller", () => mocks.getSession.mockResolvedValue(null)],
    ["no kiosk cookie", () => { mocks.cookie.current = undefined; }],
    ["another admin's kiosk session", () => mocks.getSession.mockResolvedValue(adminSession("church-admin", "00000000-0000-4000-8000-0000000000a2"))],
  ];

  for (const [actionName, run] of actions) {
    for (const [who, arrange] of denials) {
      it(`${actionName} returns locked for ${who}, with no data`, async () => {
        const fake = setup();
        arrange();
        expect(await run()).toEqual({ status: "locked" });
        expect(fake.tables.ccm_checkin_sessions).toHaveLength(0);
        expect(fake.tables.ccm_kiosk_lookup_attempts).toHaveLength(0);
        expect(mocks.logAuditEvent).not.toHaveBeenCalled();
        expect(mocks.signIn).not.toHaveBeenCalled();
      });
    }
  }

  it("is locked once the kiosk session has ended", async () => {
    const fake = setup();
    fake.tables.ccm_kiosk_sessions[0].ended_at = new Date().toISOString();
    expect(await lookupByPhoneAction({ phone: "5550199" })).toEqual({ status: "locked" });
  });
});

describe("lookups", () => {
  it("phone lookup returns the household's children as first name + initial", async () => {
    setup();
    const result = await tokenFor();
    expect(result.children.map((c) => c.displayName)).toEqual(["Ana R.", "Mateo R."]);
  });

  it("code lookup finds the same household", async () => {
    setup();
    const result = await lookupByCodeAction({ code: "hk7m 2qx9" });
    expect(result.status).toBe("found");
  });

  it("reports malformed input as a plain neutral miss", async () => {
    setup();
    expect(await lookupByPhoneAction({ phone: "12" })).toEqual({ status: "none" });
    expect(await lookupByCodeAction({ code: "nope" })).toEqual({ status: "none" });
    expect(await lookupByPhoneAction(undefined as unknown as { phone: string })).toEqual({ status: "none" });
  });

  it("pauses after five misses with a clear status, and successes do not count", async () => {
    setup();
    for (let i = 0; i < 4; i += 1) await lookupByPhoneAction({ phone: "5559999" });
    await tokenFor(); // a success mid-way does not reset or add to the count
    expect((await lookupByPhoneAction({ phone: "5559999" })).status).toBe("none");
    const paused = await lookupByPhoneAction({ phone: "5550199" });
    expect(paused).toMatchObject({ status: "paused" });
    expect((paused as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe("getKioskOptionsAction", () => {
  it("returns the open service and only the active rooms of its ministry", async () => {
    setup();
    expect(await getKioskOptionsAction()).toEqual({
      status: "ok",
      service: { id: SERVICE, name: "Sunday" },
      rooms: [{ id: ROOM, name: "Nursery" }],
    });
  });

  it("returns no service when check-in is not enabled", async () => {
    const fake = setup();
    fake.tables.ccm_services[0].checkin_session_status = "paused";
    expect(await getKioskOptionsAction()).toEqual({ status: "ok", service: null, rooms: [] });
  });
});

describe("kioskCheckinAction", () => {
  const input = (householdToken: string, childIds: string[], extra: Record<string, unknown> = {}) => ({
    householdToken,
    childIds,
    roomId: ROOM,
    serviceId: SERVICE,
    ...extra,
  });

  it("checks a child in, returns the PIN once, and records a kiosk check-in", async () => {
    const fake = setup();
    const { householdToken } = await tokenFor();
    const result = await kioskCheckinAction(input(householdToken, [ANA]));

    expect(result).toEqual({
      status: "done",
      results: [{ childId: ANA, displayName: "Ana R.", status: "checked_in", pin: "ACEFGH", roomName: "Nursery" }],
    });
    expect(fake.tables.ccm_checkin_sessions).toHaveLength(1);
    expect(fake.tables.ccm_checkin_sessions[0]).toMatchObject({
      child_profile_id: ANA,
      child_name: "Ana Rivera",
      checked_in_by: ADMIN,
      checkin_source: "kiosk",
    });
  });

  it("audits the check-in with the admin login id and no phone, code, or PIN", async () => {
    setup();
    const { householdToken } = await tokenFor();
    await kioskCheckinAction(input(householdToken, [ANA]));

    expect(mocks.logAuditEvent).toHaveBeenCalledTimes(1);
    const event = mocks.logAuditEvent.mock.calls[0][0];
    expect(event).toMatchObject({
      tableName: "ccm_checkin_sessions",
      operation: "INSERT",
      actorId: ADMIN,
      churchId: CHURCH,
      actorRole: "church-admin",
      newValues: expect.objectContaining({ event: "kiosk.checkin", source: "kiosk", serviceId: SERVICE, roomId: ROOM }),
    });
    const serialized = JSON.stringify(event);
    for (const secret of ["ACEFGH", "5550199", "HK7M2QX9", householdToken]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("is idempotent: a second call makes no second row and no second PIN", async () => {
    const fake = setup();
    const { householdToken } = await tokenFor();
    await kioskCheckinAction(input(householdToken, [ANA]));
    const again = await kioskCheckinAction(input(householdToken, [ANA]));
    expect(again).toEqual({
      status: "done",
      results: [{ childId: ANA, displayName: "Ana R.", status: "already" }],
    });
    expect(fake.tables.ccm_checkin_sessions).toHaveLength(1);
  });

  it("reports 'already' with no PIN when the unique index fires after the pre-check (concurrent double tap)", async () => {
    const fake = setup({}, () => ({ code: "23505", message: "duplicate key value" }));
    const { householdToken } = await tokenFor();
    const result = await kioskCheckinAction(input(householdToken, [ANA]));
    expect(result).toEqual({
      status: "done",
      results: [{ childId: ANA, displayName: "Ana R.", status: "already" }],
    });
    expect(fake.tables.ccm_checkin_sessions).toHaveLength(0);
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it("sends a custody-restricted child to a greeter, even with a forged id, and records nothing", async () => {
    const fake = setup();
    const { householdToken } = await tokenFor();
    const result = await kioskCheckinAction(input(householdToken, [MATEO]));
    expect(result).toEqual({
      status: "done",
      results: [{ childId: MATEO, displayName: "Mateo R.", status: "greeter" }],
    });
    expect(fake.tables.ccm_checkin_sessions).toHaveLength(0);
    expect(JSON.stringify(result)).not.toMatch(/custody|restrict/i);
  });

  it("refuses forged ids: another household's child, an adult, a made-up id", async () => {
    const fake = setup();
    const { householdToken } = await tokenFor();
    const result = await kioskCheckinAction(input(householdToken, [STRANGER, LEO, "00000000-0000-4000-8000-0000000000ee"]));
    if (result.status !== "done") throw new Error("expected done");
    expect(result.results.map((r) => r.status)).toEqual(["greeter", "greeter", "greeter"]);
    expect(JSON.stringify(result)).not.toContain("Stranger");
    expect(fake.tables.ccm_checkin_sessions).toHaveLength(0);
  });

  it("refuses a missing, wrong, expired, or replaced household token", async () => {
    const fake = setup();
    const first = await tokenFor();
    expect(await kioskCheckinAction(input("", [ANA]))).toEqual({ status: "expired" });
    expect(await kioskCheckinAction(input("y".repeat(32), [ANA]))).toEqual({ status: "expired" });
    await tokenFor(); // replaces the first
    expect(await kioskCheckinAction(input(first.householdToken, [ANA]))).toEqual({ status: "expired" });

    const second = await tokenFor();
    fake.tables.ccm_kiosk_sessions[0].household_token_expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await kioskCheckinAction(input(second.householdToken, [ANA]))).toEqual({ status: "expired" });
    expect(fake.tables.ccm_checkin_sessions).toHaveLength(0);
  });

  it("refuses malformed requests", async () => {
    setup();
    const { householdToken } = await tokenFor();
    expect(await kioskCheckinAction(input(householdToken, []))).toEqual({ status: "invalid" });
    expect(await kioskCheckinAction(input(householdToken, ["not-a-uuid"]))).toEqual({ status: "invalid" });
    expect(await kioskCheckinAction(input(householdToken, [ANA], { roomId: "nope" }))).toEqual({ status: "invalid" });
    expect(await kioskCheckinAction(input(householdToken, Array(11).fill(ANA).map((_, i) => `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`)))).toEqual({ status: "invalid" });
  });

  it("returns 'closed' for a room of another ministry, and when the service is not enabled", async () => {
    const fake = setup();
    const { householdToken } = await tokenFor();
    const wrongRoom = await kioskCheckinAction(input(householdToken, [ANA], { roomId: ROOM_OTHER_MINISTRY }));
    expect(wrongRoom).toMatchObject({ status: "done", results: [{ status: "closed" }] });

    fake.tables.ccm_services[0].checkin_session_status = "paused";
    const closed = await kioskCheckinAction(input(householdToken, [ANA]));
    expect(closed).toMatchObject({ status: "done", results: [{ status: "closed" }] });
    expect(fake.tables.ccm_checkin_sessions).toHaveLength(0);
  });
});

describe("exitKioskAction", () => {
  it("keeps the kiosk running on a wrong password, and records and audits the failure", async () => {
    const fake = setup();
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials" } });
    expect(await exitKioskAction({ password: "wrong" })).toEqual({ status: "wrong_password" });
    expect(fake.tables.ccm_kiosk_sessions[0].ended_at).toBeNull();
    expect(mocks.cookieDelete).not.toHaveBeenCalled();
    expect(fake.tables.ccm_kiosk_lookup_attempts[0]).toMatchObject({ kind: "exit", success: false });
    expect(mocks.logAuditEvent.mock.calls[0][0].newValues).toMatchObject({ event: "kiosk.exit_failed" });
    expect(JSON.stringify(mocks.logAuditEvent.mock.calls)).not.toContain("wrong");
  });

  it("ends the session, clears the kiosk cookie, and audits on the right password", async () => {
    const fake = setup();
    mocks.signIn.mockResolvedValue({ data: { user: { id: ADMIN } }, error: null });
    expect(await exitKioskAction({ password: "right" })).toEqual({
      status: "exited",
      redirectTo: "/app/church-admin/children",
    });
    expect(fake.tables.ccm_kiosk_sessions[0].ended_at).toBeTruthy();
    expect(mocks.cookieDelete).toHaveBeenCalledWith("cc_kiosk");
    // The admin's own session cookie is never replaced.
    expect(mocks.cookieSet).not.toHaveBeenCalled();

    const event = mocks.logAuditEvent.mock.calls.at(-1)![0];
    expect(event).toMatchObject({ tableName: "ccm_kiosk_sessions", recordId: KIOSK, actorId: ADMIN, churchId: CHURCH });
    expect(event.newValues).toMatchObject({ event: "kiosk.exit" });
    expect(JSON.stringify(event)).not.toContain("right");

    // And the kiosk no longer works afterwards.
    expect(await lookupByPhoneAction({ phone: "5550199" })).toEqual({ status: "locked" });
  });

  it("rejects a password that belongs to a different login", async () => {
    const fake = setup();
    mocks.signIn.mockResolvedValue({ data: { user: { id: "someone-else" } }, error: null });
    expect(await exitKioskAction({ password: "theirs" })).toEqual({ status: "wrong_password" });
    expect(fake.tables.ccm_kiosk_sessions[0].ended_at).toBeNull();
  });

  it("pauses exit attempts after five failures, without trying the password", async () => {
    setup();
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: { message: "bad" } });
    for (let i = 0; i < 5; i += 1) await exitKioskAction({ password: "nope" });
    mocks.signIn.mockClear();
    mocks.signIn.mockResolvedValue({ data: { user: { id: ADMIN } }, error: null });
    expect(await exitKioskAction({ password: "right-but-paused" })).toMatchObject({ status: "paused" });
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});
