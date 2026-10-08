import { beforeEach, describe, expect, it, vi } from "vitest";

// G4.1 / Council Review 45: commit safety (R1 foreign ids, R2 claim, R10 zero-row
// updates, R12 audit, R7 local path, R8 ordering) against a recording stand-in.

vi.mock("server-only", () => ({}));

const hoisted = vi.hoisted(() => ({
  createTenantServerClient: vi.fn(),
  queryTenantLocalDb: vi.fn(),
  shouldUseLocalTenantFallback: vi.fn(() => false),
  logAuditEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: hoisted.createTenantServerClient,
  queryTenantLocalDb: hoisted.queryTenantLocalDb,
  shouldUseLocalTenantFallback: hoisted.shouldUseLocalTenantFallback,
}));
vi.mock("@/lib/actions/audit", () => ({ logAuditEvent: hoisted.logAuditEvent }));

import { commitAttendanceImportBatch } from "@/lib/attendance-import-dry-run";
import { commitEventsImportBatch } from "@/lib/events-import-dry-run";
import { commitGivingImportBatch } from "@/lib/giving-import-dry-run";
import { commitGroupsImportBatch } from "@/lib/groups-import-dry-run";
import { commitPeopleHouseholdImportBatch, laneByTarget } from "@/lib/people-import-dry-run";

type Op = { table: string; op: string; payload?: unknown; filters: string[]; selected: boolean };

type FakeOptions = {
  tables?: Record<string, unknown>;
  /** How many claims succeed (default: unlimited). */
  claims?: number;
  /** Rows an update touches (default 1). */
  updateRows?: number;
  existingId?: string | null;
  failSelect?: string;
};

let ops: Op[];

