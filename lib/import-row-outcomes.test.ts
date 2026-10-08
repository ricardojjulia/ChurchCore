import { beforeEach, describe, expect, it, vi } from "vitest";

// G4.2: every commit records, per staged row, written (with the record id),
// failed (with a safe reason), or nothing (not attempted); the commit and a
// crash MERGE into the batch summary instead of replacing it.

vi.mock("server-only", () => ({}));

const hoisted = vi.hoisted(() => ({
  createTenantServerClient: vi.fn(),
  shouldUseLocalTenantFallback: vi.fn(() => false),
  logAuditEvent: vi.fn(),
}));
vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: hoisted.createTenantServerClient,
  queryTenantLocalDb: vi.fn(),
  shouldUseLocalTenantFallback: hoisted.shouldUseLocalTenantFallback,
}));
vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: hoisted.logAuditEvent }));

import { commitAttendanceImportBatch } from "@/lib/attendance-import-dry-run";
import { commitEventsImportBatch } from "@/lib/events-import-dry-run";
import { commitGivingImportBatch } from "@/lib/giving-import-dry-run";
import { commitGroupsImportBatch } from "@/lib/groups-import-dry-run";
import {
  createOutcomeRecorder,
  failImportBatch,
  givingSnapshotMismatches,
  mergeBatchSummary,
  runClaimedCommit,
} from "@/lib/import-commit";
import { commitPeopleHouseholdImportBatch } from "@/lib/people-import-dry-run";

type Outcome = { id: string; commit_outcome: string; committed_record_id: string | null; commit_failure_reason: string | null; commit_snapshot: Record<string, unknown> };
type Op = { table: string; op: string; payload?: unknown; filters: string[] };

type Options = {
  rows?: Array<{ id: string; normalized_payload: unknown }>;
  tables?: Record<string, unknown>;
  /** Fails inserts into these tables. */
  failInsert?: string[];
  failProfileChunksOver?: number;
  existing?: Record<string, { id: string }>;
  rpcError?: boolean;
  summary?: Record<string, unknown>;
  lookupError?: string;
};

let ops: Op[];
let outcomes: Outcome[];
let rpcCalls: Outcome[][];
let nextId: number;

function install(options: Options = {}) {
  ops = [];
  outcomes = [];
  rpcCalls = [];
  nextId = 0;
  hoisted.createTenantServerClient.mockResolvedValue({
    rpc(name: string, args: { p_outcomes: Outcome[] }) {
      expect(name).toBe("record_import_row_outcomes");
      if (options.rpcError) return Promise.resolve({ data: null, error: { message: "rls detail" } });
      rpcCalls.push(args.p_outcomes);
      outcomes.push(...args.p_outcomes);
      return Promise.resolve({ data: args.p_outcomes.length, error: null });
    },
    from(table: string) {
      const state: Op & { range?: [number, number]; single: boolean; selected: boolean } = { table, op: "select", filters: [], single: false, selected: false };
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "then") {
              return (resolve: (v: unknown) => unknown, reject: (r: unknown) => unknown) => {
                ops.push({ table, op: state.op, payload: state.payload, filters: state.filters });
                let result: { data: unknown; error: unknown } = { data: [], error: null };
                if (state.op === "update") {
                  result = { data: [{ id: "claimed-or-updated" }], error: null };
                } else if (state.op === "insert") {
                  if (options.failInsert?.includes(table) || (table === "profiles" && Array.isArray(state.payload) && options.failProfileChunksOver !== undefined && state.payload.length > options.failProfileChunksOver)) {
                    result = { data: null, error: { message: "boom" } };
                  } else if (Array.isArray(state.payload)) {
                    result = { data: state.payload.map((p: Record<string, unknown>) => ({ id: `new-${nextId++}`, family_name: p.family_name })), error: null };
                  } else {
                    const p = state.payload as Record<string, unknown>;
                    result = { data: { id: `new-${nextId++}`, amount_cents: p.amount_cents, created_at: p.created_at, fund_designation: p.fund_designation ?? null }, error: null };
                  }
                } else if (table === "import_batches") {
                  result = { data: { status: "dry_run_completed", dry_run: true, import_type: "giving_csv", source_system: "breeze", summary: options.summary ?? {} }, error: null };
                } else if (table === "import_batch_rows") {
                  const rows = options.rows ?? [];
                  result = { data: state.range ? rows.slice(state.range[0], state.range[1] + 1) : rows, error: null };
                } else if (options.lookupError === table) {
                  result = { data: null, error: { message: "lookup broke" } };
                } else if (state.single && options.existing?.[table]) {
                  result = { data: options.existing[table], error: null };
                } else if (state.single) {
                  result = { data: null, error: null };
                } else {
                  result = { data: (options.tables?.[table] as unknown[]) ?? [], error: null };
                }
                return Promise.resolve(result).then(resolve, reject);
              };
            }
            return (...args: unknown[]) => {
              if (prop === "insert" || prop === "update") {
                state.op = prop;
                state.payload = args[0];
              }
              if (prop === "eq") state.filters.push(`${args[0]}=${args[1]}`);
              if (prop === "range") state.range = [args[0] as number, args[1] as number];
              if (prop === "single" || prop === "maybeSingle") state.single = true;
              return builder;
            };
          },
        },
      );
      return builder;
    },
  });
}

