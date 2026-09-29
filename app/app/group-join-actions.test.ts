import { beforeEach, describe, expect, it, vi } from "vitest";

// S8: members have no INSERT policy on group_members, so joinGroupAction
// validates the group and writes the pending request through an admin client
// scoped to the member and church. Realistic ids (login id ≠ profile id, S7).

const { requireChurchSessionMock, tableResults, calls } = vi.hoisted(() => ({
  requireChurchSessionMock: vi.fn(),
  tableResults: new Map<string, Array<{ data?: unknown; error?: unknown }>>(),
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireChurchSession: requireChurchSessionMock }));
vi.mock("@/lib/supabase/tenant", () => {
  function next(table: string) {
    const queue = tableResults.get(table) ?? [];
    return Promise.resolve(queue.shift() ?? { data: null, error: null });
  }
  function builder(table: string) {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "upsert"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      };
    }
    chain.maybeSingle = () => next(table);
    chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => next(table).then(resolve, reject);
    return chain;
  }
  return {
    createTenantAdminClient: vi.fn(() => ({ from: (table: string) => builder(table) })),
    createTenantServerClient: vi.fn(),
    queryTenantLocalDb: vi.fn(),
    shouldUseLocalTenantFallback: vi.fn(() => false),
  };
});

import { joinGroupAction } from "@/app/app/groups-actions";

const SESSION = {
  userId: "login-1",
  churchProfileId: "profile-1",
  profile: { id: "login-1" },
  appContext: { roleId: "member", church: { id: "church-1" } },
};

function queue(table: string, ...results: Array<{ data?: unknown; error?: unknown }>) {
  tableResults.set(table, [...(tableResults.get(table) ?? []), ...results]);
}

describe("joinGroupAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResults.clear();
    calls.length = 0;
    requireChurchSessionMock.mockResolvedValue(SESSION);
  });

  it("requests membership in an open, active group in the member's church", async () => {
    queue("groups", { data: { id: "group-22", is_open: true, is_active: true }, error: null });
    queue("group_members", { error: null });

    expect(await joinGroupAction("group-22")).toEqual({ ok: true });

    expect(calls).toEqual(expect.arrayContaining([{ table: "groups", method: "eq", args: ["church_id", "church-1"] }]));
    const upsert = calls.find((c) => c.method === "upsert");
    expect(upsert?.args).toEqual([
      { group_id: "group-22", church_id: "church-1", profile_id: "profile-1", role: "member", status: "pending" },
      { onConflict: "group_id,profile_id", ignoreDuplicates: true },
    ]);
  });

  it("refuses a closed or inactive group, and a group in another church, without writing", async () => {
    queue("groups", { data: { id: "g", is_open: false, is_active: true }, error: null });
    expect(await joinGroupAction("g")).toEqual({ ok: false, error: "That group isn't taking new members right now." });

    queue("groups", { data: { id: "g", is_open: true, is_active: false }, error: null });
    expect(await joinGroupAction("g")).toMatchObject({ ok: false });

    queue("groups", { data: null, error: null });
    expect(await joinGroupAction("other-church-group")).toEqual({ ok: false, error: "That group wasn't found." });

    expect(calls.some((c) => c.method === "upsert")).toBe(false);
  });

  it("returns an error (never throws) for someone with no profile in this church", async () => {
    requireChurchSessionMock.mockResolvedValue({ ...SESSION, churchProfileId: null });
    expect(await joinGroupAction("group-22")).toEqual({ ok: false, error: "Your account has no profile in this church." });
    expect(calls).toHaveLength(0);
  });
});
