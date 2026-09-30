import { beforeEach, describe, expect, it, vi } from "vitest";

// S7: `session.profile.id` is the auth (login) user id; anything that means
// "this person's row in public.profiles" must use `session.churchProfileId`.
// These tests pin that for the member's own shift responses and unavailable
// dates, where using the login id made every read empty and every write fail.

const { requireChurchSessionMock, tableResults, calls } = vi.hoisted(() => {
  const tableResults = new Map<string, Array<{ data?: unknown; error?: unknown }>>();
  const calls: Array<{ client: string; table: string; method: string; args: unknown[] }> = [];
  return { requireChurchSessionMock: vi.fn(), tableResults, calls };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireChurchSession: requireChurchSessionMock }));
vi.mock("@/lib/supabase/tenant", () => {
  function next(table: string) {
    const queue = tableResults.get(table) ?? [];
    return Promise.resolve(queue.shift() ?? { data: null, error: null });
  }
  function builder(client: string, table: string) {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "is", "gte", "lt", "lte", "order", "upsert", "update", "delete"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ client, table, method, args });
        return chain;
      };
    }
    chain.maybeSingle = () => next(table);
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => next(table).then(resolve, reject);
    return chain;
  }
  return {
    createTenantServerClient: vi.fn(async () => ({ from: (table: string) => builder("server", table) })),
    createTenantAdminClient: vi.fn(() => ({ from: (table: string) => builder("admin", table) })),
    queryTenantLocalDb: vi.fn(),
    shouldUseLocalTenantFallback: vi.fn(() => false),
    hasTenantBackendEnv: vi.fn(() => true),
  };
});
vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/volunteer-data", () => ({
  getChurchSkillOptions: vi.fn(),
  getServicePlanDetail: vi.fn(),
  getVolunteerPool: vi.fn(),
}));

import { addMyBlockoutDatesAction, listMyBlockoutDatesAction, respondToShiftAction } from "@/app/app/volunteer-actions";

const LOGIN_ID = "auth-user-1";
const CHURCH_PROFILE_ID = "church-profile-1";

function memberSession(churchProfileId: string | null = CHURCH_PROFILE_ID) {
  return {
    userId: LOGIN_ID,
    churchProfileId,
    profile: { id: LOGIN_ID },
    appContext: { roleId: "member", church: { id: "church-1" } },
  };
}

function queue(table: string, ...results: Array<{ data?: unknown; error?: unknown }>) {
  tableResults.set(table, [...(tableResults.get(table) ?? []), ...results]);
}

describe("acting as the signed-in person uses their church profile id (S7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    tableResults.clear();
    calls.length = 0;
    requireChurchSessionMock.mockResolvedValue(memberSession());
  });

  describe("respondToShiftAction", () => {
    it("updates only the member's own shift, matched by church profile id, through the scoped admin client", async () => {
      queue("volunteer_shifts", { data: [{ id: "shift-1" }], error: null });

      expect(await respondToShiftAction("shift-1", "confirmed")).toEqual({ ok: true });

      expect(calls).toEqual(
        expect.arrayContaining([
          { client: "admin", table: "volunteer_shifts", method: "eq", args: ["assigned_user_id", CHURCH_PROFILE_ID] },
          { client: "admin", table: "volunteer_shifts", method: "eq", args: ["church_id", "church-1"] },
          // Only shifts that haven't happened yet.
          { client: "admin", table: "volunteer_shifts", method: "gte", args: ["starts_at", "2026-10-01T00:00:00"] },
        ]),
      );
      expect(calls.some((c) => c.args.includes(LOGIN_ID))).toBe(false);
      const update = calls.find((c) => c.method === "update");
      expect(Object.keys(update?.args[0] as object).sort()).toEqual(
        ["confirmation_status", "decline_reason", "responded_at", "status"].sort(),
      );
    });

    it("still accepts a response on the evening of an evening service at a UTC−4 church (G1.6)", async () => {
      // 8:30 pm on Oct 5 in New York is already Oct 6 in UTC. The 8 pm service
      // is stored as church wall-clock (2026-10-05T20:00), so the "hasn't
      // happened yet" cut-off must be the church's today, Oct 5, not UTC's.
      vi.setSystemTime(new Date("2026-10-06T00:30:00Z"));
      requireChurchSessionMock.mockResolvedValue({
        ...memberSession(),
        appContext: { roleId: "member", church: { id: "church-1", timezone: "America/New_York" } },
      });
      queue("volunteer_shifts", { data: [{ id: "shift-1" }], error: null });

      expect(await respondToShiftAction("shift-1", "confirmed")).toEqual({ ok: true });
      expect(calls).toEqual(
        expect.arrayContaining([
          { client: "admin", table: "volunteer_shifts", method: "gte", args: ["starts_at", "2026-10-05T00:00:00"] },
        ]),
      );
    });

    it("reports a shift that isn't theirs instead of pretending it saved", async () => {
      queue("volunteer_shifts", { data: [], error: null });
      expect(await respondToShiftAction("someone-elses-shift", "declined")).toEqual({
        ok: false,
        code: "not_assigned",
        error: "That shift isn't assigned to you, or it has already happened.",
      });
    });

    it("refuses someone with no profile in this church", async () => {
      requireChurchSessionMock.mockResolvedValue(memberSession(null));
      expect(await respondToShiftAction("shift-1", "confirmed")).toEqual({
        ok: false,
        code: "no_profile",
        error: "Your account has no profile in this church.",
      });
      expect(calls).toHaveLength(0);
    });
  });

  describe("the member's own unavailable dates", () => {
    it("reads and writes with the church profile id", async () => {
      queue("volunteer_blocked_dates", { data: [], error: null });
      await listMyBlockoutDatesAction();
      expect(calls).toEqual(
        expect.arrayContaining([{ client: "server", table: "volunteer_blocked_dates", method: "eq", args: ["profile_id", CHURCH_PROFILE_ID] }]),
      );

      calls.length = 0;
      queue("volunteer_blocked_dates", { error: null }, { data: [], error: null });
      queue("volunteer_shifts", { data: [], error: null });
      await addMyBlockoutDatesAction({ from: "2026-10-11" });
      const upsert = calls.find((c) => c.method === "upsert");
      expect((upsert?.args[0] as Array<{ profile_id: string }>)[0].profile_id).toBe(CHURCH_PROFILE_ID);
    });

    it("lists nothing and refuses to save for someone with no profile in this church", async () => {
      requireChurchSessionMock.mockResolvedValue(memberSession(null));
      expect(await listMyBlockoutDatesAction()).toEqual([]);
      expect(await addMyBlockoutDatesAction({ from: "2026-10-11" })).toMatchObject({ ok: false, code: "no_profile" });
      expect(calls).toHaveLength(0);
    });
  });
});