function install(options: FakeOptions = {}) {
  ops = [];
  let claimsLeft = options.claims ?? Infinity;
  hoisted.createTenantServerClient.mockResolvedValue({
    from(table: string) {
      const state: Op & { single: boolean; range?: [number, number] } = { table, op: "select", filters: [], selected: false, single: false };
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "then") {
              return (resolve: (v: unknown) => unknown, reject: (r: unknown) => unknown) => {
                ops.push({ table, op: state.op, payload: state.payload, filters: state.filters, selected: state.selected });
                let result: { data: unknown; error: unknown } = { data: null, error: null };
                if (state.op === "update") {
                  if (table === "import_batches" && (state.payload as { status?: string })?.status === "committing") {
                    result = { data: claimsLeft > 0 ? [{ id: "b1" }] : [], error: null };
                    claimsLeft -= 1;
                  } else {
                    result = { data: Array.from({ length: options.updateRows ?? 1 }, () => ({ id: "row" })), error: null };
                  }
                } else if (state.op === "insert" && state.selected) {
                  // An insert that asks for its row back (the commit records the saved values).
                  const p = (state.payload ?? {}) as { amount_cents?: number; created_at?: string; fund_designation?: string };
                  result = { data: { id: "new-id", amount_cents: p.amount_cents, created_at: p.created_at, fund_designation: p.fund_designation ?? null }, error: null };
                } else if (state.op === "select") {
                  if (options.failSelect === table) {
                    result = { data: null, error: { message: "secret db detail" } };
                  } else if (table === "import_batches") {
                    result = { data: { status: "dry_run_completed", dry_run: true, import_type: "giving_csv", source_system: "breeze" }, error: null };
                  } else {
                    const data = options.tables?.[table] ?? [];
                    const rows = Array.isArray(data) && state.range ? data.slice(state.range[0], state.range[1] + 1) : data;
                    result = { data: state.single ? (options.existingId ? { id: options.existingId } : null) : rows, error: null };
                  }
                }
                return Promise.resolve(result).then(resolve, reject);
              };
            }
            return (...args: unknown[]) => {
              if (prop === "insert" || prop === "update") {
                state.op = prop;
                state.payload = args[0];
              }
              if (prop === "select" && state.op !== "select") state.selected = true;
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
const rowsOf = (...payloads: unknown[]) => ({ import_batch_rows: payloads.map((normalized_payload) => ({ normalized_payload })) });

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.shouldUseLocalTenantFallback.mockReturnValue(false);
});

describe("R1: a payload id outside this church is refused at commit and never written", () => {
  const FOREIGN = "Referenced record is not in this church.";

  it("giving: a profile id from another church", async () => {
    install({ tables: { profiles: [{ id: "mine" }], ...rowsOf({ sourceId: "G1", amountCents: 100, profileId: "theirs", isAnonymous: false }) } });
    const result = await commitGivingImportBatch(input);
    expect(result).toMatchObject({ created: 0, failed: 1, failureReasons: [FOREIGN] });
    expect(ops.some((o) => o.table === "donations" && o.op === "insert")).toBe(false);
  });

  it("giving: a profile of this church is written", async () => {
    install({ tables: { profiles: [{ id: "mine" }], ...rowsOf({ sourceId: "G1", amountCents: 100, profileId: "mine", isAnonymous: false }) } });
    expect(await commitGivingImportBatch(input)).toMatchObject({ created: 1, failed: 0 });
  });

  it("attendance: a foreign profile or a foreign event", async () => {
    install({
      tables: {
        profiles: [{ id: "mine" }],
        events: [{ id: "my-event" }],
        ...rowsOf({ sourceId: "A1", profileId: "mine", eventId: "their-event" }, { sourceId: "A2", profileId: "theirs", eventId: "my-event" }, { sourceId: "A3", profileId: "mine", eventId: "my-event" }),
      },
    });
    const result = await commitAttendanceImportBatch(input);
    expect(result).toMatchObject({ created: 1, failed: 2, failureReasons: [FOREIGN] });
    expect(ops.filter((o) => o.table === "attendance" && o.op === "insert")).toHaveLength(1);
  });

  it("events: a foreign ministry", async () => {
    install({ tables: { ministries: [{ id: "m1" }], ...rowsOf({ sourceId: "E1", title: "X", startsAtInstant: "2026-01-01T10:00:00Z", endsAtInstant: "2026-01-01T11:00:00Z", ministryId: "other" }) } });
    expect(await commitEventsImportBatch(input)).toMatchObject({ created: 0, failed: 1, failureReasons: [FOREIGN] });
  });

  it("groups: a foreign leader, and a foreign tag member", async () => {
    install({ tables: { profiles: [{ id: "mine" }], ...rowsOf({ sourceId: "G1", name: "Study", isActive: true, leaderProfileId: "theirs" }) } });
    expect(await commitGroupsImportBatch(input)).toMatchObject({ created: 0, failed: 1, failureReasons: [FOREIGN] });

    install({ tables: { profiles: [{ id: "mine" }], ...rowsOf({ kind: "group_membership", groupName: "Hospitality", folder: null, profileId: "theirs" }) } });
    const tags = await commitGroupsImportBatch(input);
    expect(tags).toMatchObject({ created: 0, failed: 1, failureReasons: [FOREIGN] });
    expect(ops.some((o) => o.table === "group_members" && o.op === "insert")).toBe(false);
  });
});

describe("R2: a batch is claimed once", () => {
  it("claims dry_run_completed -> committing with a conditional update, then marks committed", async () => {
    install({ tables: rowsOf({ sourceId: "G1", amountCents: 100, isAnonymous: true }) });
    await commitGivingImportBatch(input);
    const claim = ops.find((o) => o.table === "import_batches" && (o.payload as { status?: string })?.status === "committing");
    expect(claim?.filters).toEqual(expect.arrayContaining(["id=b1", "church_id=church-1", "status=dry_run_completed", "dry_run=true"]));
    const final = ops.filter((o) => o.table === "import_batches" && o.op === "update").pop();
    expect((final?.payload as { status: string }).status).toBe("committed");
  });

  it("a second concurrent commit is refused and writes nothing", async () => {
    install({ claims: 1, tables: rowsOf({ sourceId: "G1", amountCents: 100, isAnonymous: true }) });
    const results = await Promise.allSettled([commitGivingImportBatch(input), commitGivingImportBatch(input)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason.message).toBe("This batch is already being committed or was committed.");
    expect(ops.filter((o) => o.table === "donations" && o.op === "insert")).toHaveLength(1);
  });

  it.each([
    ["people", () => commitPeopleHouseholdImportBatch(input)],
    ["attendance", () => commitAttendanceImportBatch(input)],
    ["events", () => commitEventsImportBatch(input)],
    ["groups", () => commitGroupsImportBatch(input)],
  ])("%s: an already-claimed batch is refused", async (_name, run) => {
    install({ claims: 0 });
    await expect(run()).rejects.toThrow("This batch is already being committed or was committed.");
  });

  it("marks the batch failed (with a generic reason) when the commit throws after the claim", async () => {
    install({ failSelect: "import_batch_rows", tables: {} });
    await expect(commitGivingImportBatch(input)).rejects.toThrow();
    const failed = ops.filter((o) => o.table === "import_batches" && (o.payload as { status?: string })?.status === "failed");
    expect(failed).toHaveLength(1);
    expect(JSON.stringify(failed[0].payload)).not.toContain("secret db detail");
    expect(failed[0].filters).toContain("status=committing");
  });
});

describe("R10: an update that touches no row is a failed row", () => {
  it.each([
    ["giving", "donations", () => commitGivingImportBatch(input), { sourceId: "G1", amountCents: 100, isAnonymous: true }],
    ["attendance", "attendance", () => commitAttendanceImportBatch(input), { sourceId: "A1", profileId: "mine" }],
    ["events", "events", () => commitEventsImportBatch(input), { sourceId: "E1", title: "X", startsAtInstant: "2026-01-01T10:00:00Z", endsAtInstant: "2026-01-01T11:00:00Z" }],
    ["groups", "groups", () => commitGroupsImportBatch(input), { sourceId: "G1", name: "Study", isActive: true }],
  ])("%s", async (_name, _table, run, payload) => {
    // Every update (including the claim, which has its own path) touches zero rows except the claim.
    install({ existingId: "existing", updateRows: 0, tables: { profiles: [{ id: "mine" }], ...rowsOf(payload) } });
    const result = await run();
    expect(result).toMatchObject({ updated: 0, failed: 1, failureReasons: ["Existing record was not updated."] });
  });

  it("people", async () => {
    install({
      updateRows: 0,
      tables: {
        profiles: [{ id: "p1", full_name: "A B", email: "a@example.org", phone: null, member_number: "1" }],
        ...rowsOf({ rowNumber: 2, fullName: "A B", email: "a@example.org", phone: null, memberNumber: "1", householdName: null, action: "update", reason: null }),
      },
    });
    expect(await commitPeopleHouseholdImportBatch(input)).toMatchObject({ updated: 0, failed: 1, failureReasons: ["Existing record was not updated."] });
  });
});

describe("R12: one audit entry per commit, without PII", () => {
  it("logs batch id, import type, source and counts with the login id as actor", async () => {
    install({ tables: rowsOf({ sourceId: "G1", amountCents: 100, isAnonymous: true, donorEmail: "someone@example.org", note: "private" }) });
    await commitGivingImportBatch(input);

    expect(hoisted.logAuditEvent).toHaveBeenCalledTimes(1);
    const entry = hoisted.logAuditEvent.mock.calls[0][0];
    expect(entry).toMatchObject({
      tableName: "import_batches",
      recordId: "b1",
      operation: "UPDATE",
      actorId: "login-1",
      churchId: "church-1",
      actorRole: "church-admin",
      newValues: { import_type: "giving_csv", source_system: "breeze", status: "committed", created: 1, updated: 0, failed: 0 },
    });
    expect(JSON.stringify(entry)).not.toMatch(/someone@example|private/);
  });

  it("a lost audit entry does not fail a commit that already wrote", async () => {
    hoisted.logAuditEvent.mockRejectedValueOnce(new Error("audit down"));
    install({ tables: rowsOf({ sourceId: "G1", amountCents: 100, isAnonymous: true }) });
    await expect(commitGivingImportBatch(input)).resolves.toMatchObject({ created: 1 });
  });
});

describe("R7: a giving update never sets status (local path too)", () => {
  it("local SQL update has no status and passes null for a blank recurring cell", async () => {
    hoisted.shouldUseLocalTenantFallback.mockReturnValue(true);
    const updates: Array<{ sql: string; params: unknown[] }> = [];
    hoisted.queryTenantLocalDb.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("from public.import_batches")) return { rows: [{ status: "dry_run_completed", dry_run: true }] };
      if (sql.includes("from public.import_batch_rows")) {
        return { rows: [{ normalized_payload: { sourceId: "G1", amountCents: 100, isAnonymous: true, isRecurringRaw: null, isRecurring: false } }] };
      }
      if (sql.includes("from public.donations")) return { rows: [{ id: "d1" }] };
      if (sql.includes("update public.donations")) updates.push({ sql, params });
      return { rows: [] };
    });
    await commitGivingImportBatch(input);
    expect(updates).toHaveLength(1);
    expect(updates[0].sql).not.toMatch(/status\s*=/);
    expect(updates[0].params[4]).toBeNull();
  });

  it("local SQL update passes the flag when the cell has a value", async () => {
    hoisted.shouldUseLocalTenantFallback.mockReturnValue(true);
    const updates: unknown[][] = [];
    hoisted.queryTenantLocalDb.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("from public.import_batches")) return { rows: [{ status: "dry_run_completed", dry_run: true }] };
      if (sql.includes("from public.import_batch_rows")) {
        return { rows: [{ normalized_payload: { sourceId: "G1", amountCents: 100, isAnonymous: true, isRecurringRaw: "yes", isRecurring: true } }] };
      }
      if (sql.includes("from public.donations")) return { rows: [{ id: "d1" }] };
      if (sql.includes("update public.donations")) updates.push(params);
      return { rows: [] };
    });
    await commitGivingImportBatch(input);
    expect(updates[0][4]).toBe(true);
  });
});

