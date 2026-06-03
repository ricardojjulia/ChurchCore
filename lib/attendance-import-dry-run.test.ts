import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { queryTenantLocalDbMock, shouldUseLocalTenantFallbackMock } = vi.hoisted(() => {
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn(() => true);
  return {
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
  };
});

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: vi.fn(),
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

import {
  commitAttendanceImportBatch,
  runAttendanceImportDryRun,
} from "@/lib/attendance-import-dry-run";

// Helpers
function makeCsv(rows: Record<string, string>[]) {
  if (rows.length === 0) return "id,email,event_id,checked_in_at,status";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => row[h] ?? "").join(","));
  }
  return lines.join("\n");
}

const CHURCH_ID = "church-1";
const ACTOR_PROFILE_ID = "actor-1";
const BATCH_ID = "batch-uuid-1";

const VALID_ATTENDANCE = {
  id: "ATT-100",
  email: "jane@example.com",
  event_id: "EVT-001",
  checked_in_at: "2026-07-06T10:00:00Z",
  status: "present",
};

// Default: no existing records
function setupDefaultMocks({
  existingAttendance = [] as { id: string; source_id: string }[],
  existingProfiles = [] as { id: string; email: string }[],
  existingEvents = [] as { id: string; source_id: string }[],
  existingPresentPairs = [] as { profile_id: string; event_id: string }[],
  batchId = BATCH_ID,
} = {}) {
  queryTenantLocalDbMock.mockImplementation(async (sql: string) => {
    // Load existing attendance index
    if (
      sql.includes("from public.attendance") &&
      sql.includes("source_id is not null") &&
      !sql.includes("limit 1") &&
      !sql.includes("status = 'present'")
    ) {
      return { rows: existingAttendance };
    }
    // Load existing present pairs
    if (sql.includes("from public.attendance") && sql.includes("status = 'present'") && !sql.includes("limit 1")) {
      return { rows: existingPresentPairs };
    }
    // Load profiles index
    if (sql.includes("from public.profiles") && sql.includes("email is not null")) {
      return { rows: existingProfiles };
    }
    // Load events index
    if (
      sql.includes("from public.events") &&
      sql.includes("source_id is not null") &&
      !sql.includes("limit 1")
    ) {
      return { rows: existingEvents };
    }
    // Insert import_batches
    if (sql.includes("insert into public.import_batches")) {
      return { rows: [{ id: batchId }] };
    }
    // Insert import_batch_rows
    if (sql.includes("insert into public.import_batch_rows")) {
      return { rows: [] };
    }
    // Load batch for commit
    if (sql.includes("from public.import_batches") && sql.includes("limit 1")) {
      return { rows: [{ status: "dry_run_completed", dry_run: true }] };
    }
    // Load rows for commit
    if (sql.includes("from public.import_batch_rows")) {
      return { rows: [] };
    }
    // Update import_batches
    if (sql.includes("update public.import_batches")) {
      return { rows: [] };
    }
    // Check existing attendance for commit
    if (sql.includes("from public.attendance") && sql.includes("limit 1")) {
      return { rows: [] };
    }
    // Insert attendance
    if (sql.includes("insert into public.attendance")) {
      return { rows: [{ id: "new-att-1" }] };
    }
    // Update attendance
    if (sql.includes("update public.attendance")) {
      return { rows: [] };
    }
    return { rows: [] };
  });
}

