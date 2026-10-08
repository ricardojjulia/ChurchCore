import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireChurchSessionMock,
  resolveActiveChurchProfileIdMock,
  runEventsImportDryRunMock,
  commitEventsImportBatchMock,
  hasTenantBackendEnvMock,
} = vi.hoisted(() => {
  const requireChurchSession = vi.fn();
  const resolveActiveChurchProfileId = vi.fn();
  const runEventsImportDryRun = vi.fn();
  const commitEventsImportBatch = vi.fn();
  const hasTenantBackendEnv = vi.fn();

  return {
    requireChurchSessionMock: requireChurchSession,
    resolveActiveChurchProfileIdMock: resolveActiveChurchProfileId,
    runEventsImportDryRunMock: runEventsImportDryRun,
    commitEventsImportBatchMock: commitEventsImportBatch,
    hasTenantBackendEnvMock: hasTenantBackendEnv,
  };
});

const { revalidatePathMock } = vi.hoisted(() => ({ revalidatePathMock: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/church-profile", () => ({
  resolveActiveChurchProfileId: resolveActiveChurchProfileIdMock,
}));

vi.mock("@/lib/events-import-dry-run", () => ({
  runEventsImportDryRun: runEventsImportDryRunMock,
  commitEventsImportBatch: commitEventsImportBatchMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  hasTenantBackendEnv: hasTenantBackendEnvMock,
}));

import {
  commitEventsImportBatchAction,
  runEventsImportDryRunAction,
} from "@/app/app/church-admin/events/import/actions";

describe("runEventsImportDryRunAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1", timezone: "America/Chicago" } },
      source: "supabase",
      userId: "user-1",
      churchProfileId: "profile-admin", profile: { id: "profile-admin-login"},
    });
    hasTenantBackendEnvMock.mockReturnValue(true);
    resolveActiveChurchProfileIdMock.mockResolvedValue("profile-admin");
    runEventsImportDryRunMock.mockResolvedValue({
      batchId: "batch-1",
      counts: { create: 1, update: 0, skip: 0, reject: 0, unmatchedMinistries: 0 },
      rows: [],
    });
    commitEventsImportBatchMock.mockResolvedValue({
      batchId: "batch-1",
      status: "committed",
      created: 1,
      updated: 0,
      failed: 0,
    });
  });

  it("rejects non church-admin roles", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "pastor", church: { id: "church-1" } },
      source: "supabase",
      userId: "user-1",
      churchProfileId: "profile-pastor", profile: { id: "profile-pastor-login"},
    });

    await expect(
      runEventsImportDryRunAction({
        sourceFilename: "events.csv",
        csvText: "id,title,starts_at,ends_at\nE-1,Service,2026-07-01T10:00:00Z,2026-07-01T12:00:00Z",
      }),
    ).rejects.toThrow("Church admin access is required.");

    expect(runEventsImportDryRunMock).not.toHaveBeenCalled();
  });

  it("rejects when hasTenantBackendEnv() returns false", async () => {
    hasTenantBackendEnvMock.mockReturnValueOnce(false);

    await expect(
      runEventsImportDryRunAction({
        sourceFilename: "events.csv",
        csvText: "id,title,starts_at,ends_at\nE-1,Service,2026-07-01T10:00:00Z,2026-07-01T12:00:00Z",
      }),
    ).rejects.toThrow("Tenant backend is required for dry-run imports.");

    expect(runEventsImportDryRunMock).not.toHaveBeenCalled();
  });

  it("rejects when session.source !== 'supabase'", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      source: "preview",
      userId: "user-1",
      churchProfileId: "profile-admin", profile: { id: "profile-admin-login"},
    });

    await expect(
      runEventsImportDryRunAction({
        sourceFilename: "events.csv",
        csvText: "id,title,starts_at,ends_at\nE-1,Service,2026-07-01T10:00:00Z,2026-07-01T12:00:00Z",
      }),
    ).rejects.toThrow("Tenant backend is required for dry-run imports.");

    expect(runEventsImportDryRunMock).not.toHaveBeenCalled();
  });

  it("passes correct church-scoped args to runEventsImportDryRun", async () => {
    const result = await runEventsImportDryRunAction({
      sourceFilename: "events.csv",
      sourceSystem: "planning_center",
      csvText: "id,title,starts_at,ends_at\nE-1,Service,2026-07-01T10:00:00Z,2026-07-01T12:00:00Z",
    });

    expect(resolveActiveChurchProfileIdMock).toHaveBeenCalled();
    expect(runEventsImportDryRunMock).toHaveBeenCalledWith({
      churchId: "church-1",
      actorProfileId: "profile-admin",
      sourceFilename: "events.csv",
      sourceSystem: "planning_center",
      csvText: "id,title,starts_at,ends_at\nE-1,Service,2026-07-01T10:00:00Z,2026-07-01T12:00:00Z",
      timeZone: "America/Chicago",
    });
    expect(result).toEqual({
      batchId: "batch-1",
      counts: { create: 1, update: 0, skip: 0, reject: 0, unmatchedMinistries: 0 },
      rows: [],
    });
  });

  it("rejects csvText exceeding 3.5MB size limit", async () => {
    const oversizedCsv = "a".repeat(3.5 * 1024 * 1024 + 1);

    await expect(
      runEventsImportDryRunAction({
        sourceFilename: "events.csv",
        csvText: oversizedCsv,
      }),
    ).rejects.toThrow("CSV file size exceeds the maximum limit of 3.5MB.");
  });

  it("rejects csvText exceeding the 5,000 record limit", async () => {
    const tooManyRowsCsv = ["header_col", ...Array(5001).fill("val")].join("\n");

    await expect(
      runEventsImportDryRunAction({
        sourceFilename: "events.csv",
        csvText: tooManyRowsCsv,
      }),
    ).rejects.toThrow("CSV import is limited to a maximum of 5,000 records per batch.");
    expect(runEventsImportDryRunMock).not.toHaveBeenCalled();
  });

  it("rejects a source system the importer does not know", async () => {
    await expect(
      runEventsImportDryRunAction({
        sourceFilename: "x.csv",
        sourceSystem: "mystery" as never,
        csvText: "a,b\n1,2",
      }),
    ).rejects.toThrow("Unknown source system.");
    expect(runEventsImportDryRunMock).not.toHaveBeenCalled();
  });

  it("accepts a 5,000 record file (large-file import)", async () => {
    const largeCsv = ["header_col", ...Array(5000).fill("val")].join("\n");

    await expect(
      runEventsImportDryRunAction({
        sourceFilename: "events.csv",
        csvText: largeCsv,
      }),
    ).resolves.toBeDefined();
    expect(runEventsImportDryRunMock).toHaveBeenCalledTimes(1);
  });
});

