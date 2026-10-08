import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const hoisted = vi.hoisted(() => ({ createTenantServerClient: vi.fn() }));
vi.mock("@/lib/supabase/tenant", () => ({ createTenantServerClient: hoisted.createTenantServerClient }));

import { computeImportReconciliation, listRecentImportBatches } from "@/lib/import-reconciliation";

type Query = { table: string; eq: Record<string, unknown>; inn: Record<string, unknown[]>; range?: [number, number]; limit?: number; select?: string };
type Handler = (query: Query) => { data: unknown; error: { message: string } | null };

let queries: Query[];

function install(handlers: Record<string, Handler>) {
  queries = [];
  hoisted.createTenantServerClient.mockResolvedValue({
    from(table: string) {
      const query: Query = { table, eq: {}, inn: {} };
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "then") {
              return (resolve: (v: unknown) => unknown, reject: (r: unknown) => unknown) => {
                queries.push(query);
                const handler = handlers[table];
                return Promise.resolve(handler ? handler(query) : { data: [], error: null }).then(resolve, reject);
              };
            }
            return (...args: unknown[]) => {
              if (prop === "select") query.select = String(args[0]);
              if (prop === "eq") query.eq[String(args[0])] = args[1];
              if (prop === "in") query.inn[String(args[0])] = args[1] as unknown[];
              if (prop === "range") query.range = [args[0] as number, args[1] as number];
              if (prop === "limit") query.limit = args[0] as number;
              if (prop === "maybeSingle") query.limit = 1;
              return builder;
            };
          },
        },
      );
      return builder;
    },
  });
}

const CHURCH = "church-1";
const BATCH = "batch-1";
const batchRow = (over: Record<string, unknown> = {}) => ({
  id: BATCH,
  import_type: "giving_csv",
  source_system: "breeze",
  source_filename: "gifts.csv",
  status: "committed",
  dry_run: false,
  summary: { outcomesRecorded: true, created: 2 },
  created_at: "2026-10-01T00:00:00Z",
  committed_at: "2026-10-01T00:01:00Z",
  ...over,
});

type Staged = {
  row_number: number;
  classification: string;
  reason?: string | null;
  commit_outcome?: string | null;
  committed_record_id?: string | null;
  commit_failure_reason?: string | null;
  commit_snapshot?: unknown;
  source_id?: string | null;
  member_number?: string | null;
  group_name?: string | null;
  source_amount?: string | null;
};
const staged = (rows: Staged[]) =>
  rows.map((row) => ({
    id: `row-${row.row_number}`,
    reason: null,
    commit_outcome: null,
    committed_record_id: null,
    commit_failure_reason: null,
    commit_snapshot: null,
    source_id: null,
    member_number: null,
    group_name: null,
    source_amount: null,
    ...row,
  }));

const gift = (n: number, amount: number, extra: Partial<Staged> = {}): Staged => ({
  row_number: n,
  classification: "create",
  commit_outcome: "written",
  committed_record_id: `d${n}`,
  source_id: `G-${n}`,
  commit_snapshot: {
    source: { amount_cents: amount, donated_at: "2026-09-06T17:00:00.000Z", fund: "General" },
    stored: { amount_cents: amount, donated_at: "2026-09-06T17:00:00+00:00", fund: "General" },
  },
  ...extra,
});

function givingHandlers(rows: Staged[], donations: Array<Record<string, unknown>>, batch = batchRow()) {
  return {
    import_batches: () => ({ data: batch, error: null }),
    import_batch_rows: (q: Query) => {
      const all = staged(rows);
      return { data: all.slice(q.range?.[0] ?? 0, (q.range?.[1] ?? all.length) + 1), error: null };
    },
    donations: (q: Query) => ({ data: donations.filter((d) => (q.inn.id ?? []).includes(d.id)), error: null }),
  };
}