describe("runAttendanceImportDryRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    setupDefaultMocks();
  });

  it("classifies a new sourceId as create", async () => {
    const result = await runAttendanceImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "attendance.csv",
      csvText: makeCsv([VALID_ATTENDANCE]),
    });

    expect(result.counts.create).toBe(1);
    expect(result.counts.update).toBe(0);
    expect(result.rows[0]?.action).toBe("create");
    expect(result.rows[0]?.sourceId).toBe("ATT-100");
  });

  it("classifies an existing sourceId as update", async () => {
    setupDefaultMocks({
      existingAttendance: [{ id: "existing-att-1", source_id: "ATT-100" }],
    });

    const result = await runAttendanceImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "attendance.csv",
      csvText: makeCsv([VALID_ATTENDANCE]),
    });

    expect(result.counts.update).toBe(1);
    expect(result.counts.create).toBe(0);
    expect(result.rows[0]?.action).toBe("update");
  });

  it("rejects row with invalid status value", async () => {
    const result = await runAttendanceImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "attendance.csv",
      csvText: makeCsv([{ id: "A-1", email: "x@example.com", status: "unknown_status" }]),
    });

    expect(result.counts.reject).toBe(1);
    expect(result.rows[0]?.action).toBe("reject");
    expect(result.rows[0]?.reason).toBe("Invalid status value.");
  });

  it("rejects row with non-ISO checkedInAt", async () => {
    const result = await runAttendanceImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "attendance.csv",
      csvText: makeCsv([
        { id: "A-1", email: "x@example.com", checked_in_at: "July 1 2026", status: "present" },
      ]),
    });

    expect(result.counts.reject).toBe(1);
    expect(result.rows[0]?.action).toBe("reject");
    expect(result.rows[0]?.reason).toBe("Invalid checked_in_at — ISO 8601 required.");
  });

  it("skips a duplicate sourceId in the same file", async () => {
    const result = await runAttendanceImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "attendance.csv",
      csvText:
        "id,email,status\n" +
        "A-1,jane@example.com,present\n" +
        "A-1,bob@example.com,present",
    });

    expect(result.counts.create).toBe(1);
    expect(result.counts.skip).toBe(1);
    expect(result.rows[0]?.action).toBe("create");
    expect(result.rows[1]?.action).toBe("skip");
    expect(result.rows[1]?.reason).toBe("Duplicate source ID in import file.");
  });

  it("skips in-file present dup when both profile and event resolve", async () => {
    setupDefaultMocks({
      existingProfiles: [{ id: "profile-1", email: "jane@example.com" }],
      existingEvents: [{ id: "event-1", source_id: "EVT-001" }],
    });

    const result = await runAttendanceImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "attendance.csv",
      csvText:
        "id,email,event_id,status\n" +
        "A-1,jane@example.com,EVT-001,present\n" +
        "A-2,jane@example.com,EVT-001,present",
    });

    expect(result.counts.create).toBe(1);
    expect(result.counts.skip).toBe(1);
    expect(result.rows[0]?.action).toBe("create");
    expect(result.rows[1]?.action).toBe("skip");
    expect(result.rows[1]?.reason).toBe(
      "Duplicate present attendance for this profile and event in import file.",
    );
  });

  it("skips when DB already has a present pair for that profile+event", async () => {
    setupDefaultMocks({
      existingProfiles: [{ id: "profile-1", email: "jane@example.com" }],
      existingEvents: [{ id: "event-1", source_id: "EVT-001" }],
      existingPresentPairs: [{ profile_id: "profile-1", event_id: "event-1" }],
    });

    const result = await runAttendanceImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "attendance.csv",
      csvText: makeCsv([{ id: "A-NEW", email: "jane@example.com", event_id: "EVT-001", status: "present" }]),
    });

    expect(result.counts.skip).toBe(1);
    expect(result.rows[0]?.action).toBe("skip");
    expect(result.rows[0]?.reason).toBe(
      "Duplicate present attendance for this profile and event.",
    );
  });

  it("does NOT skip DB present dup when sourceId already exists in attendance (update path)", async () => {
    setupDefaultMocks({
      existingAttendance: [{ id: "att-existing", source_id: "A-100" }],
      existingProfiles: [{ id: "profile-1", email: "jane@example.com" }],
      existingEvents: [{ id: "event-1", source_id: "EVT-001" }],
      existingPresentPairs: [{ profile_id: "profile-1", event_id: "event-1" }],
    });

    const result = await runAttendanceImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "attendance.csv",
      csvText: makeCsv([{ id: "A-100", email: "jane@example.com", event_id: "EVT-001", status: "present" }]),
    });

    // Should be update, not skip, because sourceId is in attendance index
    expect(result.counts.update).toBe(1);
    expect(result.rows[0]?.action).toBe("update");
  });

  it("sets profileResolved=false and appends warning when profile unmatched", async () => {
    const result = await runAttendanceImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "attendance.csv",
      csvText: makeCsv([{ id: "A-1", email: "unknown@example.com", status: "present" }]),
    });

    expect(result.counts.create).toBe(1);
    expect(result.counts.unmatchedProfiles).toBe(1);
    expect(result.rows[0]?.action).toBe("create");
    expect(result.rows[0]?.profileResolved).toBe(false);
    expect(result.rows[0]?.reason).toContain("Profile not matched — profile_id will be unset.");
  });

  it("sets eventResolved=false and appends warning when event unmatched", async () => {
    const result = await runAttendanceImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "attendance.csv",
      csvText: makeCsv([{ id: "A-1", event_id: "NO-SUCH-EVT", status: "present" }]),
    });

    expect(result.counts.create).toBe(1);
    expect(result.counts.unmatchedEvents).toBe(1);
    expect(result.rows[0]?.action).toBe("create");
    expect(result.rows[0]?.eventResolved).toBe(false);
    expect(result.rows[0]?.reason).toContain("Event not matched — event_id will be unset.");
  });

  it("sets profileResolved=true and eventResolved=true when both match, reason null", async () => {
    setupDefaultMocks({
      existingProfiles: [{ id: "profile-1", email: "jane@example.com" }],
      existingEvents: [{ id: "event-1", source_id: "EVT-001" }],
    });

    const result = await runAttendanceImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "attendance.csv",
      csvText: makeCsv([
        { id: "A-1", email: "jane@example.com", event_id: "EVT-001", status: "present" },
      ]),
    });

    expect(result.rows[0]?.profileResolved).toBe(true);
    expect(result.rows[0]?.eventResolved).toBe(true);
    expect(result.rows[0]?.reason).toBeNull();
  });

  it("auto-generates ATT-1 and ATT-2 when no id column", async () => {
    const result = await runAttendanceImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "attendance.csv",
      csvText: "email,status\njane@example.com,present\nbob@example.com,absent",
    });

    expect(result.rows[0]?.sourceId).toBe("ATT-1");
    expect(result.rows[1]?.sourceId).toBe("ATT-2");
  });

  it("throws on empty CSV and does not insert a batch", async () => {
    await expect(
      runAttendanceImportDryRun({
        churchId: CHURCH_ID,
        actorProfileId: ACTOR_PROFILE_ID,
        sourceSystem: "generic_csv",
        sourceFilename: "attendance.csv",
        csvText: "id,email,event_id,checked_in_at,status",
      }),
    ).rejects.toThrow("CSV file has no data rows.");

    const insertBatchCalls = queryTenantLocalDbMock.mock.calls.filter(
      ([sql]: [string]) => typeof sql === "string" && sql.includes("insert into public.import_batches"),
    );
    expect(insertBatchCalls).toHaveLength(0);
  });

  it("returns a batchId on success", async () => {
    const result = await runAttendanceImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "attendance.csv",
      csvText: makeCsv([VALID_ATTENDANCE]),
    });

    expect(result.batchId).toBe(BATCH_ID);
  });

  it("allows null status (defaults to present in commit)", async () => {
    const result = await runAttendanceImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "attendance.csv",
      csvText: makeCsv([{ id: "A-1", email: "x@example.com" }]),
    });

    expect(result.counts.create).toBe(1);
    expect(result.rows[0]?.action).toBe("create");
  });

  it("allows valid statuses: present, absent, excused", async () => {
    const result = await runAttendanceImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "attendance.csv",
      csvText:
        "id,status\n" +
        "A-1,present\n" +
        "A-2,absent\n" +
        "A-3,excused",
    });

    expect(result.counts.create).toBe(3);
    expect(result.counts.reject).toBe(0);
  });
});

