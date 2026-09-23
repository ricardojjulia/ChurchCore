import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/volunteer-data.ts had no pre-existing test coverage before this story
// (a gap called out in Council Review 14's "Next" line) — this file starts
// coverage, scoped to what Story 2 (Role Taxonomy & Team Roster) touches:
// getServicePlanDetail's role-type live join, and the two new loaders
// (getRoleTypes, getChurchSkillOptions). Mock scaffolding mirrors
// lib/member-portal-data.test.ts (this repo's existing loader-test
// convention).

const {
  hasTenantBackendEnvMock,
  createTenantServerClientMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
} = vi.hoisted(() => {
  return {
    hasTenantBackendEnvMock: vi.fn(),
    createTenantServerClientMock: vi.fn(),
    queryTenantLocalDbMock: vi.fn(),
    shouldUseLocalTenantFallbackMock: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: createTenantServerClientMock,
  hasTenantBackendEnv: hasTenantBackendEnvMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

import type { ChurchAppSession } from "@/lib/auth";
import {
  getChurchSkillOptions,
  getRoleTypes,
  getServicePlanDetail,
} from "@/lib/volunteer-data";

// ── Supabase query-builder mock helper (same shape as the server-action
// test files' builder — see app/app/song-library-actions.test.ts) ───────
type QueuedResult = { data: unknown; error: unknown };

function makeTableBuilder(queue: QueuedResult[]) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  const methods = ["select", "eq", "order", "in", "not", "gte", "limit"];
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

function sessionFor(churchId: string): ChurchAppSession {
  return {
    source: "supabase",
    appContext: { church: { id: churchId } },
  } as unknown as ChurchAppSession;
}

describe("volunteer-data loaders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasTenantBackendEnvMock.mockReturnValue(true);
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
  });

  // ── getServicePlanDetail: role-type live join ────────────────

  describe("getServicePlanDetail position role-type resolution", () => {
    const planRow = {
      id: "plan-1",
      church_id: "church-1",
      event_id: null,
      name: "Sunday Morning",
      service_date: "2026-05-03",
      service_time: null,
      service_type: "worship",
      scripture_reference: null,
      sermon_title: null,
      sermon_speaker: null,
      status: "draft",
      notes: null,
      created_by: null,
      created_at: "2026-01-01T00:00:00.000Z",
    };

    it("resolves the live role-type name and required skills via join (local fallback)", async () => {
      queryTenantLocalDbMock
        .mockResolvedValueOnce({ rows: [planRow] }) // plan
        .mockResolvedValueOnce({
          rows: [
            {
              id: "pos-1",
              plan_id: "plan-1",
              church_id: "church-1",
              role_type_id: "rt-1",
              role_name: "Sound Tech",
              required_skills: ["audio"],
              quantity_needed: 2,
              ministry_id: null,
              sort_order: 0,
            },
          ],
        }) // positions
        .mockResolvedValueOnce({ rows: [] }) // shifts
        .mockResolvedValueOnce({ rows: [] }) // reminders
        .mockResolvedValueOnce({ rows: [] }); // run-of-service items

      const result = await getServicePlanDetail(sessionFor("church-1"), "plan-1");

      expect(result?.positions).toHaveLength(1);
      expect(result?.positions[0]).toMatchObject({
        roleTypeId: "rt-1",
        roleName: "Sound Tech",
        requiredSkills: ["audio"],
      });
      // The position query must join service_plan_role_types, not read a
      // stored role_name column directly.
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("join public.service_plan_role_types"),
        ["plan-1"],
      );
    });

    it("resolves the live role-type name and required skills via join (Supabase path)", async () => {
      mockSupabasePath({
        service_plans: [{ data: planRow, error: null }],
        service_plan_positions: [
          {
            data: [
              {
                id: "pos-1",
                plan_id: "plan-1",
                church_id: "church-1",
                role_type_id: "rt-1",
                quantity_needed: 2,
                ministry_id: null,
                sort_order: 0,
                service_plan_role_types: { name: "Sound Tech", required_skills: ["audio"] },
              },
            ],
            error: null,
          },
        ],
        volunteer_shifts: [{ data: [], error: null }],
        service_plan_items: [{ data: [], error: null }],
      });

      const result = await getServicePlanDetail(sessionFor("church-1"), "plan-1");

      expect(result?.positions).toHaveLength(1);
      expect(result?.positions[0]).toMatchObject({
        roleTypeId: "rt-1",
        roleName: "Sound Tech",
        requiredSkills: ["audio"],
      });
    });
  });

  // ── getChurchSkillOptions ─────────────────────────────────────

  describe("getChurchSkillOptions", () => {
    it("de-dupes and sorts skills across volunteer profiles (local fallback)", async () => {
      queryTenantLocalDbMock.mockResolvedValueOnce({
        rows: [
          { skills: ["audio", "guitar"] },
          { skills: ["guitar", "vocals"] },
          { skills: [] },
        ],
      });

      const result = await getChurchSkillOptions(sessionFor("church-1"));

      expect(result).toEqual(["audio", "guitar", "vocals"]);
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("from public.volunteer_profiles where church_id = $1"),
        ["church-1"],
      );
    });

    it("de-dupes and sorts skills across volunteer profiles (Supabase path)", async () => {
      const builders = mockSupabasePath({
        volunteer_profiles: [
          {
            data: [{ skills: ["audio", "guitar"] }, { skills: ["guitar", "vocals"] }],
            error: null,
          },
        ],
      });

      const result = await getChurchSkillOptions(sessionFor("church-1"));

      expect(result).toEqual(["audio", "guitar", "vocals"]);
      expect(builders.volunteer_profiles.eq).toHaveBeenCalledWith("church_id", "church-1");
    });

    it("is tenant-scoped — never returns skills belonging to another church", async () => {
      // Simulate the DB honoring church scoping: a caller from church-2 only
      // sees whatever rows the (church-scoped) query returns for church-2.
      queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [{ skills: ["childcare"] }] });

      const result = await getChurchSkillOptions(sessionFor("church-2"));

      expect(result).toEqual(["childcare"]);
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(expect.any(String), ["church-2"]);
    });
  });

  // ── getRoleTypes ──────────────────────────────────────────────

  describe("getRoleTypes", () => {
    it("activeOnly: true returns the lightweight { id, name } shape, filtered to active rows (local fallback)", async () => {
      queryTenantLocalDbMock.mockResolvedValueOnce({
        rows: [{ id: "rt-1", name: "Greeter" }],
      });

      const result = await getRoleTypes(sessionFor("church-1"), { activeOnly: true });

      expect(result).toEqual([{ id: "rt-1", name: "Greeter" }]);
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("is_active = true"),
        ["church-1"],
      );
    });

    it("activeOnly: false (default) returns the full row shape, including inactive rows (local fallback)", async () => {
      queryTenantLocalDbMock.mockResolvedValueOnce({
        rows: [
          {
            id: "rt-1",
            church_id: "church-1",
            name: "Greeter",
            description: null,
            required_skills: [],
            is_active: false,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      });

      const result = await getRoleTypes(sessionFor("church-1"));

      expect(result).toEqual([
        {
          id: "rt-1",
          churchId: "church-1",
          name: "Greeter",
          description: null,
          requiredSkills: [],
          isActive: false,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ]);
    });

    it("a deactivated role type is excluded from the activeOnly: true result", async () => {
      // Simulates the state after deactivateRoleTypeAction has run: the
      // is_active = true filter means the now-inactive row never appears in
      // the activeOnly: true result set.
      queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

      const result = await getRoleTypes(sessionFor("church-1"), { activeOnly: true });

      expect(result).toEqual([]);
    });

    it("activeOnly: true returns the lightweight shape (Supabase path)", async () => {
      const builders = mockSupabasePath({
        service_plan_role_types: [{ data: [{ id: "rt-1", name: "Greeter" }], error: null }],
      });

      const result = await getRoleTypes(sessionFor("church-1"), { activeOnly: true });

      expect(result).toEqual([{ id: "rt-1", name: "Greeter" }]);
      expect(builders.service_plan_role_types.eq).toHaveBeenCalledWith("is_active", true);
    });

    it("is tenant-scoped (local fallback)", async () => {
      queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

      await getRoleTypes(sessionFor("church-2"), { activeOnly: true });

      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(expect.any(String), ["church-2"]);
    });
  });
});
