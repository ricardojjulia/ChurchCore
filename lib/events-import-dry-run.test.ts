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
  commitEventsImportBatch,
  runEventsImportDryRun,
} from "@/lib/events-import-dry-run";

// Helpers
function makeCsv(rows: Record<string, string>[]) {
  if (rows.length === 0) return "id,title,starts_at,ends_at";
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

const VALID_EVENT = {
  id: "E-100",
  title: "Sunday Service",
  starts_at: "2026-07-06T10:00:00Z",
  ends_at: "2026-07-06T12:00:00Z",
};

// Default: no existing events, no existing ministries
function setupDefaultMocks({
  existingEvents = [] as { id: string; source_id: string }[],
  existingMinistries = [] as { id: string; name: string }[],
  batchId = BATCH_ID,
} = {}) {
  queryTenantLocalDbMock.mockImplementation(
    async (sql: string) => {
      // Load existing events
      if (
        sql.includes("from public.events") &&
        sql.includes("source_id is not null") &&
        !sql.includes("limit 1")
      ) {
        return { rows: existingEvents };
      }
      // Load existing ministries
      if (sql.includes("from public.ministries")) {
        return { rows: existingMinistries };
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
        return {
          rows: [{ status: "dry_run_completed", dry_run: true }],
        };
      }
      // Load rows for commit
      if (sql.includes("from public.import_batch_rows")) {
        return { rows: [] };
      }
      // Update import_batches
      if (sql.includes("update public.import_batches")) {
        return { rows: [] };
      }
      // Check existing event for commit (SELECT id FROM events WHERE source_id)
      if (sql.includes("from public.events") && sql.includes("limit 1")) {
        return { rows: [] };
      }
      // Insert event
      if (sql.includes("insert into public.events")) {
        return { rows: [{ id: "new-event-1" }] };
      }
      // Update event
      if (sql.includes("update public.events")) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  );
}

describe("runEventsImportDryRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    setupDefaultMocks();
  });

  it("classifies a new sourceId as create", async () => {
    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "events.csv",
      csvText: makeCsv([VALID_EVENT]),
    });

    expect(result.counts.create).toBe(1);
    expect(result.counts.update).toBe(0);
    expect(result.rows[0]?.action).toBe("create");
    expect(result.rows[0]?.sourceId).toBe("E-100");
  });

  it("classifies an existing sourceId as update", async () => {
    setupDefaultMocks({
      existingEvents: [{ id: "existing-event-1", source_id: "E-100" }],
    });

    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "events.csv",
      csvText: makeCsv([VALID_EVENT]),
    });

    expect(result.counts.update).toBe(1);
    expect(result.counts.create).toBe(0);
    expect(result.rows[0]?.action).toBe("update");
  });

  it("rejects row with missing title", async () => {
    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "events.csv",
      csvText: makeCsv([{ id: "E-1", title: "", starts_at: "2026-07-01T10:00:00Z", ends_at: "2026-07-01T12:00:00Z" }]),
    });

    expect(result.counts.reject).toBe(1);
    expect(result.rows[0]?.action).toBe("reject");
    expect(result.rows[0]?.reason).toBe("Missing event title.");
  });

  it("rejects row with missing starts_at", async () => {
    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "events.csv",
      csvText: makeCsv([{ id: "E-1", title: "Event", starts_at: "", ends_at: "2026-07-01T12:00:00Z" }]),
    });

    expect(result.counts.reject).toBe(1);
    expect(result.rows[0]?.action).toBe("reject");
    expect(result.rows[0]?.reason).toBe("Missing or invalid starts_at — ISO 8601 required.");
  });

  it("rejects row with non-ISO starts_at", async () => {
    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "events.csv",
      csvText: makeCsv([{ id: "E-1", title: "Event", starts_at: "July 1 2026", ends_at: "2026-07-01T12:00:00Z" }]),
    });

    expect(result.counts.reject).toBe(1);
    expect(result.rows[0]?.action).toBe("reject");
    expect(result.rows[0]?.reason).toBe("Missing or invalid starts_at — ISO 8601 required.");
  });

  it("rejects row with missing ends_at", async () => {
    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "events.csv",
      csvText: makeCsv([{ id: "E-1", title: "Event", starts_at: "2026-07-01T10:00:00Z", ends_at: "" }]),
    });

    expect(result.counts.reject).toBe(1);
    expect(result.rows[0]?.action).toBe("reject");
    expect(result.rows[0]?.reason).toBe("Missing or invalid ends_at — ISO 8601 required.");
  });

  it("rejects row where ends_at equals starts_at", async () => {
    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "events.csv",
      csvText: makeCsv([{ id: "E-1", title: "Event", starts_at: "2026-07-01T10:00:00Z", ends_at: "2026-07-01T10:00:00Z" }]),
    });

    expect(result.counts.reject).toBe(1);
    expect(result.rows[0]?.action).toBe("reject");
    expect(result.rows[0]?.reason).toBe("ends_at must be after starts_at.");
  });

  it("rejects row where ends_at is before starts_at", async () => {
    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "events.csv",
      csvText: makeCsv([{ id: "E-1", title: "Event", starts_at: "2026-07-01T12:00:00Z", ends_at: "2026-07-01T10:00:00Z" }]),
    });

    expect(result.counts.reject).toBe(1);
    expect(result.rows[0]?.action).toBe("reject");
    expect(result.rows[0]?.reason).toBe("ends_at must be after starts_at.");
  });

  it("rejects row with invalid approval_status value", async () => {
    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "events.csv",
      csvText: makeCsv([{ id: "E-1", title: "Event", starts_at: "2026-07-01T10:00:00Z", ends_at: "2026-07-01T12:00:00Z", status: "published" }]),
    });

    expect(result.counts.reject).toBe(1);
    expect(result.rows[0]?.action).toBe("reject");
    expect(result.rows[0]?.reason).toBe("Invalid approval_status value.");
  });

  it("rejects row with capacity of 0", async () => {
    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "events.csv",
      csvText: makeCsv([{ id: "E-1", title: "Event", starts_at: "2026-07-01T10:00:00Z", ends_at: "2026-07-01T12:00:00Z", capacity: "0" }]),
    });

    expect(result.counts.reject).toBe(1);
    expect(result.rows[0]?.action).toBe("reject");
    expect(result.rows[0]?.reason).toBe("Invalid capacity — must be a positive integer.");
  });

  it("rejects row with non-numeric capacity", async () => {
    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "events.csv",
      csvText: makeCsv([{ id: "E-1", title: "Event", starts_at: "2026-07-01T10:00:00Z", ends_at: "2026-07-01T12:00:00Z", capacity: "unlimited" }]),
    });

    expect(result.counts.reject).toBe(1);
    expect(result.rows[0]?.action).toBe("reject");
    expect(result.rows[0]?.reason).toBe("Invalid capacity — must be a positive integer.");
  });

  it("skips a duplicate sourceId in the same file", async () => {
    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "events.csv",
      csvText:
        "id,title,starts_at,ends_at\n" +
        "E-1,First Event,2026-07-01T10:00:00Z,2026-07-01T12:00:00Z\n" +
        "E-1,Duplicate Event,2026-07-02T10:00:00Z,2026-07-02T12:00:00Z",
    });

    expect(result.counts.create).toBe(1);
    expect(result.counts.skip).toBe(1);
    expect(result.rows[0]?.action).toBe("create");
    expect(result.rows[1]?.action).toBe("skip");
    expect(result.rows[1]?.reason).toBe("Duplicate source ID in import file.");
  });

  it("sets ministryResolved = false and appends warning when ministry is unmatched", async () => {
    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "events.csv",
      csvText: makeCsv([{ id: "E-1", title: "Service", starts_at: "2026-07-01T10:00:00Z", ends_at: "2026-07-01T12:00:00Z", ministry: "Unknown Ministry" }]),
    });

    expect(result.counts.create).toBe(1);
    expect(result.counts.unmatchedMinistries).toBe(1);
    expect(result.rows[0]?.action).toBe("create");
    expect(result.rows[0]?.ministryResolved).toBe(false);
    expect(result.rows[0]?.reason).toContain("Ministry not matched — ministry_id will be unset.");
  });

  it("sets ministryResolved = true when ministry name is matched", async () => {
    setupDefaultMocks({
      existingMinistries: [{ id: "ministry-worship", name: "Worship" }],
    });

    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "events.csv",
      csvText: makeCsv([{ id: "E-1", title: "Service", starts_at: "2026-07-01T10:00:00Z", ends_at: "2026-07-01T12:00:00Z", ministry: "Worship" }]),
    });

    expect(result.rows[0]?.ministryResolved).toBe(true);
    expect(result.rows[0]?.reason).toBeNull();
  });

  it("matches ministry case-insensitively", async () => {
    setupDefaultMocks({
      existingMinistries: [{ id: "ministry-worship", name: "Worship" }],
    });

    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "events.csv",
      csvText: makeCsv([{ id: "E-1", title: "Service", starts_at: "2026-07-01T10:00:00Z", ends_at: "2026-07-01T12:00:00Z", ministry: "WORSHIP" }]),
    });

    expect(result.rows[0]?.ministryResolved).toBe(true);
  });

  it("auto-generates EVT-1 and EVT-2 when no id column", async () => {
    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "events.csv",
      csvText: "title,starts_at,ends_at\nAlpha Event,2026-07-01T10:00:00Z,2026-07-01T12:00:00Z\nBeta Event,2026-07-02T10:00:00Z,2026-07-02T12:00:00Z",
    });

    expect(result.rows[0]?.sourceId).toBe("EVT-1");
    expect(result.rows[1]?.sourceId).toBe("EVT-2");
  });

  it("throws on empty CSV and does not insert a batch", async () => {
    await expect(
      runEventsImportDryRun({
        churchId: CHURCH_ID,
        actorProfileId: ACTOR_PROFILE_ID,
        sourceSystem: "generic_csv",
        sourceFilename: "events.csv",
        csvText: "id,title,starts_at,ends_at",
      }),
    ).rejects.toThrow("CSV file has no data rows.");

    const insertBatchCalls = queryTenantLocalDbMock.mock.calls.filter(
      ([sql]: [string]) => typeof sql === "string" && sql.includes("insert into public.import_batches"),
    );
    expect(insertBatchCalls).toHaveLength(0);
  });

  it("returns a batchId on success", async () => {
    const result = await runEventsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "events.csv",
      csvText: makeCsv([VALID_EVENT]),
    });

    expect(result.batchId).toBe(BATCH_ID);
  });
});