describe("commitAttendanceImportBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
  });

  it("happy path: create and update rows are upserted, skip/reject rows ignored", async () => {
    const createPayload = {
      sourceId: "A-1",
      profileEmail: "jane@example.com",
      eventSourceId: "EVT-001",
      checkedInAt: "2026-07-01T10:00:00Z",
      status: "present",
      profileId: "profile-1",
      eventId: "event-1",
    };
    const updatePayload = {
      sourceId: "A-2",
      profileEmail: "bob@example.com",
      eventSourceId: "EVT-002",
      checkedInAt: "2026-07-02T10:00:00Z",
      status: "absent",
      profileId: "profile-2",
      eventId: "event-2",
    };

    queryTenantLocalDbMock.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("from public.import_batches") && sql.includes("limit 1")) {
        return { rows: [{ status: "dry_run_completed", dry_run: true }] };
      }
      if (sql.includes("from public.import_batch_rows")) {
        return {
          rows: [
            { normalized_payload: createPayload },
            { normalized_payload: updatePayload },
          ],
        };
      }
      if (sql.includes("from public.attendance") && sql.includes("limit 1")) {
        const sourceId = (params as string[])[1];
        if (sourceId === "A-2") {
          return { rows: [{ id: "existing-att-2" }] };
        }
        return { rows: [] };
      }
      if (sql.includes("insert into public.attendance")) {
        return { rows: [{ id: "new-att-1" }] };
      }
      if (sql.includes("update public.attendance")) {
        return { rows: [] };
      }
      if (sql.includes("update public.import_batches")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await commitAttendanceImportBatch({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      batchId: BATCH_ID,
    });

    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.status).toBe("committed");
    expect(result.batchId).toBe(BATCH_ID);
  });

  it("uses check_in_method='import' in INSERT", async () => {
    const insertedSqls: string[] = [];

    queryTenantLocalDbMock.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.import_batches") && sql.includes("limit 1")) {
        return { rows: [{ status: "dry_run_completed", dry_run: true }] };
      }
      if (sql.includes("from public.import_batch_rows")) {
        return {
          rows: [
            {
              normalized_payload: {
                sourceId: "A-1",
                profileEmail: null,
                eventSourceId: null,
                checkedInAt: "2026-07-01T10:00:00Z",
                status: "present",
                profileId: null,
                eventId: null,
              },
            },
          ],
        };
      }
      if (sql.includes("from public.attendance") && sql.includes("limit 1")) {
        return { rows: [] };
      }
      if (sql.includes("insert into public.attendance")) {
        insertedSqls.push(sql);
        return { rows: [{ id: "new-att-1" }] };
      }
      if (sql.includes("update public.import_batches")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    await commitAttendanceImportBatch({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      batchId: BATCH_ID,
    });

    expect(insertedSqls[0]).toContain("'import'");
  });

  it("defaults status to 'present' when absent", async () => {
    const insertedParams: unknown[][] = [];

    queryTenantLocalDbMock.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("from public.import_batches") && sql.includes("limit 1")) {
        return { rows: [{ status: "dry_run_completed", dry_run: true }] };
      }
      if (sql.includes("from public.import_batch_rows")) {
        return {
          rows: [
            {
              normalized_payload: {
                sourceId: "A-1",
                profileEmail: null,
                eventSourceId: null,
                checkedInAt: null,
                status: null,
                profileId: null,
                eventId: null,
              },
            },
          ],
        };
      }
      if (sql.includes("from public.attendance") && sql.includes("limit 1")) {
        return { rows: [] };
      }
      if (sql.includes("insert into public.attendance")) {
        insertedParams.push(params);
        return { rows: [{ id: "new-att-1" }] };
      }
      if (sql.includes("update public.import_batches")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    await commitAttendanceImportBatch({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      batchId: BATCH_ID,
    });

    // status param (index 5) should be 'present'
    expect(insertedParams[0]?.[5]).toBe("present");
  });

  it("checkedInAt defaults to now() in SQL when null", async () => {
    const insertedSqls: string[] = [];

    queryTenantLocalDbMock.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.import_batches") && sql.includes("limit 1")) {
        return { rows: [{ status: "dry_run_completed", dry_run: true }] };
      }
      if (sql.includes("from public.import_batch_rows")) {
        return {
          rows: [
            {
              normalized_payload: {
                sourceId: "A-1",
                profileEmail: null,
                eventSourceId: null,
                checkedInAt: null,
                status: "present",
                profileId: null,
                eventId: null,
              },
            },
          ],
        };
      }
      if (sql.includes("from public.attendance") && sql.includes("limit 1")) {
        return { rows: [] };
      }
      if (sql.includes("insert into public.attendance")) {
        insertedSqls.push(sql);
        return { rows: [{ id: "new-att-1" }] };
      }
      if (sql.includes("update public.import_batches")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    await commitAttendanceImportBatch({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      batchId: BATCH_ID,
    });

    // The SQL should use coalesce($5::timestamptz, now()) not a hardcoded JS date
    expect(insertedSqls[0]).toContain("coalesce($5::timestamptz, now())");
  });

  it("rejects batch with wrong status", async () => {
    queryTenantLocalDbMock.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.import_batches") && sql.includes("limit 1")) {
        return { rows: [{ status: "committed", dry_run: false }] };
      }
      return { rows: [] };
    });

    await expect(
      commitAttendanceImportBatch({
        churchId: CHURCH_ID,
        actorProfileId: ACTOR_PROFILE_ID,
        batchId: BATCH_ID,
      }),
    ).rejects.toThrow("Only dry-run-completed batches can be committed.");
  });

  it("throws Import batch not found when church_id does not match", async () => {
    queryTenantLocalDbMock.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.import_batches") && sql.includes("limit 1")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    await expect(
      commitAttendanceImportBatch({
        churchId: "other-church",
        actorProfileId: ACTOR_PROFILE_ID,
        batchId: BATCH_ID,
      }),
    ).rejects.toThrow("Import batch not found.");
  });

  it("marks batch as committed when all rows succeed", async () => {
    queryTenantLocalDbMock.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.import_batches") && sql.includes("limit 1")) {
        return { rows: [{ status: "dry_run_completed", dry_run: true }] };
      }
      if (sql.includes("from public.import_batch_rows")) {
        return {
          rows: [
            {
              normalized_payload: {
                sourceId: "A-1",
                profileEmail: null,
                eventSourceId: null,
                checkedInAt: "2026-07-01T10:00:00Z",
                status: "present",
                profileId: null,
                eventId: null,
              },
            },
          ],
        };
      }
      if (sql.includes("from public.attendance") && sql.includes("limit 1")) {
        return { rows: [] };
      }
      if (sql.includes("insert into public.attendance")) {
        return { rows: [{ id: "new-att" }] };
      }
      if (sql.includes("update public.import_batches")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await commitAttendanceImportBatch({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      batchId: BATCH_ID,
    });

    expect(result.status).toBe("committed");

    const updateCall = queryTenantLocalDbMock.mock.calls.find(
      ([sql]: [string]) => typeof sql === "string" && sql.includes("update public.import_batches"),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall?.[1]).toContain("committed");
  });
});
