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
  commitGroupsImportBatch,
  runGroupsImportDryRun,
} from "@/lib/groups-import-dry-run";

// Helpers
function makeCsv(rows: Record<string, string>[]) {
  if (rows.length === 0) return "id,name";
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

// Default: no existing groups, no existing profiles
function setupDefaultMocks({
  existingGroups = [] as { id: string; source_id: string }[],
  existingProfiles = [] as { id: string; email: string }[],
  batchId = BATCH_ID,
} = {}) {
  queryTenantLocalDbMock.mockImplementation(
    async (sql: string) => {
      // Load existing groups
      if (sql.includes("from public.groups") && sql.includes("source_id is not null") && !sql.includes("limit 1")) {
        return { rows: existingGroups };
      }
      // Load existing profiles
      if (sql.includes("from public.profiles") && sql.includes("email is not null")) {
        return { rows: existingProfiles };
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
      // Check existing group for commit (SELECT id FROM groups WHERE source_id)
      if (sql.includes("from public.groups") && sql.includes("limit 1")) {
        return { rows: [] };
      }
      // Insert group
      if (sql.includes("insert into public.groups")) {
        return { rows: [{ id: "new-group-1" }] };
      }
      // Update group
      if (sql.includes("update public.groups")) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  );
}

describe("runGroupsImportDryRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    setupDefaultMocks();
  });

  it("classifies a new sourceId as create", async () => {
    const result = await runGroupsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "groups.csv",
      csvText: makeCsv([{ id: "G-100", name: "Monday Study" }]),
    });

    expect(result.counts.create).toBe(1);
    expect(result.counts.update).toBe(0);
    expect(result.rows[0]?.action).toBe("create");
    expect(result.rows[0]?.sourceId).toBe("G-100");
  });

  it("classifies an existing sourceId as update", async () => {
    setupDefaultMocks({
      existingGroups: [{ id: "existing-group-1", source_id: "G-100" }],
    });

    const result = await runGroupsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "groups.csv",
      csvText: makeCsv([{ id: "G-100", name: "Monday Study Updated" }]),
    });

    expect(result.counts.update).toBe(1);
    expect(result.counts.create).toBe(0);
    expect(result.rows[0]?.action).toBe("update");
  });

  it("rejects row with missing name", async () => {
    const result = await runGroupsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "groups.csv",
      csvText: makeCsv([{ id: "G-1", name: "" }]),
    });

    expect(result.counts.reject).toBe(1);
    expect(result.rows[0]?.action).toBe("reject");
    expect(result.rows[0]?.reason).toBe("Missing group name.");
  });

  it("rejects row with invalid leader email", async () => {
    const result = await runGroupsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "groups.csv",
      csvText: makeCsv([{ id: "G-1", name: "Study Group", leader_email: "not-an-email" }]),
    });

    expect(result.counts.reject).toBe(1);
    expect(result.rows[0]?.action).toBe("reject");
    expect(result.rows[0]?.reason).toBe("Invalid leader email format.");
  });

  it("rejects row with invalid status value", async () => {
    const result = await runGroupsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "groups.csv",
      csvText: makeCsv([{ id: "G-1", name: "Study Group", status: "archived" }]),
    });

    expect(result.counts.reject).toBe(1);
    expect(result.rows[0]?.action).toBe("reject");
    expect(result.rows[0]?.reason).toBe("Invalid status value.");
  });

  it("rejects row with invalid category value", async () => {
    const result = await runGroupsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "groups.csv",
      csvText: makeCsv([{ id: "G-1", name: "Study Group", category: "mystery_category" }]),
    });

    expect(result.counts.reject).toBe(1);
    expect(result.rows[0]?.action).toBe("reject");
    expect(result.rows[0]?.reason).toBe("Invalid category value.");
  });

  it("skips a duplicate sourceId in the same file", async () => {
    const result = await runGroupsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "groups.csv",
      csvText:
        "id,name\nG-1,First Group\nG-1,Duplicate Group",
    });

    expect(result.counts.create).toBe(1);
    expect(result.counts.skip).toBe(1);
    expect(result.rows[0]?.action).toBe("create");
    expect(result.rows[1]?.action).toBe("skip");
    expect(result.rows[1]?.reason).toBe("Duplicate source ID in import file.");
  });

  it("sets leaderResolved = false and appends warning when leader email is unmatched", async () => {
    const result = await runGroupsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "groups.csv",
      csvText: makeCsv([{ id: "G-1", name: "Study Group", leader_email: "unknown@example.com" }]),
    });

    expect(result.counts.create).toBe(1);
    expect(result.counts.unmatchedLeaders).toBe(1);
    expect(result.rows[0]?.action).toBe("create");
    expect(result.rows[0]?.leaderResolved).toBe(false);
    expect(result.rows[0]?.reason).toContain("Leader email not matched — leader will be unset.");
  });

  it("sets leaderResolved = true when leader email is matched", async () => {
    setupDefaultMocks({
      existingProfiles: [{ id: "profile-leader", email: "leader@example.com" }],
    });

    const result = await runGroupsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "groups.csv",
      csvText: makeCsv([{ id: "G-1", name: "Study Group", leader_email: "leader@example.com" }]),
    });

    expect(result.rows[0]?.leaderResolved).toBe(true);
    expect(result.rows[0]?.reason).toBeNull();
  });

  it("auto-generates sourceId GRP-1 and GRP-2 when no id column", async () => {
    const result = await runGroupsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "groups.csv",
      csvText: "name,category\nAlpha Group,general\nBeta Group,general",
    });

    expect(result.rows[0]?.sourceId).toBe("GRP-1");
    expect(result.rows[1]?.sourceId).toBe("GRP-2");
  });

  it("throws on empty CSV and does not insert a batch", async () => {
    await expect(
      runGroupsImportDryRun({
        churchId: CHURCH_ID,
        actorProfileId: ACTOR_PROFILE_ID,
        sourceSystem: "generic_csv",
        sourceFilename: "groups.csv",
        csvText: "id,name",
      }),
    ).rejects.toThrow("CSV file has no data rows.");

    // No insert into import_batches should have been called
    const insertBatchCalls = queryTenantLocalDbMock.mock.calls.filter(
      ([sql]: [string]) => typeof sql === "string" && sql.includes("insert into public.import_batches"),
    );
    expect(insertBatchCalls).toHaveLength(0);
  });

  it("returns a batchId on success", async () => {
    const result = await runGroupsImportDryRun({
      churchId: CHURCH_ID,
      actorProfileId: ACTOR_PROFILE_ID,
      sourceSystem: "generic_csv",
      sourceFilename: "groups.csv",
      csvText: makeCsv([{ id: "G-1", name: "Study Group" }]),
    });

    expect(result.batchId).toBe(BATCH_ID);
  });
});

