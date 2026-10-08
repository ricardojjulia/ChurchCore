import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase } from "@/tests/fixtures/fake-supabase";

const mocks = vi.hoisted(() => ({
  cookieValue: { current: undefined as string | undefined },
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  getSession: vi.fn(),
  admin: { current: null as unknown },
  logAuditEvent: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "cc_kiosk" && mocks.cookieValue.current
        ? { name, value: mocks.cookieValue.current }
        : undefined,
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
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import {
  displayChildName,
  getPauseSeconds,
  isUnder18,
  loadHousehold,
  lookupHouseholdByCode,
  lookupHouseholdByPhone,
  phoneDigitCandidates,
  recordKioskFailure,
  requireKioskSession,
  setKioskCookie,
  verifyAdminPassword,
  verifyHouseholdToken,
  KioskLockedError,
  type KioskContext,
} from "@/lib/ccm-kiosk-core";

const CHURCH = "00000000-0000-4000-8000-0000000000c1";
const OTHER_CHURCH = "00000000-0000-4000-8000-0000000000c2";
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const KIOSK = "00000000-0000-4000-8000-0000000000b1";
const DEVICE = "00000000-0000-4000-8000-0000000000d1";
const FAMILY = "00000000-0000-4000-8000-0000000000f1";
const FAMILY_2 = "00000000-0000-4000-8000-0000000000f2";
const ANA = "00000000-0000-4000-8000-000000000011";
const LEO = "00000000-0000-4000-8000-000000000012";
const ZOE = "00000000-0000-4000-8000-000000000013";
const MATEO = "00000000-0000-4000-8000-000000000014";
const SERVICE = "00000000-0000-4000-8000-000000000051";

const ctx: KioskContext = {
  churchId: CHURCH,
  churchTimeZone: "America/New_York",
  adminLoginId: ADMIN,
  adminEmail: "admin@example.test",
  kioskSessionId: KIOSK,
  deviceId: DEVICE,
};

function adminSession(overrides: Record<string, unknown> = {}) {
  return {
    userId: ADMIN,
    profile: { email: "admin@example.test" },
    appContext: {
      kind: "church",
      roleId: "church-admin",
      church: { id: CHURCH, timezone: "America/New_York" },
    },
    ...overrides,
  };
}

function seed(extra: Record<string, Array<Record<string, unknown>>> = {}) {
  const fake = createFakeSupabase({
    tables: {
      ccm_kiosk_sessions: [
        {
          id: KIOSK,
          church_id: CHURCH,
          admin_login_id: ADMIN,
          device_id: DEVICE,
          started_at: new Date().toISOString(),
          ended_at: null,
        },
      ],
      families: [
        { id: FAMILY, church_id: CHURCH, checkin_code: "HK7M2QX9" },
        { id: FAMILY_2, church_id: CHURCH, checkin_code: "ZZ7M2QX9" },
      ],
      profiles: [
        { id: "p-parent", church_id: CHURCH, full_name: "Marta Rivera", phone_digits: "5550199", family_id: FAMILY },
        { id: ANA, church_id: CHURCH, full_name: "Ana Rivera", family_id: FAMILY },
        { id: LEO, church_id: CHURCH, full_name: "Leo Rivera", family_id: FAMILY },
        { id: ZOE, church_id: CHURCH, full_name: "Zoe Rivera", family_id: FAMILY },
        { id: MATEO, church_id: CHURCH, full_name: "Mateo Rivera", family_id: FAMILY },
        { id: "p-other", church_id: OTHER_CHURCH, full_name: "Other Person", phone_digits: "5550199", family_id: "fam-other" },
      ],
      profile_sensitive_fields: [{ church_id: CHURCH, profile_id: LEO, date_of_birth: "2006-01-01" }],
      children_sensitive_data: [
        { church_id: CHURCH, child_profile_id: ANA, dob: "2018-03-04" },
        { church_id: CHURCH, child_profile_id: MATEO, dob: "2020-03-04" },
      ],
      ccm_custody_restrictions: [{ church_id: CHURCH, child_profile_id: MATEO }],
      ccm_services: [
        {
          id: SERVICE,
          church_id: CHURCH,
          ministry_id: "m1",
          service_name: "Sunday",
          service_date: "2026-10-04",
          started_at: "2026-10-04T10:00:00Z",
          status: "open",
          checkin_session_status: "enabled",
          checkin_session_starts_at: null,
          checkin_session_ends_at: null,
        },
      ],
      ccm_checkin_sessions: [],
      ccm_kiosk_lookup_attempts: [],
      ...extra,
    },
  });
  mocks.admin.current = fake.client;
  return fake;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T15:00:00Z"));
  mocks.cookieValue.current = KIOSK;
  mocks.getSession.mockResolvedValue(adminSession());
  mocks.logAuditEvent.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("phoneDigitCandidates", () => {
  it("strips format characters", () => {
    expect(phoneDigitCandidates("(555) 019-9")).toEqual(["5550199"]);
    expect(phoneDigitCandidates("555.019.9")).toEqual(["5550199"]);
  });
  it("accepts a US number with or without the country code", () => {
    expect(phoneDigitCandidates("(555) 010-0199")).toEqual(["5550100199", "15550100199"]);
    expect(phoneDigitCandidates("+1 555 010 0199")).toEqual(["15550100199", "5550100199"]);
  });
  it("rejects partial numbers and non-strings", () => {
    expect(phoneDigitCandidates("555")).toBeNull();
    expect(phoneDigitCandidates("")).toBeNull();
    expect(phoneDigitCandidates(5550199)).toBeNull();
    expect(phoneDigitCandidates("1".repeat(16))).toBeNull();
  });
});

describe("displayChildName", () => {
  it("gives first name and last initial only", () => {
    expect(displayChildName("Ana Rivera")).toBe("Ana R.");
    expect(displayChildName("Ana de la Cruz")).toBe("Ana C.");
    expect(displayChildName("  ana   rivera ")).toBe("ana R.");
    expect(displayChildName("Ana")).toBe("Ana");
    expect(displayChildName(null)).toBe("");
  });
});

describe("isUnder18", () => {
  const today = "2026-10-08";
  it("is under 18 the day before the 18th birthday and adult on it", () => {
    expect(isUnder18(["2008-10-09"], today)).toBe(true);
    expect(isUnder18(["2008-10-08"], today)).toBe(false);
    expect(isUnder18(["2008-10-07"], today)).toBe(false);
  });
  it("shows nobody without a birth date", () => {
    expect(isUnder18([null, undefined], today)).toBe(false);
    expect(isUnder18([], today)).toBe(false);
    expect(isUnder18(["not-a-date"], today)).toBe(false);
  });
  it("uses the later (younger) date when the two fields disagree", () => {
    expect(isUnder18(["2000-01-01", "2020-01-01"], today)).toBe(true);
    expect(isUnder18(["2020-01-01", "2000-01-01"], today)).toBe(true);
  });
  it("treats a future birth date as bad data and hides the child", () => {
    expect(isUnder18(["2027-01-01"], today)).toBe(false);
  });
  it("handles a leap-day birthday without timezone arithmetic", () => {
    expect(isUnder18(["2008-02-29"], "2026-02-28")).toBe(true);
    expect(isUnder18(["2008-02-29"], "2026-03-01")).toBe(false);
  });
});

describe("church-local today decides the 18th birthday", () => {
  it("is still 17 in New York late on the evening UTC has already rolled over", async () => {
    // 2026-10-09T01:00Z is 21:00 on Oct 8 in New York.
    vi.setSystemTime(new Date("2026-10-09T01:00:00Z"));
    seed({
      profiles: [{ id: "kid", church_id: CHURCH, full_name: "Kid Rivera", family_id: FAMILY }],
      profile_sensitive_fields: [{ church_id: CHURCH, profile_id: "kid", date_of_birth: "2008-10-09" }],
    });
    const household = await loadHousehold(ctx, FAMILY);
    expect(household.map((c) => c.id)).toEqual(["kid"]);

    vi.setSystemTime(new Date("2026-10-09T05:00:00Z")); // midnight Oct 9 in New York
    expect(await loadHousehold(ctx, FAMILY)).toEqual([]);
  });
});

describe("two birth-date fields", () => {
  it("uses profile_sensitive_fields when children_sensitive_data has none, and the younger date when they disagree", async () => {
    seed({
      profiles: [
        { id: "a", church_id: CHURCH, full_name: "Only Profile", family_id: FAMILY },
        { id: "b", church_id: CHURCH, full_name: "Disagree Kid", family_id: FAMILY },
        { id: "c", church_id: CHURCH, full_name: "Nobody Known", family_id: FAMILY },
      ],
      profile_sensitive_fields: [
        { church_id: CHURCH, profile_id: "a", date_of_birth: "2019-05-05" },
        { church_id: CHURCH, profile_id: "b", date_of_birth: "1990-01-01" },
      ],
      children_sensitive_data: [{ church_id: CHURCH, child_profile_id: "b", dob: "2019-01-01" }],
    });
    const household = await loadHousehold(ctx, FAMILY);
    expect(household.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });
});

describe("requireKioskSession", () => {
  it("accepts the church admin who started the active kiosk", async () => {
    seed();
    await expect(requireKioskSession()).resolves.toMatchObject({
      churchId: CHURCH,
      adminLoginId: ADMIN,
      kioskSessionId: KIOSK,
      deviceId: DEVICE,
    });
  });

  it.each([
    ["no cookie", () => { mocks.cookieValue.current = undefined; }],
    ["a malformed cookie", () => { mocks.cookieValue.current = "not-a-uuid"; }],
    ["no sign-in", () => mocks.getSession.mockResolvedValue(null)],
    ["a member", () => mocks.getSession.mockResolvedValue(adminSession({ appContext: { kind: "church", roleId: "member", church: { id: CHURCH, timezone: "UTC" } } }))],
    ["a pastor", () => mocks.getSession.mockResolvedValue(adminSession({ appContext: { kind: "church", roleId: "pastor", church: { id: CHURCH, timezone: "UTC" } } }))],
    ["a volunteer-level role", () => mocks.getSession.mockResolvedValue(adminSession({ appContext: { kind: "church", roleId: "ministry-leader", church: { id: CHURCH, timezone: "UTC" } } }))],
    ["a control-plane context", () => mocks.getSession.mockResolvedValue(adminSession({ appContext: { kind: "control" } }))],
    ["another admin of the same church", () => mocks.getSession.mockResolvedValue(adminSession({ userId: "00000000-0000-4000-8000-0000000000a2" }))],
    ["an admin of another church", () => mocks.getSession.mockResolvedValue(adminSession({ appContext: { kind: "church", roleId: "church-admin", church: { id: OTHER_CHURCH, timezone: "UTC" } } }))],
  ])("refuses %s", async (_label, arrange) => {
    seed();
    arrange();
    await expect(requireKioskSession()).rejects.toBeInstanceOf(KioskLockedError);
  });

  it("refuses an ended kiosk session and an expired one", async () => {
    seed();
    const fake = seed();
    fake.tables.ccm_kiosk_sessions[0].ended_at = new Date().toISOString();
    await expect(requireKioskSession()).rejects.toBeInstanceOf(KioskLockedError);

    const stale = seed();
    stale.tables.ccm_kiosk_sessions[0].started_at = new Date(
      Date.now() - 17 * 60 * 60 * 1000,
    ).toISOString();
    await expect(requireKioskSession()).rejects.toBeInstanceOf(KioskLockedError);
  });

  it("refuses when the database read fails", async () => {
    const fake = createFakeSupabase({ tableError: () => ({ message: "boom" }) });
    mocks.admin.current = fake.client;
    await expect(requireKioskSession()).rejects.toBeInstanceOf(KioskLockedError);
  });
});

describe("kiosk cookie", () => {
  it("is httpOnly, strict, site-wide, and holds only the session id", async () => {
    await setKioskCookie(KIOSK);
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "cc_kiosk",
      KIOSK,
      expect.objectContaining({ httpOnly: true, sameSite: "strict", path: "/" }),
    );
  });
});

describe("phone lookup", () => {
  it("finds the household and shows first name + last initial only", async () => {
    seed();
    const result = await lookupHouseholdByPhone(ctx, "(555) 019-9");
    expect(result).toMatchObject({ status: "found" });
    if (result.status !== "found") throw new Error("unreachable");
    expect(result.children).toEqual([
      { id: ANA, displayName: "Ana R.", alreadyCheckedIn: false, needsGreeter: false },
      { id: MATEO, displayName: "Mateo R.", alreadyCheckedIn: false, needsGreeter: true },
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Rivera");
    expect(serialized).not.toContain("5550199");
    expect(serialized).not.toContain("Marta");
    expect(serialized).not.toContain("2018");
    expect(serialized).not.toContain("HK7M2QX9");
  });

  it("does not list adults or children with no birth date", async () => {
    seed();
    const result = await lookupHouseholdByPhone(ctx, "5550199");
    if (result.status !== "found") throw new Error("expected found");
    expect(result.children.map((c) => c.id)).not.toContain(LEO);
    expect(result.children.map((c) => c.id)).not.toContain(ZOE);
  });

  it("marks a child already checked in for the open service", async () => {
    seed({
      ccm_checkin_sessions: [
        { church_id: CHURCH, service_id: SERVICE, child_profile_id: ANA, status: "checked_in" },
      ],
    });
    const result = await lookupHouseholdByPhone(ctx, "5550199");
    if (result.status !== "found") throw new Error("expected found");
    expect(result.children.find((c) => c.id === ANA)?.alreadyCheckedIn).toBe(true);
  });

  it("does not count a checked-out child as already checked in", async () => {
    seed({
      ccm_checkin_sessions: [
        { church_id: CHURCH, service_id: SERVICE, child_profile_id: ANA, status: "checked_out" },
      ],
    });
    const result = await lookupHouseholdByPhone(ctx, "5550199");
    if (result.status !== "found") throw new Error("expected found");
    expect(result.children.find((c) => c.id === ANA)?.alreadyCheckedIn).toBe(false);
  });

  it("matches the phone number regardless of formatting or country code", async () => {
    const fake = seed();
    fake.tables.profiles[0].phone_digits = "15550100199";
    expect((await lookupHouseholdByPhone(ctx, "555 010 0199")).status).toBe("found");
  });

  it("gives the identical neutral answer for no match, partial, shared phone, and no under-18", async () => {
    const fake = seed();
    // phone shared with a second household
    fake.tables.profiles.push({ id: "p-share", church_id: CHURCH, full_name: "Sam", phone_digits: "5550199", family_id: FAMILY_2 });
    const shared = await lookupHouseholdByPhone(ctx, "5550199");

    const noMatch = await lookupHouseholdByPhone(ctx, "5559999");
    const partial = await lookupHouseholdByPhone(ctx, "555");

    const adultsOnly = seed({
      profiles: [
        { id: "p-parent", church_id: CHURCH, full_name: "Marta Rivera", phone_digits: "5550199", family_id: FAMILY },
        { id: LEO, church_id: CHURCH, full_name: "Leo Rivera", family_id: FAMILY },
      ],
      profile_sensitive_fields: [{ church_id: CHURCH, profile_id: LEO, date_of_birth: "2000-01-01" }],
    });
    expect(adultsOnly).toBeTruthy();
    const noChildren = await lookupHouseholdByPhone(ctx, "5550199");

    for (const result of [shared, noMatch, partial, noChildren]) {
      expect(result).toEqual({ status: "none" });
    }
  });

  it("finds nothing across churches", async () => {
    const otherKiosk = "00000000-0000-4000-8000-0000000000b2";
    seed({
      ccm_kiosk_sessions: [
        { id: otherKiosk, church_id: OTHER_CHURCH, admin_login_id: ADMIN, device_id: DEVICE, started_at: new Date().toISOString(), ended_at: null },
      ],
    });
    // Church C2's own kiosk sees only C2 people: the C1 household is invisible to it.
    const otherChurchCtx = { ...ctx, churchId: OTHER_CHURCH, kioskSessionId: otherKiosk };
    expect(await lookupHouseholdByPhone(otherChurchCtx, "5550199")).toEqual({ status: "none" });
    expect(await lookupHouseholdByCode(otherChurchCtx, "HK7M2QX9")).toEqual({ status: "none" });
  });

  it("records a failed attempt on a miss and a successful one on a hit", async () => {
    const fake = seed();
    await lookupHouseholdByPhone(ctx, "5559999");
    await lookupHouseholdByPhone(ctx, "5550199");
    expect(fake.tables.ccm_kiosk_lookup_attempts.map((a) => [a.kind, a.success])).toEqual([
      ["phone", false],
      ["phone", true],
    ]);
    // The device id is stored hashed, never raw.
    expect(JSON.stringify(fake.tables.ccm_kiosk_lookup_attempts)).not.toContain(DEVICE);
    expect(JSON.stringify(fake.tables.ccm_kiosk_lookup_attempts)).not.toContain("5550199");
  });

  it("reads the same household data for a hit and a miss", async () => {
    const dataTables = (calls: Array<{ table: string; op: string }>) =>
      calls
        .filter((c) => !c.table.startsWith("ccm_kiosk") && c.table !== "families")
        .map((c) => `${c.table}:${c.op}`)
        .sort();

    const hit = seed();
    await lookupHouseholdByPhone(ctx, "5550199");
    const miss = seed();
    await lookupHouseholdByPhone(ctx, "5559999");

    expect(dataTables(miss.calls)).toEqual(dataTables(hit.calls));
  });
});

describe("code lookup", () => {
  it("finds the household for a valid code", async () => {
    seed();
    const result = await lookupHouseholdByCode(ctx, "HK7M2QX9");
    expect(result.status).toBe("found");
  });

  it("normalizes case, spaces, hyphens and look-alike characters", async () => {
    const fake = seed();
    fake.tables.families[0].checkin_code = "1074A0B9";
    for (const typed of ["1074a0b9", "io74-aob9", "  l074 A0B9 "]) {
      expect((await lookupHouseholdByCode(ctx, typed)).status).toBe("found");
    }
  });

  it("gives the neutral answer for a wrong, malformed, or another church's code", async () => {
    const fake = seed();
    fake.tables.families.push({ id: "fam-x", church_id: OTHER_CHURCH, checkin_code: "QQQQQQQQ" });
    for (const typed of ["ABCDEFGH", "short", "", "QQQQQQQQ", 12345 as unknown as string]) {
      expect(await lookupHouseholdByCode(ctx, typed)).toEqual({ status: "none" });
    }
  });

  it("stops matching an old code once the family code has been regenerated", async () => {
    const fake = seed();
    expect((await lookupHouseholdByCode(ctx, "HK7M2QX9")).status).toBe("found");
    fake.tables.families[0].checkin_code = "N3WC0DE2";
    expect(await lookupHouseholdByCode(ctx, "HK7M2QX9")).toEqual({ status: "none" });
    expect((await lookupHouseholdByCode(ctx, "N3WC0DE2")).status).toBe("found");
  });
});

describe("rate limit", () => {
  const failures = (n: number, extra: Record<string, unknown> = {}) =>
    Array.from({ length: n }, (_, i) => ({
      church_id: CHURCH,
      device_id_hash: "any",
      kind: "phone",
      success: false,
      created_at: new Date(Date.now() - i * 1000).toISOString(),
      ...extra,
    }));

  it("does not pause on four failures", async () => {
    const fake = seed();
    for (let i = 0; i < 4; i += 1) await recordKioskFailure(ctx, "phone");
    expect(await getPauseSeconds(ctx, ["phone", "code"])).toBeNull();
    expect(fake.tables.ccm_kiosk_lookup_attempts).toHaveLength(4);
  });

  it("pauses the lookup after the fifth failure, and audits that once", async () => {
    seed();
    for (let i = 0; i < 5; i += 1) await recordKioskFailure(ctx, "phone");
    const pause = await getPauseSeconds(ctx, ["phone", "code"]);
    expect(pause).toBeGreaterThan(0);
    expect(pause).toBeLessThanOrEqual(120);
    expect(mocks.logAuditEvent).toHaveBeenCalledTimes(1);
    expect(mocks.logAuditEvent.mock.calls[0][0].newValues).toMatchObject({ event: "kiosk.rate_limited" });

    const result = await lookupHouseholdByPhone(ctx, "5550199");
    expect(result).toMatchObject({ status: "paused" });
    // A paused lookup is not even attempted (no new row, no household read).
  });

  it("lifts the pause two minutes after the last failure", async () => {
    seed();
    for (let i = 0; i < 5; i += 1) await recordKioskFailure(ctx, "phone");
    vi.setSystemTime(new Date(Date.now() + 2 * 60 * 1000 + 1000));
    expect(await getPauseSeconds(ctx, ["phone", "code"])).toBeNull();
  });

  it("does not count successes", async () => {
    seed({
      ccm_kiosk_lookup_attempts: failures(10, { success: true, device_id_hash: undefined }),
    });
    expect(await getPauseSeconds(ctx, ["phone", "code"])).toBeNull();
  });

  it("limits per device: another device in the same church is not paused", async () => {
    seed();
    for (let i = 0; i < 5; i += 1) await recordKioskFailure(ctx, "phone");
    expect(await getPauseSeconds({ ...ctx, deviceId: "00000000-0000-4000-8000-0000000000d2" }, ["phone", "code"])).toBeNull();
  });

  it("applies a church-wide ceiling across devices", async () => {
    seed({
      ccm_kiosk_lookup_attempts: Array.from({ length: 50 }, (_, i) => ({
        church_id: CHURCH,
        device_id_hash: `device-${i}`,
        kind: "code",
        success: false,
        created_at: new Date(Date.now() - i * 1000).toISOString(),
      })),
    });
    expect(await getPauseSeconds(ctx, ["phone", "code"])).toBeGreaterThan(0);
  });

  it("keeps exit failures separate from lookup failures", async () => {
    seed();
    for (let i = 0; i < 5; i += 1) await recordKioskFailure(ctx, "exit");
    expect(await getPauseSeconds(ctx, ["exit"])).toBeGreaterThan(0);
    expect(await getPauseSeconds(ctx, ["phone", "code"])).toBeNull();
  });

  it("fails closed when attempts cannot be read", async () => {
    const fake = createFakeSupabase({ tableError: () => ({ message: "down" }) });
    mocks.admin.current = fake.client;
    expect(await getPauseSeconds(ctx, ["phone"])).toBeGreaterThan(0);
  });

  it("prunes attempts older than a day when it records one", async () => {
    const fake = seed({
      ccm_kiosk_lookup_attempts: [
        { church_id: CHURCH, device_id_hash: "x", kind: "phone", success: false, created_at: "2026-10-01T00:00:00.000Z" },
      ],
    });
    await recordKioskFailure(ctx, "phone");
    expect(fake.tables.ccm_kiosk_lookup_attempts).toHaveLength(1);
  });
});

describe("household token", () => {
  it("is valid for the issuing kiosk for three minutes, then expires", async () => {
    seed();
    const result = await lookupHouseholdByPhone(ctx, "5550199");
    if (result.status !== "found") throw new Error("expected found");
    expect(await verifyHouseholdToken(ctx, result.householdToken)).toBe(FAMILY);

    vi.setSystemTime(new Date(Date.now() + 3 * 60 * 1000 + 1000));
    expect(await verifyHouseholdToken(ctx, result.householdToken)).toBeNull();
  });

  it("is stored only as a hash", async () => {
    const fake = seed();
    const result = await lookupHouseholdByPhone(ctx, "5550199");
    if (result.status !== "found") throw new Error("expected found");
    expect(JSON.stringify(fake.tables.ccm_kiosk_sessions)).not.toContain(result.householdToken);
  });

  it("is replaced by the next lookup and cleared by a miss", async () => {
    seed();
    const first = await lookupHouseholdByPhone(ctx, "5550199");
    const second = await lookupHouseholdByPhone(ctx, "5550199");
    if (first.status !== "found" || second.status !== "found") throw new Error("expected found");
    expect(await verifyHouseholdToken(ctx, first.householdToken)).toBeNull();
    expect(await verifyHouseholdToken(ctx, second.householdToken)).toBe(FAMILY);

    await lookupHouseholdByPhone(ctx, "5559999");
    expect(await verifyHouseholdToken(ctx, second.householdToken)).toBeNull();
  });

  it("is refused for garbage, other kiosks, and missing values", async () => {
    seed();
    const result = await lookupHouseholdByPhone(ctx, "5550199");
    if (result.status !== "found") throw new Error("expected found");
    expect(await verifyHouseholdToken(ctx, undefined)).toBeNull();
    expect(await verifyHouseholdToken(ctx, "")).toBeNull();
    expect(await verifyHouseholdToken(ctx, "x".repeat(40))).toBeNull();
    expect(
      await verifyHouseholdToken({ ...ctx, kioskSessionId: "00000000-0000-4000-8000-0000000000b9" }, result.householdToken),
    ).toBeNull();
  });
});

describe("verifyAdminPassword", () => {
  beforeEach(() => {
    mocks.createClient.mockReturnValue({
      auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut },
    });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("accepts the right password for the admin who started the kiosk", async () => {
    mocks.signIn.mockResolvedValue({ data: { user: { id: ADMIN } }, error: null });
    expect(await verifyAdminPassword(ctx, "correct horse")).toBe(true);
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "admin@example.test", password: "correct horse" });
    // Throwaway client: nothing persisted, so the real session cookie is untouched.
    expect(mocks.createClient).toHaveBeenCalledWith(
      "http://localhost:4201",
      "pk",
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: false, autoRefreshToken: false }) }),
    );
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("refuses a wrong password, an empty one, and a different user's login", async () => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: { message: "Invalid login" } });
    expect(await verifyAdminPassword(ctx, "wrong")).toBe(false);
    expect(await verifyAdminPassword(ctx, "")).toBe(false);
    expect(await verifyAdminPassword(ctx, undefined)).toBe(false);

    mocks.signIn.mockResolvedValue({ data: { user: { id: "someone-else" } }, error: null });
    expect(await verifyAdminPassword(ctx, "right-for-someone-else")).toBe(false);
  });

  it("refuses when the sign-in throws", async () => {
    mocks.signIn.mockRejectedValue(new Error("network"));
    expect(await verifyAdminPassword(ctx, "pw")).toBe(false);
  });
});
