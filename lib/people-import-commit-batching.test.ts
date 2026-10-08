import { beforeEach, describe, expect, it, vi } from "vitest";

// G4.1: the people commit inserts new people in chunks (a 5,000-row commit one
// row at a time took over three minutes locally) while keeping per-row
// outcome accounting and church scoping.

vi.mock("server-only", () => ({}));

const hoisted = vi.hoisted(() => ({
  createTenantServerClient: vi.fn(),
  shouldUseLocalTenantFallback: vi.fn(() => false),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: hoisted.createTenantServerClient,
  queryTenantLocalDb: vi.fn(),
  shouldUseLocalTenantFallback: hoisted.shouldUseLocalTenantFallback,
}));

vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: vi.fn() }));

import { commitPeopleHouseholdImportBatch } from "@/lib/people-import-dry-run";

type Op = { table: string; op: string; payload?: unknown; filters: string[] };

function row(i: number, extra: Record<string, unknown> = {}) {
  return {
    normalized_payload: {
      rowNumber: i + 2,
      fullName: `Person ${i}`,
      email: `p${i}@example.test`,
      phone: null,
      memberNumber: String(1000 + i),
      householdName: `House ${Math.floor(i / 3)}`,
      action: "create",
      reason: null,
      ...extra,
    },
  };
}

function install(rows: unknown[], options: { failProfileInsertsOver?: number; existing?: unknown[] } = {}) {
  const ops: Op[] = [];
  let nextId = 0;
  hoisted.createTenantServerClient.mockResolvedValue({
    from(table: string) {
      const state: { op: string; payload?: unknown; filters: string[] } = { op: "select", filters: [] };
      let range: [number, number] | null = null;
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "then") {
              return (resolve: (v: unknown) => unknown, reject: (r: unknown) => unknown) => {
                ops.push({ table, ...state });
                let result: { data: unknown; error: unknown } = { data: [], error: null };
                if (state.op === "update") result = { data: [{ id: "row-1" }], error: null };
                else if (table === "import_batches") result = { data: state.op === "select" ? { status: "dry_run_completed", dry_run: true } : null, error: null };
                else if (table === "import_batch_rows") result = { data: range ? rows.slice(range[0], range[1] + 1) : rows, error: null };
                else if (table === "profiles" && state.op === "select") result = { data: options.existing ?? [], error: null };
                else if (table === "families" && state.op === "insert") {
                  result = { data: (state.payload as Array<{ family_name: string }>).map((f) => ({ id: `f-${nextId++}`, family_name: f.family_name })), error: null };
                } else if (table === "profiles" && state.op === "insert") {
                  const isBatch = Array.isArray(state.payload);
                  const size = isBatch ? (state.payload as unknown[]).length : 1;
                  result =
                    options.failProfileInsertsOver !== undefined && size > options.failProfileInsertsOver
                      ? { data: null, error: { message: "boom" } }
                      : { data: isBatch ? (state.payload as unknown[]).map(() => ({ id: `p-${nextId++}` })) : { id: `p-${nextId++}` }, error: null };
                }
                return Promise.resolve(result).then(resolve, reject);
              };
            }
            return (...args: unknown[]) => {
              if (prop === "insert" || prop === "update") {
                state.op = prop;
                state.payload = args[0];
              }
              if (prop === "range") range = [args[0] as number, args[1] as number];
              if (prop === "eq") state.filters.push(`${args[0]}=${args[1]}`);
              if (prop === "single" || prop === "maybeSingle") state.filters.push("single");
              return builder;
            };
          },
        },
      );
      return builder;
    },
  });
  return ops;
}

beforeEach(() => vi.clearAllMocks());

