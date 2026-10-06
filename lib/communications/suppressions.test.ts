import { beforeEach, describe, expect, it, vi } from "vitest";

const { createTenantAdminClientMock, createTenantServerClientMock } = vi.hoisted(() => ({
  createTenantAdminClientMock: vi.fn(),
  createTenantServerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantAdminClient: createTenantAdminClientMock,
  createTenantServerClient: createTenantServerClientMock,
}));

import { listChurchSuppressions, MAX_SUPPRESSION_ROWS } from "@/lib/communications/suppressions";
import type { ChurchAppSession } from "@/lib/auth";

function session(roleId: string) {
  return { appContext: { roleId, church: { id: "church-1" } } } as unknown as ChurchAppSession;
}

/** A thenable query builder: records filters, resolves to `result` when awaited. */
function builder(result: { data: unknown; error: unknown }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const proxy: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "or", "in", "order", "limit"]) {
    proxy[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return proxy;
    };
  }
  proxy.then = (resolve: (value: unknown) => void) => resolve(result);
  return { proxy, calls };
}

const raw = (over: Record<string, unknown>) => ({
  id: "s1",
  channel: "email",
  contact: "a@example.com",
  reason: "bounce",
  notes: null,
  suppressed_by: null,
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

describe("listChurchSuppressions", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["ministry-leader", "member"])("refuses %s", async (role) => {
    await expect(listChurchSuppressions(session(role))).rejects.toThrow("Only church staff");
    expect(createTenantServerClientMock).not.toHaveBeenCalled();
  });

  it.each(["church-admin", "pastor", "secretary"])("allows %s and reads through the user client scoped to the church", async (role) => {
    const suppressions = builder({ data: [], error: null });
    createTenantServerClientMock.mockResolvedValue({ from: () => suppressions.proxy });
    expect(await listChurchSuppressions(session(role))).toEqual({ rows: [], truncated: false });
    expect(suppressions.calls).toContainEqual(["eq", "church_id", "church-1"]);
    expect(suppressions.calls).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(createTenantAdminClientMock).not.toHaveBeenCalled();
  });

  it("matches member names by email (case-insensitive) and phone, and names the adder of manual rows", async () => {
    const suppressions = builder({
      data: [
        raw({ id: "s1", contact: "a@example.com" }),
        raw({ id: "s2", channel: "sms", contact: "+15550100", reason: "unsubscribe" }),
        raw({ id: "s3", contact: "nobody@example.com", reason: "manual", suppressed_by: "admin-profile" }),
      ],
      error: null,
    });
    createTenantServerClientMock.mockResolvedValue({ from: () => suppressions.proxy });

    const emailLookup = builder({ data: [{ id: "p1", full_name: "Ann Member", email: "A@Example.com", phone: null }], error: null });
    const phoneLookup = builder({ data: [{ id: "p2", full_name: "Phil Phone", email: null, phone: "+15550100" }], error: null });
    const adderLookup = builder({ data: [{ id: "admin-profile", full_name: "Nora Admin" }], error: null });
    const lookups = [emailLookup, phoneLookup, adderLookup];
    createTenantAdminClientMock.mockReturnValue({ from: () => lookups.shift()!.proxy });

    const { rows } = await listChurchSuppressions(session("pastor"));

    expect(rows.map((r) => [r.id, r.memberName, r.addedByName])).toEqual([
      ["s1", "Ann Member", null],
      ["s2", "Phil Phone", null],
      ["s3", null, "Nora Admin"],
    ]);
    // every profile lookup is scoped to the session's church
    for (const lookup of [emailLookup, phoneLookup, adderLookup]) {
      expect(lookup.calls).toContainEqual(["eq", "church_id", "church-1"]);
    }
  });

  it("reports truncation when more than the cap exist, returning only the cap", async () => {
    const many = Array.from({ length: MAX_SUPPRESSION_ROWS + 1 }, (_, i) => raw({ id: `s${i}`, contact: `x${i}@example.com` }));
    const suppressions = builder({ data: many, error: null });
    createTenantServerClientMock.mockResolvedValue({ from: () => suppressions.proxy });
    const lookups = () => builder({ data: [], error: null }).proxy;
    createTenantAdminClientMock.mockReturnValue({ from: lookups });
    const result = await listChurchSuppressions(session("church-admin"));
    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(MAX_SUPPRESSION_ROWS);
    expect(suppressions.calls).toContainEqual(["limit", MAX_SUPPRESSION_ROWS + 1]);
  });

  it("propagates a read error", async () => {
    const suppressions = builder({ data: null, error: { message: "rls says no" } });
    createTenantServerClientMock.mockResolvedValue({ from: () => suppressions.proxy });
    await expect(listChurchSuppressions(session("secretary"))).rejects.toThrow("rls says no");
  });

  it("skips name lookup for contacts that cannot be put in a filter safely", async () => {
    const suppressions = builder({ data: [raw({ contact: 'we,ird"@example.com' })], error: null });
    createTenantServerClientMock.mockResolvedValue({ from: () => suppressions.proxy });
    createTenantAdminClientMock.mockReturnValue({ from: () => { throw new Error("should not query"); } });
    const { rows } = await listChurchSuppressions(session("church-admin"));
    expect(rows[0].memberName).toBeNull();
  });
});