const donation = (n: number, amount: number, over: Record<string, unknown> = {}) => ({
  id: `d${n}`,
  amount_cents: amount,
  created_at: "2026-09-06T17:00:00+00:00",
  fund_designation: "General",
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("computeImportReconciliation", () => {
  it("a clean giving import has zero mismatches and matching totals", async () => {
    install(givingHandlers([gift(2, 10000), gift(3, 2550), { row_number: 4, classification: "skip", reason: "Duplicate source ID in import file.", source_id: "G-1" }], [donation(2, 10000), donation(3, 2550)]));
    const result = await computeImportReconciliation(CHURCH, BATCH);
    expect(result).toMatchObject({
      state: "ready",
      mismatchCount: 0,
      counts: { sourceRows: 3, expected: 2, written: 2, failed: 0, notAttempted: 0, skipped: 1, rejected: 0 },
      giving: { sourceCents: 12550, writtenAtCommitCents: 12550, currentCents: 12550, differenceCents: 0 },
      changedSinceImport: [],
    });
    expect((result as { skipped: unknown[] }).skipped).toEqual([
      { rowNumber: 4, sourceId: "G-1", classification: "skip", reason: "Duplicate source ID in import file." },
    ]);
  });

  it("scopes every query to the church and the batch", async () => {
    install(givingHandlers([gift(2, 100)], [donation(2, 100)]));
    await computeImportReconciliation(CHURCH, BATCH);
    for (const query of queries) {
      expect(query.eq.church_id).toBe(CHURCH);
    }
    expect(queries.find((q) => q.table === "import_batch_rows")?.eq.batch_id).toBe(BATCH);
  });

  it("returns null for another church's or a missing batch", async () => {
    install({ import_batches: () => ({ data: null, error: null }) });
    expect(await computeImportReconciliation(CHURCH, BATCH)).toBeNull();
  });

  it("throws, without database detail, when a read fails", async () => {
    install({ import_batches: () => ({ data: null, error: { message: "secret detail" } }) });
    await expect(computeImportReconciliation(CHURCH, BATCH)).rejects.toThrow("Unable to load the import batch.");
  });

  it("lists every failed row with its reason, not only the first ten", async () => {
    const failed: Staged[] = Array.from({ length: 15 }, (_, i) => ({
      row_number: i + 2,
      classification: "create",
      commit_outcome: "failed",
      commit_failure_reason: "Referenced record is not in this church.",
      commit_snapshot: { source: { amount_cents: 100, donated_at: null, fund: null } },
      source_id: `G-${i}`,
    }));
    install(givingHandlers(failed, []));
    const result = await computeImportReconciliation(CHURCH, BATCH);
    expect(result).toMatchObject({ state: "ready", mismatchCount: 15, counts: { failed: 15, written: 0 } });
    const mismatches = (result as { mismatches: Array<{ kind: string; reason: string }> }).mismatches;
    expect(mismatches).toHaveLength(15);
    expect(mismatches.every((m) => m.kind === "failed" && m.reason === "Referenced record is not in this church.")).toBe(true);
    // Failed gifts are in the source total but not in the written total.
    expect((result as { giving: { differenceCents: number } }).giving.differenceCents).toBe(1500);
  });

  it("counts a row the commit never reached as a not-attempted mismatch and keeps its amount in the source total", async () => {
    install(givingHandlers([gift(2, 100), { row_number: 3, classification: "create", source_id: "G-3", source_amount: "900" }], [donation(2, 100)]));
    const result = await computeImportReconciliation(CHURCH, BATCH);
    expect(result).toMatchObject({
      mismatchCount: 1,
      counts: { notAttempted: 1, written: 1 },
      giving: { sourceCents: 1000, writtenAtCommitCents: 100, differenceCents: 900 },
    });
    expect((result as { mismatches: Array<{ kind: string }> }).mismatches[0].kind).toBe("not_attempted");
  });

  it("flags a gift whose stored amount, date or fund at commit differs from the file", async () => {
    const bad = gift(2, 10000, {
      commit_snapshot: {
        source: { amount_cents: 10000, donated_at: "2026-09-06", fund: "Missions" },
        stored: { amount_cents: 1000, donated_at: "2026-09-07T00:00:00+00:00", fund: "General" },
      },
    });
    install(givingHandlers([bad], [donation(2, 1000)]));
    const result = await computeImportReconciliation(CHURCH, BATCH);
    expect(result).toMatchObject({ mismatchCount: 1, giving: { sourceCents: 10000, writtenAtCommitCents: 1000, differenceCents: 9000 } });
    const [mismatch] = (result as { mismatches: Array<{ kind: string; differences: Array<{ field: string }> }> }).mismatches;
    expect(mismatch.kind).toBe("value_mismatch");
    expect(mismatch.differences.map((d) => d.field)).toEqual(["amount", "date", "fund"]);
  });

  it("does not compare a value the file left blank", async () => {
    const noFund = gift(2, 500, {
      commit_snapshot: {
        source: { amount_cents: 500, donated_at: null, fund: null },
        stored: { amount_cents: 500, donated_at: "2026-10-01T00:00:00+00:00", fund: "General" },
      },
    });
    install(givingHandlers([noFund], [donation(2, 500, { created_at: "2026-10-01T00:00:00+00:00" })]));
    expect(await computeImportReconciliation(CHURCH, BATCH)).toMatchObject({ mismatchCount: 0 });
  });

  it("lists a gift edited or deleted after import under changed since import, not as a mismatch", async () => {
    install(givingHandlers([gift(2, 10000), gift(3, 500), gift(4, 700)], [donation(2, 99999), donation(4, 700)]));
    const result = await computeImportReconciliation(CHURCH, BATCH);
    expect(result).toMatchObject({ mismatchCount: 0, giving: { currentCents: 99999 + 700, writtenAtCommitCents: 11200 } });
    expect((result as { changedSinceImport: unknown[] }).changedSinceImport).toEqual([
      { rowNumber: 2, sourceId: "G-2", change: "edited", differences: [{ field: "amount", atImport: 10000, now: 99999 }] },
      { rowNumber: 3, sourceId: "G-3", change: "deleted", differences: [] },
    ]);
  });

  it("lists a merged person under changed since import", async () => {
    const people: Staged[] = [
      { row_number: 2, classification: "create", commit_outcome: "written", committed_record_id: "p1", member_number: "M-1" },
      { row_number: 3, classification: "update", commit_outcome: "written", committed_record_id: "p2", member_number: "M-2" },
    ];
    install({
      import_batches: () => ({ data: batchRow({ import_type: "people_households_csv" }), error: null }),
      import_batch_rows: () => ({ data: staged(people), error: null }),
      profiles: () => ({ data: [{ id: "p1", merged_into_profile_id: "p2" }, { id: "p2", merged_into_profile_id: null }], error: null }),
    });
    const result = await computeImportReconciliation(CHURCH, BATCH);
    expect(result).toMatchObject({ mismatchCount: 0, giving: null });
    expect((result as { changedSinceImport: unknown[] }).changedSinceImport).toEqual([
      { rowNumber: 2, sourceId: "M-1", change: "merged", differences: [] },
    ]);
  });

  it("reads more than one page of rows and re-reads records in chunks of 200", async () => {
    const rows = Array.from({ length: 1205 }, (_, i) => gift(i + 2, 100));
    const donations = rows.map((row) => donation(row.row_number, 100));
    install(givingHandlers(rows, donations));
    const result = await computeImportReconciliation(CHURCH, BATCH);
    expect(result).toMatchObject({ counts: { sourceRows: 1205, written: 1205 }, mismatchCount: 0, giving: { sourceCents: 120500 } });
    expect(queries.filter((q) => q.table === "import_batch_rows")).toHaveLength(2);
    const rereads = queries.filter((q) => q.table === "donations");
    expect(rereads).toHaveLength(7);
    expect(Math.max(...rereads.map((q) => (q.inn.id ?? []).length))).toBe(200);
  });

  it("says row outcomes were not recorded for a batch committed before this change, never a false zero", async () => {
    install({ import_batches: () => ({ data: batchRow({ summary: { created: 4, updated: 1, failed: 0 } }), error: null }) });
    const result = await computeImportReconciliation(CHURCH, BATCH);
    expect(result).toMatchObject({ state: "legacy", summary: { created: 4, updated: 1, failed: 0 } });
    expect(queries.some((q) => q.table === "import_batch_rows")).toBe(false);
  });

  it.each([
    ["committing", false],
    ["dry_run_completed", true],
    ["draft", true],
  ])("a %s batch has no report yet", async (status, dryRun) => {
    install({ import_batches: () => ({ data: batchRow({ status, dry_run: dryRun }), error: null }) });
    expect(await computeImportReconciliation(CHURCH, BATCH)).toMatchObject({ state: "not_available" });
  });

  it("never selects names, emails or phones from the staged payload", async () => {
    install(givingHandlers([gift(2, 100)], [donation(2, 100)]));
    await computeImportReconciliation(CHURCH, BATCH, { includeRows: true });
    const select = queries.find((q) => q.table === "import_batch_rows")?.select ?? "";
    expect(select).not.toMatch(/raw_payload/);
    expect(select).not.toMatch(/fullName|full_name|email|phone|donorEmail|householdName/i);
    expect(select).not.toMatch(/normalized_payload(?!->>)/);
  });

  it("includes every row with an outcome for the CSV when asked", async () => {
    install(givingHandlers([gift(2, 100), { row_number: 3, classification: "reject", reason: "Invalid amount.", source_id: "G-3" }], [donation(2, 100)]));
    const result = await computeImportReconciliation(CHURCH, BATCH, { includeRows: true });
    expect((result as { rows: Array<{ rowNumber: number; outcome: string }> }).rows.map((r) => [r.rowNumber, r.outcome])).toEqual([
      [2, "written"],
      [3, "rejected"],
    ]);
  });
});

describe("listRecentImportBatches", () => {
  it("lists the church's last batches of the given types with their mismatch counts", async () => {
    install({
      import_batches: () => ({
        data: [
          { id: "a", created_at: "2026-10-03", source_filename: "a.csv", status: "committed", summary: { outcomesRecorded: true, mismatchCount: 3 } },
          { id: "b", created_at: "2026-10-02", source_filename: "b.csv", status: "committed", summary: { created: 5 } },
          { id: "c", created_at: "2026-10-01", source_filename: "c.csv", status: "dry_run_completed", summary: {} },
        ],
        error: null,
      }),
    });
    const list = await listRecentImportBatches(CHURCH, ["groups_csv", "group_memberships_csv"]);
    expect(list).toEqual([
      { id: "a", createdAt: "2026-10-03", sourceFilename: "a.csv", status: "committed", mismatchCount: 3, legacy: false },
      { id: "b", createdAt: "2026-10-02", sourceFilename: "b.csv", status: "committed", mismatchCount: null, legacy: true },
      { id: "c", createdAt: "2026-10-01", sourceFilename: "c.csv", status: "dry_run_completed", mismatchCount: null, legacy: false },
    ]);
    expect(queries[0].eq.church_id).toBe(CHURCH);
    expect(queries[0].inn.import_type).toEqual(["groups_csv", "group_memberships_csv"]);
    expect(queries[0].limit).toBe(20);
  });

  it("throws when the read fails", async () => {
    install({ import_batches: () => ({ data: null, error: { message: "x" } }) });
    await expect(listRecentImportBatches(CHURCH, ["giving_csv"])).rejects.toThrow("Unable to load recent imports.");
  });
});
