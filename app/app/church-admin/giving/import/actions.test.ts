import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireChurchSessionMock,
  resolveActiveChurchProfileIdMock,
  runGivingImportDryRunMock,
  commitGivingImportBatchMock,
  hasTenantBackendEnvMock,
} = vi.hoisted(() => {
  const requireChurchSession = vi.fn();
  const resolveActiveChurchProfileId = vi.fn();
  const runGivingImportDryRun = vi.fn();
  const commitGivingImportBatch = vi.fn();
  const hasTenantBackendEnv = vi.fn();

  return {
    requireChurchSessionMock: requireChurchSession,
    resolveActiveChurchProfileIdMock: resolveActiveChurchProfileId,
    runGivingImportDryRunMock: runGivingImportDryRun,
    commitGivingImportBatchMock: commitGivingImportBatch,
    hasTenantBackendEnvMock: hasTenantBackendEnv,
  };
});

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/church-profile", () => ({
  resolveActiveChurchProfileId: resolveActiveChurchProfileIdMock,
}));

vi.mock("@/lib/giving-import-dry-run", () => ({
  runGivingImportDryRun: runGivingImportDryRunMock,
  commitGivingImportBatch: commitGivingImportBatchMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  hasTenantBackendEnv: hasTenantBackendEnvMock,
}));

import {
  commitGivingImportBatchAction,
  runGivingImportDryRunAction,
} from "@/app/app/church-admin/giving/import/actions";

describe("runGivingImportDryRunAction", () => {
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
    runGivingImportDryRunMock.mockResolvedValue({
      batchId: "batch-1",
      counts: {
        create: 1,
        update: 0,
        skip: 0,
        reject: 0,
        unmatchedDonors: 0,
      },
      rows: [],
    });
    commitGivingImportBatchMock.mockResolvedValue({
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
      runGivingImportDryRunAction({
        sourceFilename: "giving.csv",
        csvText: "id,email,amount\nG-1,jane@example.com,100.00",
      }),
    ).rejects.toThrow("Church admin access is required.");

    expect(runGivingImportDryRunMock).not.toHaveBeenCalled();
  });

  it("rejects when hasTenantBackendEnv() returns false", async () => {
    hasTenantBackendEnvMock.mockReturnValueOnce(false);

    await expect(
      runGivingImportDryRunAction({
        sourceFilename: "giving.csv",
        csvText: "id,email,amount\nG-1,jane@example.com,100.00",
      }),
    ).rejects.toThrow("Tenant backend is required for dry-run imports.");

    expect(runGivingImportDryRunMock).not.toHaveBeenCalled();
  });

  it("rejects when session.source !== 'supabase'", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      source: "preview",
      userId: "user-1",
      profile: { id: "profile-admin" },
    });

    await expect(
      runGivingImportDryRunAction({
        sourceFilename: "giving.csv",
        csvText: "id,email,amount\nG-1,jane@example.com,100.00",
      }),
    ).rejects.toThrow("Tenant backend is required for dry-run imports.");

    expect(runGivingImportDryRunMock).not.toHaveBeenCalled();
  });

  it("passes correct church-scoped args to runGivingImportDryRun", async () => {
    const result = await runGivingImportDryRunAction({
      sourceFilename: "giving.csv",
      sourceSystem: "planning_center",
      csvText: "id,email,amount\nG-1,jane@example.com,100.00",
    });

    expect(resolveActiveChurchProfileIdMock).toHaveBeenCalled();
    expect(runGivingImportDryRunMock).toHaveBeenCalledWith({
      churchId: "church-1",
      actorProfileId: "profile-admin",
      sourceFilename: "giving.csv",
      sourceSystem: "planning_center",
      csvText: "id,email,amount\nG-1,jane@example.com,100.00",
    });
    expect(result).toEqual({
      batchId: "batch-1",
      counts: {
        create: 1,
        update: 0,
        skip: 0,
        reject: 0,
        unmatchedDonors: 0,
      },
      rows: [],
    });
  });
});

describe("commitGivingImportBatchAction", () => {
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
    commitGivingImportBatchMock.mockResolvedValue({
      batchId: "batch-1",
      status: "committed",
      created: 1,
      updated: 0,
      failed: 0,
    });
  });

  it("commits batch with correct church-scoped args", async () => {
    const result = await commitGivingImportBatchAction({ batchId: "batch-1" });

    expect(resolveActiveChurchProfileIdMock).toHaveBeenCalled();
    expect(commitGivingImportBatchMock).toHaveBeenCalledWith({
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
      commitGivingImportBatchAction({ batchId: "batch-1" }),
    ).rejects.toThrow("Church admin access is required.");

    expect(commitGivingImportBatchMock).not.toHaveBeenCalled();
  });

  it("rejects commit when hasTenantBackendEnv() is false", async () => {
    hasTenantBackendEnvMock.mockReturnValueOnce(false);

    await expect(
      commitGivingImportBatchAction({ batchId: "batch-1" }),
    ).rejects.toThrow("Tenant backend is required for import commit.");

    expect(commitGivingImportBatchMock).not.toHaveBeenCalled();
  });

  it("rejects commit when session.source !== 'supabase'", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      source: "preview",
      userId: "user-1",
      profile: { id: "profile-admin" },
    });

    await expect(
      commitGivingImportBatchAction({ batchId: "batch-1" }),
    ).rejects.toThrow("Tenant backend is required for import commit.");

    expect(commitGivingImportBatchMock).not.toHaveBeenCalled();
  });
});