const input = { churchId: "church-1", actorProfileId: "profile-1", batchId: "b1", actorUserId: "login-1", actorRole: "church-admin" };
const lastBatchUpdate = () => ops.filter((o) => o.table === "import_batches" && o.op === "update").pop()?.payload as { status: string; summary: Record<string, unknown> };

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.shouldUseLocalTenantFallback.mockReturnValue(false);
});

describe("createOutcomeRecorder", () => {
  it("flushes every 500 outcomes and the rest on flush, through the RPC", async () => {
    install();
    const recorder = createOutcomeRecorder("church-1", "b1");
    for (let i = 0; i < 1203; i += 1) {
      await recorder.record(`r${i}`, { outcome: "written", recordId: `x${i}` });
    }
    expect(rpcCalls.map((c) => c.length)).toEqual([500, 500]);
    await recorder.flush();
    expect(rpcCalls.map((c) => c.length)).toEqual([500, 500, 203]);
    expect(recorder.recordedCount).toBe(1203);
  });

  it("serializes concurrent flushes and loses nothing", async () => {
    install();
    const recorder = createOutcomeRecorder("church-1", "b1");
    await Promise.all(Array.from({ length: 1000 }, (_, i) => recorder.record(`r${i}`, { outcome: "written" })));
    await recorder.flush();
    expect(outcomes.map((o) => o.id).sort()).toEqual(Array.from({ length: 1000 }, (_, i) => `r${i}`).sort());
  });

  it("throws a generic error when the RPC is refused, without database detail", async () => {
    install({ rpcError: true });
    const recorder = createOutcomeRecorder("church-1", "b1");
    await recorder.record("r1", { outcome: "written" });
    await expect(recorder.flush()).rejects.toThrow("Unable to record the import row outcomes.");
  });

  it("only counts in local fallback mode (no outcome columns to write)", async () => {
    install();
    hoisted.shouldUseLocalTenantFallback.mockReturnValue(true);
    const recorder = createOutcomeRecorder("church-1", "b1");
    await recorder.record("r1", { outcome: "written" });
    await recorder.flush();
    expect(rpcCalls).toHaveLength(0);
    expect(recorder.recordedCount).toBe(1);
  });
});

