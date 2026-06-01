import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireChurchSessionMock,
  resolveActiveChurchProfileIdMock,
  runGroupsImportDryRunMock,
  commitGroupsImportBatchMock,
  hasTenantBackendEnvMock,
} = vi.hoisted(() => {
  const requireChurchSession = vi.fn();
  const resolveActiveChurchProfileId = vi.fn();
  const runGroupsImportDryRun = vi.fn();
  const commitGroupsImportBatch = vi.fn();
  const hasTenantBackendEnv = vi.fn();

  return {
    requireChurchSessionMock: requireChurchSession,
    resolveActiveChurchProfileIdMock: resolveActiveChurchProfileId,
    runGroupsImportDryRunMock: runGroupsImportDryRun,
    commitGroupsImportBatchMock: commitGroupsImportBatch,
    hasTenantBackendEnvMock: hasTenantBackendEnv,
  };
});

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/church-profile", () => ({
  resolveActiveChurchProfileId: resolveActiveChurchProfileIdMock,
}));

vi.mock("@/lib/groups-import-dry-run", () => ({
  runGroupsImportDryRun: runGroupsImportDryRunMock,
  commitGroupsImportBatch: commitGroupsImportBatchMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  hasTenantBackendEnv: hasTenantBackendEnvMock,
}));

import {
  commitGroupsImportBatchAction,
  runGroupsImportDryRunAction,
} from "@/app/app/church-admin/groups/import/actions";

describe("runGroupsImportDryRunAction", () => {
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
    runGroupsImportDryRunMock.mockResolvedValue({
      batchId: "batch-1",
      counts: { create: 1, update: 0, skip: 0, reject: 0, unmatchedLeaders: 0 },
      rows: [],
    });
    commitGroupsImportBatchMock.mockResolvedValue({
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
      runGroupsImportDryRunAction({
        sourceFilename: "groups.csv",
        csvText: "id,name\nG-1,Test Group",
      }),
    ).rejects.toThrow("Church admin access is required.");

    expect(runGroupsImportDryRunMock).not.toHaveBeenCalled();
  });

  it("rejects when hasTenantBackendEnv() returns false", async () => {
    hasTenantBackendEnvMock.mockReturnValueOnce(false);

    await expect(
      runGroupsImportDryRunAction({
        sourceFilename: "groups.csv",
        csvText: "id,name\nG-1,Test Group",
      }),
    ).rejects.toThrow("Tenant backend is required for dry-run imports.");

    expect(runGroupsImportDryRunMock).not.toHaveBeenCalled();
  });

  it("rejects when session.source !== 'supabase'", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      source: "preview",
      userId: "user-1",
      profile: { id: "profile-admin" },
    });

    await expect(
      runGroupsImportDryRunAction({
        sourceFilename: "groups.csv",
        csvText: "id,name\nG-1,Test Group",
      }),
    ).rejects.toThrow("Tenant backend is required for dry-run imports.");

    expect(runGroupsImportDryRunMock).not.toHaveBeenCalled();
  });

  it("passes correct church-scoped args to runGroupsImportDryRun", async () => {
    const result = await runGroupsImportDryRunAction({
      sourceFilename: "groups.csv",
      sourceSystem: "planning_center",
      csvText: "id,name\nG-1,Test Group",
    });

    expect(resolveActiveChurchProfileIdMock).toHaveBeenCalled();
    expect(runGroupsImportDryRunMock).toHaveBeenCalledWith({
      churchId: "church-1",
      actorProfileId: "profile-admin",
      sourceFilename: "groups.csv",
      sourceSystem: "planning_center",
      csvText: "id,name\nG-1,Test Group",
    });
    expect(result).toEqual({
      batchId: "batch-1",
      counts: { create: 1, update: 0, skip: 0, reject: 0, unmatchedLeaders: 0 },
      rows: [],
    });
  });
});

describe("commitGroupsImportBatchAction", () => {
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
    commitGroupsImportBatchMock.mockResolvedValue({
      batchId: "batch-1",
      status: "committed",
      created: 1,
      updated: 0,
      failed: 0,
    });
  });

  it("commits batch with correct church-scoped args", async () => {
    const result = await commitGroupsImportBatchAction({ batchId: "batch-1" });

    expect(resolveActiveChurchProfileIdMock).toHaveBeenCalled();
    expect(commitGroupsImportBatchMock).toHaveBeenCalledWith({
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
      commitGroupsImportBatchAction({ batchId: "batch-1" }),
    ).rejects.toThrow("Church admin access is required.");

    expect(commitGroupsImportBatchMock).not.toHaveBeenCalled();
  });

  it("rejects commit when hasTenantBackendEnv() is false", async () => {
    hasTenantBackendEnvMock.mockReturnValueOnce(false);

    await expect(
      commitGroupsImportBatchAction({ batchId: "batch-1" }),
    ).rejects.toThrow("Tenant backend is required for import commit.");

    expect(commitGroupsImportBatchMock).not.toHaveBeenCalled();
  });

  it("rejects commit when session.source !== 'supabase'", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      source: "preview",
      userId: "user-1",
      profile: { id: "profile-admin" },
    });

    await expect(
      commitGroupsImportBatchAction({ batchId: "batch-1" }),
    ).rejects.toThrow("Tenant backend is required for import commit.");

    expect(commitGroupsImportBatchMock).not.toHaveBeenCalled();
  });
});
