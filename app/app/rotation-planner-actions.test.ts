import { beforeEach, describe, expect, it, vi } from "vitest";

// Sibling test file for Service Planning Story 3 (rotation planner):
// suggestVolunteersForPositionAction, proposePlanAutoFillAction,
// applyPlanAutoFillAction, updateVolunteerFrequencyAction, and the Supabase
// path's same-day conflict check in assignVolunteerAction. Ranking rules
// themselves are covered in lib/rotation-planner.test.ts; these tests cover
// the actions' authorization, plan/position scoping and re-validation.

const {
  revalidatePathMock,
  requireChurchSessionMock,
  createTenantServerClientMock,
  getServicePlanDetailMock,
  getVolunteerPoolMock,
  checkVolunteerBurnoutMock,
  tableResults,
  calls,
} = vi.hoisted(() => {
  // A chainable Supabase stub: every builder method records its call and
  // returns the chain; awaiting the chain (or .single/.maybeSingle) resolves
  // the next queued result for that table.
  const tableResults = new Map<string, Array<{ data?: unknown; error?: unknown }>>();
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  function next(table: string) {
    const queue = tableResults.get(table) ?? [];
    return Promise.resolve(queue.shift() ?? { data: null, error: null });
  }
  function builder(table: string) {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "gte", "lt", "limit", "insert", "upsert", "update"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      };
    }
    chain.single = () => next(table);
    chain.maybeSingle = () => next(table);
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      next(table).then(resolve, reject);
    return chain;
  }
  return {
    revalidatePathMock: vi.fn(),
    requireChurchSessionMock: vi.fn(),
    createTenantServerClientMock: vi.fn(async () => ({ from: (table: string) => builder(table) })),
    getServicePlanDetailMock: vi.fn(),
    getVolunteerPoolMock: vi.fn(),
    checkVolunteerBurnoutMock: vi.fn(async () => ({ isBurnedOut: false })),
    tableResults,
    calls,
  };
});

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/auth", () => ({ requireChurchSession: requireChurchSessionMock }));
vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: createTenantServerClientMock,
  createTenantAdminClient: vi.fn(),
  queryTenantLocalDb: vi.fn(),
  shouldUseLocalTenantFallback: vi.fn(() => false),
}));
vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/burnout-calculator", () => ({ checkVolunteerBurnout: checkVolunteerBurnoutMock }));
vi.mock("@/lib/volunteer-data", () => ({
  getChurchSkillOptions: vi.fn(async () => []),
  getServicePlanDetail: getServicePlanDetailMock,
  getVolunteerPool: getVolunteerPoolMock,
}));

import {
  applyPlanAutoFillAction,
  assignVolunteerAction,
  proposePlanAutoFillAction,
  suggestVolunteersForPositionAction,
  updateVolunteerFrequencyAction,
} from "@/app/app/volunteer-actions";
import type { VolunteerPoolEntry } from "@/lib/volunteer-types";

function sessionFor(roleId: string) {
  return { appContext: { roleId, church: { id: "church-1" } }, profile: { id: "admin-1" } };
}

function volunteer(overrides: Partial<VolunteerPoolEntry> & { profileId: string; fullName: string }): VolunteerPoolEntry {
  return {
    email: null,
    phone: null,
    skills: [],
    maxServicesPerMonth: null,
    isBlocked: false,
    servingOnDate: false,
    recentShiftCount: 0,
    monthShiftCount: 0,
    lastServedAt: null,
    roleServedCount: 0,
    totalHours: 0,
    ...overrides,
  };
}

function planDetail(positions: Array<{ id: string; roleTypeId: string | null; roleName: string; requiredSkills: string[]; quantityNeeded: number; filled: number }>) {
  return {
    plan: { id: "plan-1", serviceDate: "2026-10-06", serviceTime: "10:00:00" },
    positions,
  };
}