describe("mergeBatchSummary and failImportBatch", () => {
  it("merges the patch over the existing summary and checks the error", async () => {
    install({ summary: { ignoredColumns: ["x"], create: 4 } });
    await mergeBatchSummary("church-1", "b1", { created: 4 });
    expect(lastBatchUpdate().summary).toEqual({ ignoredColumns: ["x"], create: 4, created: 4 });
  });

  it("failImportBatch keeps the dry-run counts and adds the error, only while committing", async () => {
    install({ summary: { ignoredColumns: ["x"], create: 4 } });
    await failImportBatch("church-1", "b1", "Import commit failed.", { outcomesRecorded: true });
    const update = ops.filter((o) => o.table === "import_batches" && o.op === "update").pop()!;
    expect((update.payload as { summary: unknown }).summary).toEqual({ ignoredColumns: ["x"], create: 4, error: "Import commit failed.", outcomesRecorded: true });
    expect((update.payload as { status: string }).status).toBe("failed");
    expect(update.filters).toContain("status=committing");
  });
});

describe("runClaimedCommit", () => {
  it("flushes buffered outcomes before marking a crashed batch failed", async () => {
    install({ summary: { create: 2 } });
    await expect(
      runClaimedCommit(input, async (recorder) => {
        await recorder.record("r1", { outcome: "written", recordId: "rec-1" });
        throw new Error("exploded");
      }),
    ).rejects.toThrow("exploded");
    expect(outcomes.map((o) => o.id)).toEqual(["r1"]);
    expect(lastBatchUpdate().summary).toMatchObject({ create: 2, error: "exploded", outcomesRecorded: true });
  });
});

describe("givingSnapshotMismatches", () => {
  it("compares amount, date (a bare date means the day) and fund, skipping values the file left blank", () => {
    expect(givingSnapshotMismatches({ source: { amount_cents: 1, donated_at: "2026-09-06", fund: null }, stored: { amount_cents: 1, donated_at: "2026-09-06T00:00:00+00:00", fund: "X" } })).toEqual([]);
    expect(givingSnapshotMismatches({ source: { amount_cents: 1, donated_at: "2026-09-06T10:00:00Z", fund: "A" }, stored: { amount_cents: 2, donated_at: "2026-09-06T11:00:00Z", fund: "B" } })).toEqual(["amount", "date", "fund"]);
    expect(givingSnapshotMismatches({ source: { amount_cents: 1 } })).toEqual([]);
  });
});

