import { beforeEach, describe, expect, it, vi } from "vitest";

// This is a sibling test file (not appended to volunteer-actions.test.ts) for
// the Role Taxonomy & Team Roster story's new server actions
// (createRoleTypeAction, updateRoleTypeAction, deactivateRoleTypeAction) and
// the roleTypeId-shape change to addPlanPositionAction. Mock scaffolding
// mirrors app/app/song-library-actions.test.ts (Story 1's own sibling test
// file convention).

const {
  revalidatePathMock,
  requireChurchSessionMock,
  createTenantServerClientMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  logAuditEventMock,
  getChurchSkillOptionsMock,
} = vi.hoisted(() => {
  return {
    revalidatePathMock: vi.fn(),
    requireChurchSessionMock: vi.fn(),
    createTenantServerClientMock: vi.fn(),
    queryTenantLocalDbMock: vi.fn(),
    shouldUseLocalTenantFallbackMock: vi.fn(),
    logAuditEventMock: vi.fn(),
    getChurchSkillOptionsMock: vi.fn(),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: createTenantServerClientMock,
  createTenantAdminClient: vi.fn(),
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

vi.mock("@/lib/actions/audit", () => ({
  logAuditEvent: logAuditEventMock,
}));

vi.mock("@/lib/burnout-calculator", () => ({
  checkVolunteerBurnout: vi.fn(async () => ({ isBurnedOut: false })),
}));

vi.mock("@/lib/volunteer-data", () => ({
  getChurchSkillOptions: getChurchSkillOptionsMock,
}));

import {
  addPlanPositionAction,
  createRoleTypeAction,
  deactivateRoleTypeAction,
  updateRoleTypeAction,
} from "@/app/app/volunteer-actions";

// ── Supabase query-builder mock helper ───────────────────────
// Copied verbatim from app/app/song-library-actions.test.ts — see that
// file's comment for why both .single()/.maybeSingle() and a thenable
// .then() are supported.
type QueuedResult = { data: unknown; error: unknown };

function makeTableBuilder(queue: QueuedResult[]) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  const methods = [
    "select",
    "insert",
    "update",
    "upsert",
    "delete",
    "eq",
    "ilike",
    "or",
    "in",
    "not",
    "order",
    "limit",
  ];
  for (const method of methods) {
    builder[method] = vi.fn(chain);
  }
  const resolveNext = (): QueuedResult =>
    queue.length > 0 ? queue.shift()! : { data: null, error: null };
  builder.single = vi.fn(() => Promise.resolve(resolveNext()));
  builder.maybeSingle = vi.fn(() => Promise.resolve(resolveNext()));
  builder.then = (resolve: (v: QueuedResult) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(resolveNext()).then(resolve, reject);
  return builder;
}

function makeSupabaseClient(tableQueues: Record<string, QueuedResult[]>) {
  const builders: Record<string, ReturnType<typeof makeTableBuilder>> = {};
  for (const [table, queue] of Object.entries(tableQueues)) {
    builders[table] = makeTableBuilder(queue);
  }
  const from = vi.fn((table: string) => {
    if (!builders[table]) {
      builders[table] = makeTableBuilder([]);
    }
    return builders[table];
  });
  return { client: { from }, builders };
}

function mockSupabasePath(tableQueues: Record<string, QueuedResult[]>) {
  shouldUseLocalTenantFallbackMock.mockReturnValue(false);
  const { client, builders } = makeSupabaseClient(tableQueues);
  createTenantServerClientMock.mockImplementation(async () => client);
  return builders;
}

function sessionFor(roleId: string) {
  return {
    appContext: { roleId, church: { id: "church-1" } },
    profile: { id: "actor-1" },
  };
}

function pgUniqueViolation() {
  const err = new Error("duplicate key value violates unique constraint") as Error & {
    code?: string;
  };
  err.code = "23505";
  return err;
}

describe("service plan role type actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    requireChurchSessionMock.mockImplementation(async () => sessionFor("church-admin"));
    // Covers every requiredSkills fixture used across this file's tests.
    getChurchSkillOptionsMock.mockResolvedValue(["audio", "mixing", "hospitality"]);
  });

  // ── createRoleTypeAction ─────────────────────────────────────

  describe("createRoleTypeAction", () => {
    it("creates a role type and logs an audit event (local fallback)", async () => {
      queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [{ id: "rt-1" }] });

      const result = await createRoleTypeAction({
        name: "Sound Tech",
        description: "Runs the board",
        requiredSkills: ["audio"],
      });

      expect(result).toEqual({ ok: true, id: "rt-1" });
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("insert into public.service_plan_role_types"),
        ["church-1", "Sound Tech", "Runs the board", ["audio"], "actor-1"],
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "service_plan_role_types",
          recordId: "rt-1",
          operation: "INSERT",
        }),
      );
      expect(revalidatePathMock).toHaveBeenCalled();
    });

    it("creates a role type and logs an audit event (Supabase path)", async () => {
      const builders = mockSupabasePath({
        service_plan_role_types: [{ data: { id: "rt-9" }, error: null }],
      });

      const result = await createRoleTypeAction({ name: "Greeter" });

      expect(result).toEqual({ ok: true, id: "rt-9" });
      expect(builders.service_plan_role_types.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          church_id: "church-1",
          name: "Greeter",
          description: null,
          required_skills: [],
          created_by: "actor-1",
        }),
      );
      expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    });

    it("rejects a blank name before touching the DB", async () => {
      const result = await createRoleTypeAction({ name: "   " });

      expect(result).toEqual({ ok: false, error: "Role name is required." });
      expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
    });

    it("rejects a required skill that isn't one of the church's real skills, before touching the DB (defense in depth against a non-creatable UI being bypassed)", async () => {
      getChurchSkillOptionsMock.mockResolvedValue(["audio", "mixing"]);

      const result = await createRoleTypeAction({
        name: "Sound Tech",
        requiredSkills: ["audio", "made-up-skill"],
      });

      expect(result).toEqual({ ok: false, error: "Unknown skill: made-up-skill." });
      expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
    });

    it("accepts requiredSkills that are all real church skills", async () => {
      getChurchSkillOptionsMock.mockResolvedValue(["audio", "mixing"]);
      queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [{ id: "rt-2" }] });

      const result = await createRoleTypeAction({
        name: "Sound Tech",
        requiredSkills: ["audio", "mixing"],
      });

      expect(result).toEqual({ ok: true, id: "rt-2" });
    });

    it("does not call getChurchSkillOptions when requiredSkills is empty", async () => {
      queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [{ id: "rt-3" }] });

      await createRoleTypeAction({ name: "Greeter" });

      expect(getChurchSkillOptionsMock).not.toHaveBeenCalled();
    });

    it("fails cleanly on a case-insensitive duplicate active name, no duplicate row (local fallback)", async () => {
      queryTenantLocalDbMock.mockRejectedValueOnce(pgUniqueViolation());

      const result = await createRoleTypeAction({ name: "sound tech" });

      expect(result).toEqual({
        ok: false,
        error: "A role type named 'sound tech' already exists.",
      });
      expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(1);
      expect(logAuditEventMock).not.toHaveBeenCalled();
    });

    it("fails cleanly on a case-insensitive duplicate active name, no duplicate row (Supabase path)", async () => {
      const builders = mockSupabasePath({
        service_plan_role_types: [
          { data: null, error: { code: "23505", message: "duplicate key value" } },
        ],
      });

      const result = await createRoleTypeAction({ name: "SOUND TECH" });

      expect(result).toEqual({
        ok: false,
        error: "A role type named 'SOUND TECH' already exists.",
      });
      expect(builders.service_plan_role_types.insert).toHaveBeenCalledTimes(1);
      expect(logAuditEventMock).not.toHaveBeenCalled();
    });

    it("propagates a genuine (non-23505) error instead of masking it", async () => {
      const builders = mockSupabasePath({
        service_plan_role_types: [
          { data: null, error: { code: "42501", message: "permission denied" } },
        ],
      });

      const result = await createRoleTypeAction({ name: "Sound Tech" });

      expect(result).toEqual({ ok: false, error: "permission denied" });
      expect(builders.service_plan_role_types.insert).toHaveBeenCalledTimes(1);
    });

    it("rejects write access for member/volunteer roles", async () => {
      for (const roleId of ["member", "volunteer"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        await expect(createRoleTypeAction({ name: "Sound Tech" })).rejects.toThrow(
          "Unauthorized",
        );
      }
    });

    it("grants write access to church-admin, pastor, and ministry-leader", async () => {
      for (const roleId of ["church-admin", "pastor", "ministry-leader"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [{ id: "rt-1" }] });

        const result = await createRoleTypeAction({ name: "Sound Tech" });
        expect(result.ok).toBe(true);
      }
    });
  });

  // ── updateRoleTypeAction ─────────────────────────────────────

  describe("updateRoleTypeAction", () => {
    it("renames a role type without touching position linkage (local fallback)", async () => {
      queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [{ id: "rt-1" }] });

      const result = await updateRoleTypeAction({
        roleTypeId: "rt-1",
        name: "Sound Technician",
        description: "Updated",
        requiredSkills: ["audio", "mixing"],
      });

      expect(result).toEqual({ ok: true });
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("update public.service_plan_role_types"),
        ["rt-1", "church-1", "Sound Technician", "Updated", ["audio", "mixing"]],
      );
      // Only service_plan_role_types is touched — service_plan_positions
      // (and its role_type_id linkage) is never written by a rename.
      expect(queryTenantLocalDbMock).not.toHaveBeenCalledWith(
        expect.stringContaining("service_plan_positions"),
        expect.anything(),
      );
      // No audit event on a routine rename/edit (create-only audit
      // asymmetry, matching song_library).
      expect(logAuditEventMock).not.toHaveBeenCalled();
    });

    it("renames a role type (Supabase path)", async () => {
      const builders = mockSupabasePath({
        service_plan_role_types: [{ data: { id: "rt-1" }, error: null }],
      });

      const result = await updateRoleTypeAction({ roleTypeId: "rt-1", name: "Sound Technician" });

      expect(result).toEqual({ ok: true });
      expect(builders.service_plan_role_types.update).toHaveBeenCalledWith({
        name: "Sound Technician",
        description: null,
        required_skills: [],
      });
    });

    it("fails cleanly when a rename collides with another active name, no partial mutation (local fallback)", async () => {
      queryTenantLocalDbMock.mockRejectedValueOnce(pgUniqueViolation());

      const result = await updateRoleTypeAction({ roleTypeId: "rt-1", name: "Greeter" });

      expect(result).toEqual({ ok: false, error: "A role type named 'Greeter' already exists." });
    });

    it("rejects a required skill that isn't one of the church's real skills, before touching the DB", async () => {
      getChurchSkillOptionsMock.mockResolvedValue(["audio"]);

      const result = await updateRoleTypeAction({
        roleTypeId: "rt-1",
        name: "Sound Tech",
        requiredSkills: ["made-up-skill"],
      });

      expect(result).toEqual({ ok: false, error: "Unknown skill: made-up-skill." });
      expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
    });

    it("fails cleanly when a rename collides with another active name, no partial mutation (Supabase path)", async () => {
      mockSupabasePath({
        service_plan_role_types: [
          { data: null, error: { code: "23505", message: "duplicate key value" } },
        ],
      });

      const result = await updateRoleTypeAction({ roleTypeId: "rt-1", name: "Greeter" });

      expect(result).toEqual({ ok: false, error: "A role type named 'Greeter' already exists." });
    });

    it("returns an error when the role type does not exist for this church", async () => {
      queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

      const result = await updateRoleTypeAction({ roleTypeId: "missing", name: "Greeter" });

      expect(result).toEqual({ ok: false, error: "Role type not found." });
    });

    it("rejects write access for member/volunteer roles", async () => {
      for (const roleId of ["member", "volunteer"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        await expect(
          updateRoleTypeAction({ roleTypeId: "rt-1", name: "Greeter" }),
        ).rejects.toThrow("Unauthorized");
      }
    });
  });

  // ── deactivateRoleTypeAction ─────────────────────────────────

  describe("deactivateRoleTypeAction", () => {
    it("sets is_active = false and logs an audit event (local fallback)", async () => {
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // current
        .mockResolvedValueOnce({ rows: [] }); // update

      const result = await deactivateRoleTypeAction("rt-1");

      expect(result).toEqual({ ok: true });
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("set is_active = false"),
        ["rt-1", "church-1"],
      );
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "service_plan_role_types",
          recordId: "rt-1",
          operation: "UPDATE",
          oldValues: { isActive: true },
          newValues: { isActive: false },
        }),
      );
    });

    it("is idempotent — two concurrent/duplicate calls both succeed with no error (local fallback)", async () => {
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ is_active: false }] })
        .mockResolvedValueOnce({ rows: [] });

      const first = await deactivateRoleTypeAction("rt-1");
      const second = await deactivateRoleTypeAction("rt-1");

      expect(first).toEqual({ ok: true });
      expect(second).toEqual({ ok: true });
    });

    it("sets is_active = false and logs an audit event (Supabase path)", async () => {
      const builders = mockSupabasePath({
        service_plan_role_types: [
          { data: { is_active: true }, error: null }, // current
          { data: null, error: null }, // update
        ],
      });

      const result = await deactivateRoleTypeAction("rt-1");

      expect(result).toEqual({ ok: true });
      expect(builders.service_plan_role_types.update).toHaveBeenCalledWith({ is_active: false });
      expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    });

    it("returns an error when the role type does not exist for this church", async () => {
      queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

      const result = await deactivateRoleTypeAction("missing");

      expect(result).toEqual({ ok: false, error: "Role type not found." });
    });

    it("rejects write access for member/volunteer roles", async () => {
      for (const roleId of ["member", "volunteer"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        await expect(deactivateRoleTypeAction("rt-1")).rejects.toThrow("Unauthorized");
      }
    });
  });

  // ── addPlanPositionAction: roleTypeId shape ──────────────────

  describe("addPlanPositionAction", () => {
    const PLAN_ROW = { id: "plan-1", status: "draft", service_date: "2026-04-21" };

    it("succeeds with a valid, active roleTypeId (local fallback)", async () => {
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [PLAN_ROW] }) // plan ownership check
        .mockResolvedValueOnce({ rows: [{ id: "rt-1" }] }) // role type check
        .mockResolvedValueOnce({ rows: [{ id: "pos-1" }] }); // insert

      const result = await addPlanPositionAction({
        planId: "plan-1",
        roleTypeId: "rt-1",
        quantityNeeded: 2,
      });

      expect(result).toEqual({ ok: true, id: "pos-1" });
      expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("is_active = true"),
        ["rt-1", "church-1"],
      );
      expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining("insert into public.service_plan_positions"),
        ["plan-1", "church-1", "rt-1", 2, 0],
      );
    });

    it("succeeds with a valid, active roleTypeId (Supabase path)", async () => {
      const builders = mockSupabasePath({
        service_plans: [{ data: PLAN_ROW, error: null }],
        service_plan_role_types: [{ data: { id: "rt-1" }, error: null }],
        service_plan_positions: [{ data: { id: "pos-1" }, error: null }],
      });

      const result = await addPlanPositionAction({
        planId: "plan-1",
        roleTypeId: "rt-1",
        quantityNeeded: 2,
      });

      expect(result).toEqual({ ok: true, id: "pos-1" });
      expect(builders.service_plan_positions.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          plan_id: "plan-1",
          church_id: "church-1",
          role_type_id: "rt-1",
          quantity_needed: 2,
        }),
      );
    });

    it("rejects a planId belonging to a different church, before any role-type lookup (local fallback)", async () => {
      // fetchServicePlanForWrite's own lookup is church-scoped, so a
      // cross-church plan id resolves to no rows.
      queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

      const result = await addPlanPositionAction({
        planId: "other-church-plan",
        roleTypeId: "rt-1",
        quantityNeeded: 1,
      });

      expect(result).toEqual({ ok: false, error: "Service plan not found." });
      expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(1);
    });

    it("rejects a planId belonging to a different church, before any role-type lookup (Supabase path)", async () => {
      const builders = mockSupabasePath({
        service_plans: [{ data: null, error: null }],
      });

      const result = await addPlanPositionAction({
        planId: "other-church-plan",
        roleTypeId: "rt-1",
        quantityNeeded: 1,
      });

      expect(result).toEqual({ ok: false, error: "Service plan not found." });
      expect(builders.service_plan_role_types).toBeUndefined();
      expect(builders.service_plan_positions).toBeUndefined();
    });

    it("rejects a missing/blank roleTypeId with a clear validation error (local fallback)", async () => {
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [PLAN_ROW] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await addPlanPositionAction({
        planId: "plan-1",
        roleTypeId: "",
        quantityNeeded: 1,
      });

      expect(result).toEqual({ ok: false, error: "A valid, active role type is required." });
    });

    it("rejects a roleTypeId belonging to a different church (local fallback)", async () => {
      // The lookup is itself church-scoped, so a cross-church id resolves to
      // no rows — same tenant-isolation shape as Story 1's song lookup.
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [PLAN_ROW] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await addPlanPositionAction({
        planId: "plan-1",
        roleTypeId: "other-church-role-type",
        quantityNeeded: 1,
      });

      expect(result).toEqual({ ok: false, error: "A valid, active role type is required." });
      expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(2);
    });

    it("rejects a roleTypeId belonging to a different church (Supabase path)", async () => {
      const builders = mockSupabasePath({
        service_plans: [{ data: PLAN_ROW, error: null }],
        service_plan_role_types: [{ data: null, error: null }],
      });

      const result = await addPlanPositionAction({
        planId: "plan-1",
        roleTypeId: "other-church-role-type",
        quantityNeeded: 1,
      });

      expect(result).toEqual({ ok: false, error: "A valid, active role type is required." });
      expect(builders.service_plan_positions).toBeUndefined();
    });

    it("rejects an inactive roleTypeId (local fallback)", async () => {
      // The is_active = true predicate in the lookup query means an
      // inactive role type resolves to no rows, same as a not-found id.
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [PLAN_ROW] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await addPlanPositionAction({
        planId: "plan-1",
        roleTypeId: "rt-inactive",
        quantityNeeded: 1,
      });

      expect(result).toEqual({ ok: false, error: "A valid, active role type is required." });
    });

    it("rejects an inactive roleTypeId (Supabase path)", async () => {
      const builders = mockSupabasePath({
        service_plans: [{ data: PLAN_ROW, error: null }],
        service_plan_role_types: [{ data: null, error: null }],
      });

      const result = await addPlanPositionAction({
        planId: "plan-1",
        roleTypeId: "rt-inactive",
        quantityNeeded: 1,
      });

      expect(result).toEqual({ ok: false, error: "A valid, active role type is required." });
      expect(builders.service_plan_positions).toBeUndefined();
    });

    it("rejects write access for member/volunteer roles", async () => {
      for (const roleId of ["member", "volunteer"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        await expect(
          addPlanPositionAction({ planId: "plan-1", roleTypeId: "rt-1", quantityNeeded: 1 }),
        ).rejects.toThrow("Unauthorized");
      }
    });

    it("grants write access to church-admin, pastor, and ministry-leader", async () => {
      for (const roleId of ["church-admin", "pastor", "ministry-leader"]) {
        requireChurchSessionMock.mockResolvedValueOnce(sessionFor(roleId));
        queryTenantLocalDbMock
          .mockResolvedValueOnce({ rows: [PLAN_ROW] })
          .mockResolvedValueOnce({ rows: [{ id: "rt-1" }] })
          .mockResolvedValueOnce({ rows: [{ id: "pos-1" }] });

        const result = await addPlanPositionAction({
          planId: "plan-1",
          roleTypeId: "rt-1",
          quantityNeeded: 1,
        });
        expect(result.ok).toBe(true);
      }
    });
  });
});