function queue(table: string, ...results: Array<{ data?: unknown; error?: unknown }>) {
  tableResults.set(table, [...(tableResults.get(table) ?? []), ...results]);
}

describe("rotation planner actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResults.clear();
    calls.length = 0;
    requireChurchSessionMock.mockResolvedValue(sessionFor("church-admin"));
    checkVolunteerBurnoutMock.mockResolvedValue({ isBurnedOut: false });
  });

  describe("authorization", () => {
    it("rejects members and volunteers on every rotation planner action", async () => {
      for (const roleId of ["member", "volunteer"]) {
        requireChurchSessionMock.mockResolvedValue(sessionFor(roleId));
        await expect(suggestVolunteersForPositionAction({ planId: "plan-1", positionId: "pos-1" })).rejects.toThrow("Unauthorized");
        await expect(proposePlanAutoFillAction({ planId: "plan-1" })).rejects.toThrow("Unauthorized");
        await expect(applyPlanAutoFillAction({ planId: "plan-1", assignments: [] })).rejects.toThrow("Unauthorized");
        await expect(updateVolunteerFrequencyAction({ profileId: "p-1", maxServicesPerMonth: 2 })).rejects.toThrow("Unauthorized");
      }
      expect(getServicePlanDetailMock).not.toHaveBeenCalled();
    });
  });

  describe("suggestVolunteersForPositionAction", () => {
    it("ranks the church's pool for the position's role and skills on the plan's date", async () => {
      getServicePlanDetailMock.mockResolvedValue(
        planDetail([{ id: "pos-1", roleTypeId: "role-wl", roleName: "Worship Leader", requiredSkills: ["vocals"], quantityNeeded: 1, filled: 0 }]),
      );
      getVolunteerPoolMock.mockResolvedValue([
        volunteer({ profileId: "p-blocked", fullName: "Blocked Ben", skills: ["vocals"], isBlocked: true }),
        volunteer({ profileId: "p-aisha", fullName: "Aisha", skills: ["vocals"] }),
      ]);

      const result = await suggestVolunteersForPositionAction({ planId: "plan-1", positionId: "pos-1" });

      expect(getVolunteerPoolMock).toHaveBeenCalledWith(expect.anything(), "2026-10-06", "role-wl");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.volunteers.map((v) => [v.fullName, v.eligible])).toEqual([
        ["Aisha", true],
        ["Blocked Ben", false],
      ]);
    });

    it("returns an error for an unknown plan or a position that isn't on the plan", async () => {
      getServicePlanDetailMock.mockResolvedValueOnce(null);
      expect(await suggestVolunteersForPositionAction({ planId: "nope", positionId: "pos-1" })).toEqual({
        ok: false,
        error: "Service plan not found.",
      });

      getServicePlanDetailMock.mockResolvedValueOnce(planDetail([]));
      expect(await suggestVolunteersForPositionAction({ planId: "plan-1", positionId: "other-plan-pos" })).toEqual({
        ok: false,
        error: "Position not found on this plan.",
      });
      expect(getVolunteerPoolMock).not.toHaveBeenCalled();
    });
  });

  describe("proposePlanAutoFillAction", () => {
    it("proposes one volunteer per open slot and reads each role's pool once", async () => {
      getServicePlanDetailMock.mockResolvedValue(
        planDetail([
          { id: "pos-g", roleTypeId: "role-g", roleName: "Greeter", requiredSkills: ["hospitality"], quantityNeeded: 3, filled: 1 },
          { id: "pos-s", roleTypeId: "role-s", roleName: "Sound", requiredSkills: ["audio"], quantityNeeded: 1, filled: 1 },
        ]),
      );
      getVolunteerPoolMock.mockResolvedValue([
        volunteer({ profileId: "p-maya", fullName: "Maya", skills: ["hospitality"] }),
        volunteer({ profileId: "p-sam", fullName: "Samuel", skills: ["hospitality"], recentShiftCount: 1 }),
      ]);

      const result = await proposePlanAutoFillAction({ planId: "plan-1" });

      expect(result).toMatchObject({
        ok: true,
        proposal: [
          { positionId: "pos-g", profileId: "p-maya" },
          { positionId: "pos-g", profileId: "p-sam" },
        ],
      });
      // Sound is already full, so only the greeter pool is read — once.
      expect(getVolunteerPoolMock).toHaveBeenCalledTimes(1);
      expect(getVolunteerPoolMock).toHaveBeenCalledWith(expect.anything(), "2026-10-06", "role-g");
    });

    it("returns an empty proposal for a fully staffed plan without reading the pool", async () => {
      getServicePlanDetailMock.mockResolvedValue(
        planDetail([{ id: "pos-1", roleTypeId: null, roleName: "Usher", requiredSkills: [], quantityNeeded: 1, filled: 1 }]),
      );
      expect(await proposePlanAutoFillAction({ planId: "plan-1" })).toEqual({ ok: true, proposal: [] });
      expect(getVolunteerPoolMock).not.toHaveBeenCalled();
    });
  });

  describe("applyPlanAutoFillAction", () => {
    const greeterPlan = () =>
      planDetail([{ id: "pos-g", roleTypeId: "role-g", roleName: "Greeter", requiredSkills: [], quantityNeeded: 1, filled: 0 }]);

    it("assigns eligible volunteers with the plan's shift window and reports per-item results", async () => {
      getServicePlanDetailMock.mockResolvedValue(greeterPlan());
      getVolunteerPoolMock.mockResolvedValue([volunteer({ profileId: "p-maya", fullName: "Maya" })]);
      queue("service_plans", { data: { event_id: "event-1" }, error: null });
      queue("volunteer_shifts", { data: [], error: null }, { error: null });

      const result = await applyPlanAutoFillAction({
        planId: "plan-1",
        assignments: [{ positionId: "pos-g", profileId: "p-maya" }],
      });

      expect(result).toEqual({ ok: true, results: [{ positionId: "pos-g", profileId: "p-maya", ok: true }] });
      const insert = calls.find((c) => c.table === "volunteer_shifts" && c.method === "insert");
      expect(insert?.args[0]).toMatchObject({
        church_id: "church-1",
        event_id: "event-1",
        plan_id: "plan-1",
        position_id: "pos-g",
        assigned_user_id: "p-maya",
        starts_at: "2026-10-06T10:00:00",
        ends_at: "2026-10-06T12:00:00",
      });
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/volunteers/schedules/plan-1");
    });

    it("re-validates a stale proposal: ineligible, unknown and over-quota items are refused, not inserted", async () => {
      getServicePlanDetailMock.mockResolvedValue(greeterPlan());
      getVolunteerPoolMock.mockResolvedValue([
        volunteer({ profileId: "p-now-blocked", fullName: "Now Blocked", isBlocked: true }),
        volunteer({ profileId: "p-maya", fullName: "Maya" }),
        volunteer({ profileId: "p-sam", fullName: "Samuel" }),
      ]);
      queue("service_plans", { data: { event_id: "event-1" }, error: null });
      queue("volunteer_shifts", { data: [], error: null }, { error: null });

      const result = await applyPlanAutoFillAction({
        planId: "plan-1",
        assignments: [
          { positionId: "pos-other", profileId: "p-maya" },
          { positionId: "pos-g", profileId: "p-now-blocked" },
          { positionId: "pos-g", profileId: "p-other-church" },
          { positionId: "pos-g", profileId: "p-maya" },
          { positionId: "pos-g", profileId: "p-sam" },
        ],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.results.map((r) => [r.profileId, r.ok, r.error])).toEqual([
        ["p-maya", false, "Position not found on this plan."],
        ["p-now-blocked", false, "Not eligible: blocked"],
        ["p-other-church", false, "Volunteer is not in this church."],
        ["p-maya", true, undefined],
        // The greeter position needed one; Maya filled it.
        ["p-sam", false, "Position is already filled."],
      ]);
      expect(calls.filter((c) => c.method === "insert")).toHaveLength(1);
    });

    it("returns an error for an unknown plan", async () => {
      getServicePlanDetailMock.mockResolvedValue(null);
      expect(await applyPlanAutoFillAction({ planId: "nope", assignments: [] })).toEqual({
        ok: false,
        error: "Service plan not found.",
      });
    });
  });

  describe("assignVolunteerAction (Supabase path)", () => {
    const input = {
      planId: "plan-1",
      positionId: "pos-g",
      profileId: "p-maya",
      roleName: "Greeter",
      startsAt: "2026-10-06T10:00:00",
      endsAt: "2026-10-06T12:00:00",
    };

    it("refuses a same-day double booking, checking non-declined shifts that start that day", async () => {
      queue("service_plans", { data: { event_id: "event-1" }, error: null });
      queue("volunteer_shifts", { data: [{ id: "existing-shift" }], error: null });

      expect(await assignVolunteerAction(input)).toEqual({
        ok: false,
        error: "This volunteer is already assigned on this service date.",
      });
      const conflictQuery = calls.filter((c) => c.table === "volunteer_shifts").map((c) => [c.method, ...c.args]);
      expect(conflictQuery).toEqual(
        expect.arrayContaining([
          ["eq", "church_id", "church-1"],
          ["eq", "assigned_user_id", "p-maya"],
          ["neq", "confirmation_status", "declined"],
          ["gte", "starts_at", "2026-10-06T00:00:00"],
          ["lt", "starts_at", "2026-10-07T00:00:00"],
        ]),
      );
      expect(calls.some((c) => c.method === "insert")).toBe(false);
    });

    it("assigns when the volunteer is free that day", async () => {
      queue("service_plans", { data: { event_id: "event-1" }, error: null });
      queue("volunteer_shifts", { data: [], error: null }, { error: null });

      expect(await assignVolunteerAction(input)).toEqual({ ok: true });
      expect(calls.some((c) => c.table === "volunteer_shifts" && c.method === "insert")).toBe(true);
    });
  });

  describe("updateVolunteerFrequencyAction", () => {
    it("rejects limits outside 1–31 and non-integers without touching the database", async () => {
      for (const bad of [0, 32, 1.5, -1]) {
        expect(await updateVolunteerFrequencyAction({ profileId: "p-1", maxServicesPerMonth: bad })).toMatchObject({ ok: false });
      }
      expect(createTenantServerClientMock).not.toHaveBeenCalled();
    });

    it("refuses a profile outside the admin's church", async () => {
      queue("profiles", { data: null, error: null });
      expect(await updateVolunteerFrequencyAction({ profileId: "p-other", maxServicesPerMonth: 2 })).toEqual({
        ok: false,
        error: "Volunteer not found.",
      });
      expect(calls.some((c) => c.method === "upsert")).toBe(false);
      expect(calls).toEqual(expect.arrayContaining([{ table: "profiles", method: "eq", args: ["church_id", "church-1"] }]));
    });

    it("upserts the church-scoped volunteer profile, and null clears the limit", async () => {
      for (const max of [2, null]) {
        calls.length = 0;
        queue("profiles", { data: { id: "p-1" }, error: null });
        queue("volunteer_profiles", { error: null });

        expect(await updateVolunteerFrequencyAction({ profileId: "p-1", maxServicesPerMonth: max })).toEqual({ ok: true });
        const upsert = calls.find((c) => c.method === "upsert");
        expect(upsert?.args).toEqual([
          { church_id: "church-1", user_id: "p-1", max_services_per_month: max },
          { onConflict: "church_id,user_id" },
        ]);
      }
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/volunteers");
    });
  });
});
