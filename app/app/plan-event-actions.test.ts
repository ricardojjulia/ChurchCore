import { beforeEach, describe, expect, it, vi } from "vitest";

// G1.11 (owner decision 2026-09-30): volunteer shifts require an event, so a
// service plan saved without one couldn't be staffed — every assignment
// failed on volunteer_shifts.event_id. A new plan now gets its own event, at
// its date and time in the church's zone, and an older plan without one gets
// it on its first assignment. Supabase path; login id ≠ profile id (S7).

const { requireChurchSessionMock, tableResults, calls } = vi.hoisted(() => ({
  requireChurchSessionMock: vi.fn(),
  tableResults: new Map<string, Array<{ data?: unknown; error?: unknown; count?: number }>>(),
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireChurchSession: requireChurchSessionMock }));
vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/burnout-calculator", () => ({ checkVolunteerBurnout: vi.fn(async () => ({ isBurnedOut: false })) }));
vi.mock("@/lib/communications/send-with-suppression", () => ({
  sendWithSuppression: vi.fn(async () => ({ sent: true, skipped: false })),
}));
vi.mock("@/lib/volunteer-data", () => ({
  getChurchSkillOptions: vi.fn(),
  getServicePlanDetail: vi.fn(),
  getVolunteerPool: vi.fn(),
}));
vi.mock("@/lib/supabase/tenant", () => {
  function next(table: string) {
    const queue = tableResults.get(table) ?? [];
    return Promise.resolve(queue.shift() ?? { data: null, error: null });
  }
  function builder(table: string) {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "is", "gte", "lt", "limit", "insert", "update", "order"]) {
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
  const client = { from: (table: string) => builder(table) };
  return {
    createTenantServerClient: vi.fn(async () => client),
    createTenantAdminClient: vi.fn(() => client),
    queryTenantLocalDb: vi.fn(),
    shouldUseLocalTenantFallback: vi.fn(() => false),
  };
});

import { assignVolunteerAction, createServicePlanAction } from "@/app/app/volunteer-actions";

const SESSION = {
  userId: "login-admin",
  churchProfileId: "profile-admin",
  profile: { id: "login-admin" },
  appContext: { roleId: "church-admin", church: { id: "church-1", name: "Grace Harbor", timezone: "America/New_York" } },
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

describe("a service plan always has its event (G1.11)", () => {
  it("creates the plan's own event, at its time in the church's zone, when none is linked", async () => {
    queue("events", { data: { id: "event-new" }, error: null });
    queue("service_plans", { data: { id: "plan-new" }, error: null });

    const result = await createServicePlanAction({ name: "Harvest Sunday", serviceDate: "2026-10-04", serviceTime: "10:00" });

    expect(result).toEqual({ ok: true, id: "plan-new" });
    expect(inserts("events")[0].args[0]).toMatchObject({
      church_id: "church-1",
      title: "Harvest Sunday",
      category: "worship",
      // 10:00 in New York (EDT) is 14:00 UTC; the event is a real instant.
      starts_at: "2026-10-04T14:00:00.000Z",
      ends_at: "2026-10-04T16:00:00.000Z",
      created_by: "profile-admin",
    });
    expect(inserts("service_plans")[0].args[0]).toMatchObject({ event_id: "event-new" });
  });

  it("doesn't create an event when one is linked", async () => {
    queue("events", { data: { id: "event-linked" }, error: null }); // the linked event's church check
    queue("service_plans", { data: { id: "plan-new" }, error: null });

    await createServicePlanAction({ name: "Harvest Sunday", serviceDate: "2026-10-04", eventId: "event-linked" });

    expect(inserts("events")).toHaveLength(0);
    expect(inserts("service_plans")[0].args[0]).toMatchObject({ event_id: "event-linked" });
  });

  it("gives an older plan without an event its own on the first assignment, instead of failing", async () => {
    queue(
      "service_plans",
      { data: { event_id: null }, error: null }, // the assignment's plan read
      { data: { id: "plan-old", name: "Old Plan", service_date: "2026-10-04", service_time: "09:30:00", event_id: null }, error: null },
      { data: [{ id: "plan-old" }], error: null }, // link the new event
    );
    queue("events", { data: { id: "event-new" }, error: null });
    queue("service_plan_positions", { data: { id: "pos-1", quantity_needed: 2 }, error: null });
    queue("profiles", { data: { id: "p-maya" }, error: null });
    queue("volunteer_shifts", { count: 0, error: null }, { data: [], error: null }, { data: { id: "shift-1" }, error: null });

    const result = await assignVolunteerAction({
      planId: "plan-old",
      positionId: "pos-1",
      profileId: "p-maya",
      roleName: "Greeter",
      startsAt: "2026-10-04T09:30:00",
      endsAt: "2026-10-04T11:30:00",
    });

    expect(result.ok).toBe(true);
    expect(inserts("events")[0].args[0]).toMatchObject({ title: "Old Plan", starts_at: "2026-10-04T13:30:00.000Z" });
    expect(calls).toEqual(
      expect.arrayContaining([
        { table: "service_plans", method: "update", args: [{ event_id: "event-new" }] },
        { table: "service_plans", method: "is", args: ["event_id", null] },
      ]),
    );
    expect(inserts("volunteer_shifts")[0].args[0]).toMatchObject({ event_id: "event-new" });
  });
});
