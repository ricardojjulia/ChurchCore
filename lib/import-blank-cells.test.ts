import { beforeEach, describe, expect, it, vi } from "vitest";

// G4.1: a blank cell on a re-import never erases what the church already has.
// Runs the real commit paths against a recording Supabase stand-in.

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

import { commitAttendanceImportBatch } from "@/lib/attendance-import-dry-run";
import { commitEventsImportBatch } from "@/lib/events-import-dry-run";
import { commitGivingImportBatch } from "@/lib/giving-import-dry-run";
import { commitGroupsImportBatch } from "@/lib/groups-import-dry-run";
import { commitPeopleHouseholdImportBatch } from "@/lib/people-import-dry-run";

type Op = { table: string; op: string; payload?: Record<string, unknown> };
let ops: Op[];

function install(tables: Record<string, unknown>, existingId: string | null = null) {
  ops = [];
  hoisted.createTenantServerClient.mockResolvedValue({
    from(table: string) {
      const state: { op: string; payload?: Record<string, unknown>; single: boolean } = { op: "select", single: false };
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "then") {
              return (resolve: (v: unknown) => unknown, reject: (r: unknown) => unknown) => {
                ops.push({ table, op: state.op, payload: state.payload });
                let data: unknown = null;
                if (state.op === "update") {
                  data = [{ id: "row-1" }];
                } else if (state.op === "select") {
                  data = tables[table] ?? (state.single ? (existingId ? { id: existingId } : null) : []);
                  if (state.single && table !== "import_batches" && Array.isArray(data)) data = existingId ? { id: existingId } : null;
                }
                return Promise.resolve({ data, error: null }).then(resolve, reject);
              };
            }
            return (...args: unknown[]) => {
              if (prop === "insert" || prop === "update") {
                state.op = prop;
                state.payload = args[0] as Record<string, unknown>;
              }
              if (prop === "maybeSingle" || prop === "single") state.single = true;
              return builder;
            };
          },
        },
      );
      return builder;
    },
  });
}

const batch = { status: "dry_run_completed", dry_run: true };
const update = (table: string) => ops.find((o) => o.table === table && o.op === "update" && o.payload && !("dry_run" in o.payload));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("blank cells on update", () => {
  it("people: a blank email, phone and household keep the stored values", async () => {
    install({
      import_batches: batch,
      import_batch_rows: [
        { normalized_payload: { rowNumber: 2, fullName: "Maria Santos", email: null, phone: null, memberNumber: "5001", householdName: null, action: "update", reason: null } },
      ],
      profiles: [{ id: "p1", full_name: "Maria Santos", email: "maria@example.org", phone: "5550100", member_number: "5001" }],
      families: [],
    });
    const result = await commitPeopleHouseholdImportBatch({ churchId: "c1", actorProfileId: null, batchId: "b1" });
    expect(result).toMatchObject({ updated: 1, failed: 0 });
    const payload = update("profiles")?.payload;
    expect(payload).toEqual({ full_name: "Maria Santos", member_number: "5001" });
    expect(payload).not.toHaveProperty("email");
    expect(payload).not.toHaveProperty("phone");
    expect(payload).not.toHaveProperty("family_id");
  });

  it("people: a provided email and phone still update", async () => {
    install({
      import_batches: batch,
      import_batch_rows: [
        { normalized_payload: { rowNumber: 2, fullName: "Ada Lovelace", email: "new@example.org", phone: "5551234", memberNumber: "90001", householdName: null, action: "update", reason: null } },
      ],
      profiles: [{ id: "p1", full_name: "Ada Lovelace", email: "old@example.org", phone: "1", member_number: "90001" }],
      families: [],
    });
    await commitPeopleHouseholdImportBatch({ churchId: "c1", actorProfileId: null, batchId: "b1" });
    expect(update("profiles")?.payload).toMatchObject({ email: "new@example.org", phone: "5551234" });
  });

  it("giving: a blank note, fund and unmatched donor keep the stored values", async () => {
    install({ import_batches: batch, import_batch_rows: [{ normalized_payload: { sourceId: "G1", amountCents: 500, isRecurring: false, isAnonymous: true } }] }, "d1");
    await commitGivingImportBatch({ churchId: "c1", actorProfileId: null, batchId: "b1" });
    const payload = update("donations")?.payload ?? {};
    expect(payload).toMatchObject({ amount_cents: 500 });
    // R7: an update never touches status, and leaves the recurring flag alone when the cell is blank.
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("is_recurring");
    for (const key of ["note", "fund_designation", "profile_id", "donor_email"]) expect(payload).not.toHaveProperty(key);
  });

  it("groups: a blank description, category and leader keep the stored values", async () => {
    install({ import_batches: batch, import_batch_rows: [{ normalized_payload: { sourceId: "G1", name: "Study", isActive: true } }] }, "g1");
    await commitGroupsImportBatch({ churchId: "c1", actorProfileId: null, batchId: "b1" });
    const payload = update("groups")?.payload ?? {};
    expect(payload).toMatchObject({ name: "Study" });
    for (const key of ["description", "category", "leader_profile_id"]) expect(payload).not.toHaveProperty(key);
  });

  it("events: a blank description, location, capacity and ministry keep the stored values", async () => {
    install(
      { import_batches: batch, import_batch_rows: [{ normalized_payload: { sourceId: "E1", title: "Picnic", startsAtInstant: "2026-09-06T17:00:00.000Z", endsAtInstant: "2026-09-06T19:00:00.000Z" } }] },
      "e1",
    );
    await commitEventsImportBatch({ churchId: "c1", actorProfileId: null, batchId: "b1" });
    const payload = update("events")?.payload ?? {};
    expect(payload).toMatchObject({ title: "Picnic" });
    for (const key of ["description", "location", "capacity", "ministry_id"]) expect(payload).not.toHaveProperty(key);
  });

  it("attendance: an unresolved event keeps the stored event", async () => {
    install({ import_batches: batch, profiles: [{ id: "p1" }], import_batch_rows: [{ normalized_payload: { sourceId: "A1", profileId: "p1" } }] }, "a1");
    await commitAttendanceImportBatch({ churchId: "c1", actorProfileId: null, batchId: "b1" });
    const payload = update("attendance")?.payload ?? {};
    expect(payload).toMatchObject({ profile_id: "p1" });
    expect(payload).not.toHaveProperty("event_id");
  });
});