describe("commitEventsImportBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
  });

  it("happy path: create and update rows are upserted, skip/reject rows ignored", async () => {
    const createPayload = {
      sourceId: "E-1",
      title: "New Event",
      description: null,
      location: null,
      startsAt: "2026-07-01T10:00:00Z",
      endsAt: "2026-07-01T12:00:00Z",
      capacity: null,
      ministryName: null,
      approvalStatus: null,
      ministryId: null,
    };
    const updatePayload = {
      sourceId: "E-2",
      title: "Existing Event Updated",
      description: "Updated desc",
      location: "Main Hall",
      startsAt: "2026-07-02T10:00:00Z",
      endsAt: "2026-07-02T12:00:00Z",
      capacity: 100,
      ministryName: "Worship",
      approvalStatus: "approved",
      ministryId: "ministry-worship",
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
      if (sql.includes("from public.events") && sql.includes("limit 1")) {
        // E-1 doesn't exist, E-2 does
        const sourceId = (params as string[])[1];
        if (sourceId === "E-2") {
          return { rows: [{ id: "existing-event-2" }] };
        }
        return { rows: [] };
      }
      if (sql.includes("insert into public.events")) {
        return { rows: [{ id: "new-event-1" }] };
      }
      if (sql.includes("update public.events")) {
        return { rows: [] };
      }
      if (sql.includes("update public.import_batches")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await commitEventsImportBatch({
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

  it("rejects batch with wrong status", async () => {
    queryTenantLocalDbMock.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.import_batches") && sql.includes("limit 1")) {
        return { rows: [{ status: "committed", dry_run: false }] };
      }
      return { rows: [] };
    });

    await expect(
      commitEventsImportBatch({
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
      commitEventsImportBatch({
        churchId: "other-church",
        actorProfileId: ACTOR_PROFILE_ID,
        batchId: BATCH_ID,
      }),
    ).rejects.toThrow("Import batch not found.");
  });

  it("defaults approval_status to 'draft' when absent", async () => {
    const payload = {
      sourceId: "E-1",
      title: "Event",
      description: null,
      location: null,
      startsAt: "2026-07-01T10:00:00Z",
      endsAt: "2026-07-01T12:00:00Z",
      capacity: null,
      ministryName: null,
      approvalStatus: null,
      ministryId: null,
    };

    const insertedParams: unknown[][] = [];

    queryTenantLocalDbMock.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes("from public.import_batches") && sql.includes("limit 1")) {
        return { rows: [{ status: "dry_run_completed", dry_run: true }] };
      }
      if (sql.includes("from public.import_batch_rows")) {
        return { rows: [{ normalized_payload: payload }] };
      }
      if (sql.includes("from public.events") && sql.includes("limit 1")) {
        return { rows: [] };
      }
      if (sql.includes("insert into public.events")) {
        insertedParams.push(params);
        return { rows: [{ id: "new-event-1" }] };
      }
      if (sql.includes("update public.import_batches")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    await commitEventsImportBatch({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      batchId: BATCH_ID,
    });

    // approval_status is the 10th param (index 9) in the INSERT
    expect(insertedParams[0]?.[9]).toBe("draft");
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
                sourceId: "E-1",
                title: "Event",
                description: null,
                location: null,
                startsAt: "2026-07-01T10:00:00Z",
                endsAt: "2026-07-01T12:00:00Z",
                capacity: null,
                ministryName: null,
                approvalStatus: null,
                ministryId: null,
              },
            },
          ],
        };
      }
      if (sql.includes("from public.events") && sql.includes("limit 1")) {
        return { rows: [] };
      }
      if (sql.includes("insert into public.events")) {
        return { rows: [{ id: "new-event" }] };
      }
      if (sql.includes("update public.import_batches")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await commitEventsImportBatch({
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