describe("commitEventsImportBatchAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      source: "supabase",
      userId: "user-1",
      churchProfileId: "profile-admin", profile: { id: "profile-admin-login"},
    });
    hasTenantBackendEnvMock.mockReturnValue(true);
    resolveActiveChurchProfileIdMock.mockResolvedValue("profile-admin");
    commitEventsImportBatchMock.mockResolvedValue({
      batchId: "batch-1",
      status: "committed",
      created: 1,
      updated: 0,
      failed: 0,
    });
  });

  it("commits batch with correct church-scoped args", async () => {
    const result = await commitEventsImportBatchAction({ batchId: "batch-1" });

    expect(resolveActiveChurchProfileIdMock).toHaveBeenCalled();
    expect(commitEventsImportBatchMock).toHaveBeenCalledWith({
      churchId: "church-1",
      actorProfileId: "profile-admin",
      batchId: "batch-1",
      actorUserId: "user-1",
      actorRole: "church-admin",
    });
    expect(result).toEqual({
      batchId: "batch-1",
      status: "committed",
      created: 1,
      updated: 0,
      failed: 0,
    });
  });

  it("rejects non church-admin roles for commit", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "ministry_leader", church: { id: "church-1" } },
      source: "supabase",
      userId: "user-1",
      churchProfileId: "profile-ml", profile: { id: "profile-ml-login"},
    });

    await expect(
      commitEventsImportBatchAction({ batchId: "batch-1" }),
    ).rejects.toThrow("Church admin access is required.");

    expect(commitEventsImportBatchMock).not.toHaveBeenCalled();
  });

  it("rejects commit when hasTenantBackendEnv() is false", async () => {
    hasTenantBackendEnvMock.mockReturnValueOnce(false);

    await expect(
      commitEventsImportBatchAction({ batchId: "batch-1" }),
    ).rejects.toThrow("Tenant backend is required for import commit.");

    expect(commitEventsImportBatchMock).not.toHaveBeenCalled();
  });

  it("rejects commit when session.source !== 'supabase'", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      source: "preview",
      userId: "user-1",
      churchProfileId: "profile-admin", profile: { id: "profile-admin-login"},
    });

    await expect(
      commitEventsImportBatchAction({ batchId: "batch-1" }),
    ).rejects.toThrow("Tenant backend is required for import commit.");

    expect(commitEventsImportBatchMock).not.toHaveBeenCalled();
  });
});

describe("commitEventsImportBatchAction revalidates Recent imports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      source: "supabase",
      userId: "user-1",
    });
    hasTenantBackendEnvMock.mockReturnValue(true);
    resolveActiveChurchProfileIdMock.mockResolvedValue("profile-admin");
  });

  it("after a commit that succeeds", async () => {
    commitEventsImportBatchMock.mockResolvedValue({ batchId: "batch-1", status: "committed" });
    await commitEventsImportBatchAction({ batchId: "batch-1" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/events/import");
  });

  it("and after a commit that throws", async () => {
    commitEventsImportBatchMock.mockRejectedValue(new Error("boom"));
    await expect(commitEventsImportBatchAction({ batchId: "batch-1" })).rejects.toThrow("boom");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/events/import");
  });

  it("but not when the caller is refused", async () => {
    requireChurchSessionMock.mockResolvedValue({ appContext: { roleId: "pastor", church: { id: "church-1" } }, source: "supabase" });
    await expect(commitEventsImportBatchAction({ batchId: "batch-1" })).rejects.toThrow();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