describe("giving commit outcomes", () => {
  const row = (id: string, payload: unknown) => ({ id, normalized_payload: payload });

  it("records a written outcome with the saved record id and a source/stored snapshot, and merges the summary", async () => {
    install({
      summary: { ignoredColumns: ["Notes"], create: 1 },
      rows: [row("r1", { sourceId: "G1", amountCents: 12345, fundDesignation: "Missions", donatedInstant: "2026-09-06T17:00:00.000Z", isAnonymous: true })],
    });
    const result = await commitGivingImportBatch(input);
    expect(result).toMatchObject({ created: 1, failed: 0 });
    expect(outcomes).toEqual([
      {
        id: "r1",
        commit_outcome: "written",
        committed_record_id: "new-0",
        commit_failure_reason: null,
        commit_snapshot: {
          source: { amount_cents: 12345, donated_at: "2026-09-06T17:00:00.000Z", fund: "Missions" },
          stored: { amount_cents: 12345, donated_at: "2026-09-06T17:00:00.000Z", fund: "Missions" },
        },
      },
    ]);
    expect(lastBatchUpdate().summary).toMatchObject({ ignoredColumns: ["Notes"], create: 1, created: 1, failed: 0, outcomesRecorded: true, mismatchCount: 0 });
  });

  it("records a failed row with a safe reason and the file's values, and counts it as a mismatch", async () => {
    install({ failInsert: ["donations"], rows: [row("r1", { sourceId: "G1", amountCents: 500, isAnonymous: true })] });
    const result = await commitGivingImportBatch(input);
    expect(result).toMatchObject({ created: 0, failed: 1, status: "failed" });
    expect(outcomes[0]).toMatchObject({ id: "r1", commit_outcome: "failed", committed_record_id: null, commit_failure_reason: "Row could not be written." });
    expect(outcomes[0].commit_snapshot).toEqual({ source: { amount_cents: 500, donated_at: null, fund: null } });
    expect(JSON.stringify(outcomes)).not.toContain("boom");
    expect(lastBatchUpdate().summary).toMatchObject({ failed: 1, mismatchCount: 1 });
  });

  it("records an unreadable staged payload as failed instead of dropping it", async () => {
    install({ rows: [row("r1", null), row("r2", { sourceId: "G2", amountCents: 100, isAnonymous: true })] });
    const result = await commitGivingImportBatch(input);
    expect(result).toMatchObject({ created: 1, failed: 1 });
    expect(outcomes.find((o) => o.id === "r1")).toMatchObject({ commit_outcome: "failed", commit_failure_reason: "Row could not be written." });
    expect(lastBatchUpdate().summary).toMatchObject({ mismatchCount: 1 });
  });

  it("a failed existing-record lookup fails the row instead of creating a duplicate", async () => {
    install({ lookupError: "donations", rows: [row("r1", { sourceId: "G1", amountCents: 500, isAnonymous: true })] });
    const result = await commitGivingImportBatch(input);
    expect(result).toMatchObject({ created: 0, failed: 1 });
    expect(ops.some((o) => o.table === "donations" && o.op === "insert")).toBe(false);
  });

  it("records an updated row with the existing record's id", async () => {
    install({ existing: { donations: { id: "d-existing" } }, rows: [row("r1", { sourceId: "G1", amountCents: 500, isAnonymous: true })] });
    // The update returns the fake's generic row; the id recorded is the one the update returned.
    await commitGivingImportBatch(input);
    expect(outcomes[0]).toMatchObject({ commit_outcome: "written", committed_record_id: "claimed-or-updated" });
  });

  it("a RPC refusal aborts the commit and marks the batch failed", async () => {
    install({ rpcError: true, rows: [row("r1", { sourceId: "G1", amountCents: 500, isAnonymous: true })] });
    await expect(commitGivingImportBatch(input)).rejects.toThrow("Unable to record the import row outcomes.");
    expect(lastBatchUpdate().status).toBe("failed");
  });
});

describe("attendance, events and groups commit outcomes", () => {
  const row = (id: string, payload: unknown) => ({ id, normalized_payload: payload });

  it("attendance records written and failed rows", async () => {
    install({ tables: { profiles: [{ id: "mine" }], events: [{ id: "ev" }] }, rows: [row("r1", { sourceId: "A1", profileId: "mine", eventId: "ev" }), row("r2", { sourceId: "A2", profileId: "theirs", eventId: "ev" })] });
    await commitAttendanceImportBatch(input);
    expect(outcomes).toMatchObject([
      { id: "r1", commit_outcome: "written", committed_record_id: "new-0" },
      { id: "r2", commit_outcome: "failed", commit_failure_reason: "Referenced record is not in this church." },
    ]);
    expect(lastBatchUpdate().summary).toMatchObject({ outcomesRecorded: true, mismatchCount: 1 });
  });

  it("events records a written row and a failed existing-record lookup", async () => {
    const payload = { sourceId: "E1", title: "X", startsAtInstant: "2026-01-01T10:00:00Z", endsAtInstant: "2026-01-01T11:00:00Z" };
    install({ rows: [row("r1", payload)] });
    await commitEventsImportBatch(input);
    expect(outcomes[0]).toMatchObject({ commit_outcome: "written", committed_record_id: "new-0" });

    install({ lookupError: "events", rows: [row("r1", payload)] });
    expect(await commitEventsImportBatch(input)).toMatchObject({ failed: 1, created: 0 });
    expect(outcomes[0]).toMatchObject({ commit_outcome: "failed" });
  });

  it("groups records a written group, and tags record the membership id, with already_member noted", async () => {
    install({ rows: [row("r1", { sourceId: "G1", name: "Study", isActive: true })] });
    await commitGroupsImportBatch(input);
    expect(outcomes[0]).toMatchObject({ commit_outcome: "written", committed_record_id: "new-0" });

    const tag = { kind: "group_membership", groupName: "Hospitality", folder: null, profileId: "mine" };
    install({ tables: { profiles: [{ id: "mine" }], groups: [{ id: "g1", name: "Hospitality" }] }, existing: { group_members: { id: "gm-existing" } }, rows: [row("r1", tag)] });
    expect(await commitGroupsImportBatch(input)).toMatchObject({ created: 0, failed: 0 });
    expect(outcomes[0]).toMatchObject({ commit_outcome: "written", committed_record_id: "gm-existing", commit_snapshot: { note: "already_member" } });
  });

  it("a tag that has to create its group still records the new membership id", async () => {
    const tag = { kind: "group_membership", groupName: "Brand New", folder: null, profileId: "mine" };
    install({ tables: { profiles: [{ id: "mine" }] }, rows: [row("r1", tag)] });
    expect(await commitGroupsImportBatch(input)).toMatchObject({ created: 1, failed: 0 });
    expect(outcomes[0]).toMatchObject({ commit_outcome: "written" });
    expect(outcomes[0].committed_record_id).toMatch(/^new-/);
    expect(outcomes[0].commit_snapshot).toEqual({});
  });
});