describe("R8: rows on the same person run in file order", () => {
  const row = (name: string, extra: Record<string, unknown> = {}) => ({
    rowNumber: 2,
    householdName: null,
    fullName: name,
    email: null,
    phone: null,
    memberNumber: null,
    action: "update" as const,
    reason: null,
    ...extra,
  });

  it("puts rows that resolve to the same profile in one lane, in file order", () => {
    const existing = {
      byMemberNumber: new Map([["1", "p1"]]),
      byEmail: new Map([["a@example.org", "p1"], ["b@example.org", "p2"]]),
      byNamePhone: new Map<string, string>(),
      familyNames: new Set<string>(),
    };
    const lanes = laneByTarget(
      [
        row("First", { memberNumber: "1" }),
        row("Other", { email: "b@example.org" }),
        row("Second", { email: "a@example.org" }),
        row("Third", { memberNumber: "1" }),
      ],
      existing,
    );
    expect(lanes.map((lane) => lane.map((r) => r.fullName))).toEqual([["First", "Second", "Third"], ["Other"]]);
  });

  it("commit applies two rows for one profile in order (the later row wins)", async () => {
    const order: string[] = [];
    install({
      tables: {
        profiles: [{ id: "p1", full_name: "Old", email: null, phone: null, member_number: "1" }],
        ...rowsOf(
          { rowNumber: 2, fullName: "First Pass", email: null, phone: null, memberNumber: "1", householdName: null, action: "update", reason: null },
          { rowNumber: 3, fullName: "Second Pass", email: null, phone: null, memberNumber: "1", householdName: null, action: "update", reason: null },
        ),
      },
    });
    const result = await commitPeopleHouseholdImportBatch(input);
    for (const o of ops) {
      if (o.table === "profiles" && o.op === "update") order.push((o.payload as { full_name: string }).full_name);
    }
    expect(result).toMatchObject({ updated: 2, failed: 0 });
    expect(order).toEqual(["First Pass", "Second Pass"]);
  });

  it("a failed bulk household insert is logged with the church and count, then households are created one at a time before updates", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    install({
      tables: rowsOf({ rowNumber: 2, fullName: "New Person", email: null, phone: null, memberNumber: null, householdName: "Smith", action: "create", reason: null }),
    });
    // The bulk family insert (an array payload) is refused; the serial path inserts one object.
    const client = await hoisted.createTenantServerClient();
    const realFrom = client.from.bind(client);
    client.from = (table: string) => {
      const builder = realFrom(table) as Record<string, unknown>;
      if (table !== "families") return builder;
      return new Proxy(builder, {
        get(target, prop: string) {
          if (prop === "insert") {
            return (payload: unknown) => {
              if (Array.isArray(payload)) {
                return { select: () => Promise.resolve({ data: null, error: { message: "boom" } }) };
              }
              ops.push({ table: "families", op: "insert-serial", payload, filters: [], selected: true });
              return { select: () => ({ single: () => Promise.resolve({ data: { id: "fam-1" }, error: null }) }) };
            };
          }
          return (target as Record<string, unknown>)[prop];
        },
      });
    };
    hoisted.createTenantServerClient.mockResolvedValue(client);

    const result = await commitPeopleHouseholdImportBatch(input);

    expect(errors).toHaveBeenCalledWith(expect.stringContaining("bulk household insert failed"), { churchId: "church-1", households: 1 });
    expect(ops.some((o) => o.op === "insert-serial" && o.table === "families")).toBe(true);
    expect(result).toMatchObject({ created: 1, failed: 0 });
    errors.mockRestore();
  });
});
