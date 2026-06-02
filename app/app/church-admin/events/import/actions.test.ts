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
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      source: "supabase",
      userId: "user-1",
      profile: { id: "profile-admin" },
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
      profile: { id: "profile-pastor" },
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
      profile: { id: "profile-admin" },
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
    });
    expect(result).toEqual({
      batchId: "batch-1",
      counts: { create: 1, update: 0, skip: 0, reject: 0, unmatchedMinistries: 0 },
      rows: [],
    });
  });
});

describe("commitEventsImportBatchAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      source: "supabase",
      userId: "user-1",
      profile: { id: "profile-admin" },
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
      profile: { id: "profile-ml" },
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
      profile: { id: "profile-admin" },
    });

    await expect(
      commitEventsImportBatchAction({ batchId: "batch-1" }),
    ).rejects.toThrow("Tenant backend is required for import commit.");

    expect(commitEventsImportBatchMock).not.toHaveBeenCalled();
  });
});