describe("commitPeopleHouseholdImportBatch batching", () => {
  it("inserts 1,200 new people in three chunked requests, each church-scoped", async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => row(i));
    const ops = install(rows);

    const result = await commitPeopleHouseholdImportBatch({ churchId: "church-1", actorProfileId: null, batchId: "b1" });

    expect(result).toMatchObject({ status: "committed", created: 1200, updated: 0, failed: 0 });
    const profileInserts = ops.filter((o) => o.table === "profiles" && o.op === "insert");
    expect(profileInserts.map((o) => (o.payload as unknown[]).length)).toEqual([500, 500, 200]);
    for (const insert of profileInserts) {
      for (const payload of insert.payload as Array<Record<string, unknown>>) {
        expect(payload.church_id).toBe("church-1");
        expect(payload.family_id).toMatch(/^f-/);
      }
    }
    // Households are created once each, in bulk, not per row.
    const familyInserts = ops.filter((o) => o.table === "families" && o.op === "insert");
    expect(familyInserts.reduce((n, o) => n + (o.payload as unknown[]).length, 0)).toBe(400);
  });

  it("retries a refused chunk row by row so one bad row does not fail the others", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => row(i));
    const ops = install(rows, { failProfileInsertsOver: 1 });

    const result = await commitPeopleHouseholdImportBatch({ churchId: "church-1", actorProfileId: null, batchId: "b1" });

    expect(result).toMatchObject({ created: 3, failed: 0 });
    const sizes = ops.filter((o) => o.table === "profiles" && o.op === "insert").map((o) => (Array.isArray(o.payload) ? (o.payload as unknown[]).length : 1));
    expect(sizes[0]).toBe(3); // the chunk, refused
    expect(sizes.slice(1)).toEqual([1, 1, 1]); // then one request per row
  });

  it("counts a row whose single insert is also refused as failed", async () => {
    const ops = install([row(0)], { failProfileInsertsOver: 0 });
    const result = await commitPeopleHouseholdImportBatch({ churchId: "church-1", actorProfileId: null, batchId: "b1" });
    expect(result).toMatchObject({ created: 0, failed: 1, status: "failed" });
    expect(ops.length).toBeGreaterThan(0);
  });

  it("updates rows that match an existing person one by one, never as a bulk insert", async () => {
    const rows = [row(0, { action: "update" })];
    const ops = install(rows, { existing: [{ id: "p-existing", full_name: "Person 0", email: "p0@example.test", phone: null, member_number: "1000" }] });

    const result = await commitPeopleHouseholdImportBatch({ churchId: "church-1", actorProfileId: null, batchId: "b1" });

    expect(result).toMatchObject({ created: 0, updated: 1, failed: 0 });
    expect(ops.some((o) => o.table === "profiles" && o.op === "insert")).toBe(false);
    const update = ops.find((o) => o.table === "profiles" && o.op === "update");
    expect(update?.filters).toEqual(expect.arrayContaining(["church_id=church-1", "id=p-existing"]));
  });

  it("creates an inactive or visitor person with that status, defaults to active, and never sends a status on update (R6)", async () => {
    const rows = [row(0, { membershipStatus: "inactive" }), row(1, { membershipStatus: "visitor" }), row(2)];
    const ops = install(rows);
    await commitPeopleHouseholdImportBatch({ churchId: "church-1", actorProfileId: null, batchId: "b1" });
    const insert = ops.find((o) => o.table === "profiles" && o.op === "insert");
    expect((insert?.payload as Array<{ membership_status: string }>).map((p) => p.membership_status)).toEqual(["inactive", "visitor", "active"]);

    const updateOps = install([row(0, { action: "update", membershipStatus: "inactive" })], {
      existing: [{ id: "p-existing", full_name: "Person 0", email: "p0@example.test", phone: null, member_number: "1000" }],
    });
    await commitPeopleHouseholdImportBatch({ churchId: "church-1", actorProfileId: null, batchId: "b1" });
    const update = updateOps.find((o) => o.table === "profiles" && o.op === "update");
    expect(update?.payload).not.toHaveProperty("membership_status");
  });
});
