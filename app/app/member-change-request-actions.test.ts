import { beforeEach, describe, expect, it, vi } from "vitest";

// Council Review 22: members have no UPDATE policy on member_change_requests,
// so re-submitting a change while an earlier one was pending updated 0 rows
// without an error — the member saw "pending review" and the new changes were
// lost. The update now goes through the admin client, scoped to the church,
// the member's own profile and a still-pending request, with a row-count
// check. Supabase path; login id ≠ profile id (S7).

const { requireChurchSessionMock, tableResults, calls } = vi.hoisted(() => ({
  requireChurchSessionMock: vi.fn(),
  tableResults: new Map<string, Array<{ data?: unknown; error?: unknown }>>(),
  calls: [] as Array<{ client: string; table: string; method: string; args: unknown[] }>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireChurchSession: requireChurchSessionMock }));
vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/church-profile", () => ({ resolveActiveChurchProfileId: vi.fn() }));
vi.mock("@/lib/supabase/tenant", () => {
  function next(key: string) {
    const queue = tableResults.get(key) ?? [];
    return Promise.resolve(queue.shift() ?? { data: null, error: null });
  }
  function client(name: string) {
    return {
      from(table: string) {
        const key = `${name}:${table}`;
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "eq", "is", "insert", "update"]) {
          chain[method] = (...args: unknown[]) => {
            calls.push({ client: name, table, method, args });
            return chain;
          };
        }
        chain.single = () => next(key);
        chain.maybeSingle = () => next(key);
        chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => next(key).then(resolve, reject);
        return chain;
      },
    };
  }
  return {
    createTenantAdminClient: vi.fn(() => client("admin")),
    createTenantServerClient: vi.fn(async () => client("member")),
    hasTenantAdminBackendEnv: () => true,
    hasTenantBackendEnv: () => true,
    queryTenantLocalDb: vi.fn(),
    shouldUseLocalTenantFallback: () => false,
  };
});

import { upsertMemberFamilyAction } from "@/app/app/actions";

const SESSION = {
  userId: "login-1",
  churchProfileId: "profile-1",
  profile: { id: "login-1" },
  source: "supabase",
  appContext: { roleId: "member", church: { id: "church-1" } },
};

function queue(key: string, ...results: Array<{ data?: unknown; error?: unknown }>) {
  tableResults.set(key, [...(tableResults.get(key) ?? []), ...results]);
}

describe("re-submitting a member change request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResults.clear();
    calls.length = 0;
    requireChurchSessionMock.mockResolvedValue(SESSION);
    queue("member:profiles", { data: { id: "profile-1" }, error: null });
  });

  it("updates the pending request through the admin client, scoped to the church, the member's profile and pending status", async () => {
    queue("member:member_change_requests", { data: { id: "req-1" }, error: null });
    queue("admin:member_change_requests", { data: [{ id: "req-1" }], error: null });

    const result = await upsertMemberFamilyAction({ familyName: "Rivera", address: "1 Main St", homePhone: null });

    expect(result).toEqual({ status: "pending_review", requestId: "req-1" });
    const adminCalls = calls.filter((c) => c.client === "admin" && c.table === "member_change_requests");
    expect(adminCalls.find((c) => c.method === "update")?.args[0]).toMatchObject({
      proposed_changes: { familyName: "Rivera", address: "1 Main St", homePhone: null },
    });
    expect(adminCalls.filter((c) => c.method === "eq").map((c) => c.args)).toEqual(
      expect.arrayContaining([
        ["id", "req-1"],
        ["church_id", "church-1"],
        ["target_profile_id", "profile-1"],
        ["status", "pending"],
      ]),
    );
    // The member's RLS-bound client never attempts the update it isn't allowed.
    expect(calls.some((c) => c.client === "member" && c.method === "update")).toBe(false);
  });

  it("says so, instead of reporting success, when the request was reviewed in the meantime", async () => {
    queue("member:member_change_requests", { data: { id: "req-1" }, error: null });
    queue("admin:member_change_requests", { data: [], error: null });

    await expect(upsertMemberFamilyAction({ familyName: "Rivera", address: null, homePhone: null })).rejects.toThrow(
      "Your earlier request was just reviewed. Please submit your changes again.",
    );
  });
});