describe("people commit outcomes", () => {
  const person = (i: number, extra: Record<string, unknown> = {}) => ({
    id: `r${i}`,
    normalized_payload: { rowNumber: i + 2, fullName: `Person ${i}`, email: `p${i}@example.test`, phone: null, memberNumber: String(1000 + i), householdName: null, action: "create", reason: null, ...extra },
  });

  it("maps chunked inserts back to their own staged rows", async () => {
    install({ rows: [person(0), person(1), person(2)] });
    const result = await commitPeopleHouseholdImportBatch(input);
    expect(result).toMatchObject({ created: 3, failed: 0 });
    expect(outcomes.map((o) => [o.id, o.commit_outcome, o.committed_record_id])).toEqual([
      ["r0", "written", "new-0"],
      ["r1", "written", "new-1"],
      ["r2", "written", "new-2"],
    ]);
  });

  it("a refused chunk falls back to one row at a time, each recording its own outcome", async () => {
    install({ failProfileChunksOver: 1, rows: [person(0), person(1)] });
    const result = await commitPeopleHouseholdImportBatch(input);
    expect(result).toMatchObject({ created: 2, failed: 0 });
    expect(outcomes.map((o) => o.id).sort()).toEqual(["r0", "r1"]);
    expect(outcomes.every((o) => o.commit_outcome === "written" && o.committed_record_id)).toBe(true);
  });

  it("updates through the lanes record the existing person's id, and a failed one records its reason", async () => {
    install({
      tables: { profiles: [{ id: "p-existing", full_name: "Person 0", email: "p0@example.test", phone: null, member_number: "1000" }] },
      rows: [person(0, { action: "update" }), person(1, { fullName: "" , email: null, memberNumber: "9" })],
    });
    await commitPeopleHouseholdImportBatch(input);
    expect(outcomes.find((o) => o.id === "r0")).toMatchObject({ commit_outcome: "written", committed_record_id: "p-existing" });
  });

  it("an unreadable staged payload is recorded failed and the batch fails", async () => {
    install({ rows: [{ id: "r0", normalized_payload: "nope" }, person(1)] });
    const result = await commitPeopleHouseholdImportBatch(input);
    expect(result).toMatchObject({ created: 1, failed: 1, status: "failed" });
    expect(outcomes.find((o) => o.id === "r0")).toMatchObject({ commit_outcome: "failed" });
    expect(lastBatchUpdate().summary).toMatchObject({ outcomesRecorded: true, mismatchCount: 1 });
  });
});