describe("commitGroupsImportBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
  });

  it("happy path: create and update rows are upserted, skip/reject rows ignored", async () => {
    const createPayload = {
      sourceId: "G-1",
      name: "New Group",
      category: "general",
      description: null,
      leaderEmail: null,
      isActive: true,
      leaderProfileId: null,
    };
    const updatePayload = {
      sourceId: "G-2",
      name: "Existing Group Updated",
      category: "discipleship",
      description: "Updated desc",
      leaderEmail: "leader@example.com",
      isActive: true,
      leaderProfileId: "profile-1",
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
      if (sql.includes("from public.groups") && sql.includes("limit 1")) {
        // G-1 doesn't exist, G-2 does
        const sourceId = (params as string[])[1];
        if (sourceId === "G-2") {
          return { rows: [{ id: "existing-group-2" }] };
        }
        return { rows: [] };
      }
      if (sql.includes("insert into public.groups")) {
        return { rows: [{ id: "new-group-1" }] };
      }
      if (sql.includes("update public.groups")) {
        return { rows: [] };
      }
      if (sql.includes("update public.import_batches")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await commitGroupsImportBatch({
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
      commitGroupsImportBatch({
        churchId: CHURCH_ID,
        actorProfileId: ACTOR_PROFILE_ID,
        batchId: BATCH_ID,
      }),
    ).rejects.toThrow("Only dry-run-completed batches can be committed.");
  });

  it("throws Import batch not found when church_id does not match", async () => {
    queryTenantLocalDbMock.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.import_batches") && sql.includes("limit 1")) {
        return { rows: [] }; // cross-church: batch not found for this church_id
      }
      return { rows: [] };
    });

    await expect(
      commitGroupsImportBatch({
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
                sourceId: "G-1",
                name: "Group",
                category: null,
                description: null,
                leaderEmail: null,
                isActive: true,
                leaderProfileId: null,
              },
            },
          ],
        };
      }
      if (sql.includes("from public.groups") && sql.includes("limit 1")) {
        return { rows: [] };
      }
      if (sql.includes("insert into public.groups")) {
        return { rows: [{ id: "new-g" }] };
      }
      if (sql.includes("update public.import_batches")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await commitGroupsImportBatch({
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
