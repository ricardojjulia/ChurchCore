import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireChurchSessionMock,
  resolveActiveChurchProfileIdMock,
  runAttendanceImportDryRunMock,
  commitAttendanceImportBatchMock,
  hasTenantBackendEnvMock,
} = vi.hoisted(() => {
  const requireChurchSession = vi.fn();
  const resolveActiveChurchProfileId = vi.fn();
  const runAttendanceImportDryRun = vi.fn();
  const commitAttendanceImportBatch = vi.fn();
  const hasTenantBackendEnv = vi.fn();

  return {
    requireChurchSessionMock: requireChurchSession,
    resolveActiveChurchProfileIdMock: resolveActiveChurchProfileId,
    runAttendanceImportDryRunMock: runAttendanceImportDryRun,
    commitAttendanceImportBatchMock: commitAttendanceImportBatch,
    hasTenantBackendEnvMock: hasTenantBackendEnv,
  };
});

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/church-profile", () => ({
  resolveActiveChurchProfileId: resolveActiveChurchProfileIdMock,
}));

vi.mock("@/lib/attendance-import-dry-run", () => ({
  runAttendanceImportDryRun: runAttendanceImportDryRunMock,
  commitAttendanceImportBatch: commitAttendanceImportBatchMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  hasTenantBackendEnv: hasTenantBackendEnvMock,
}));

import {
  commitAttendanceImportBatchAction,
  runAttendanceImportDryRunAction,
} from "@/app/app/church-admin/attendance/import/actions";

describe("runAttendanceImportDryRunAction", () => {
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
    runAttendanceImportDryRunMock.mockResolvedValue({
      batchId: "batch-1",
      counts: {
        create: 1,
        update: 0,
        skip: 0,
        reject: 0,
        unmatchedProfiles: 0,
        unmatchedEvents: 0,
      },
      rows: [],
    });
    commitAttendanceImportBatchMock.mockResolvedValue({
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
      runAttendanceImportDryRunAction({
        sourceFilename: "attendance.csv",
        csvText: "id,email,status\nA-1,jane@example.com,present",
      }),
    ).rejects.toThrow("Church admin access is required.");

    expect(runAttendanceImportDryRunMock).not.toHaveBeenCalled();
  });

  it("rejects when hasTenantBackendEnv() returns false", async () => {
    hasTenantBackendEnvMock.mockReturnValueOnce(false);

    await expect(
      runAttendanceImportDryRunAction({
        sourceFilename: "attendance.csv",
        csvText: "id,email,status\nA-1,jane@example.com,present",
      }),
    ).rejects.toThrow("Tenant backend is required for dry-run imports.");

    expect(runAttendanceImportDryRunMock).not.toHaveBeenCalled();
  });

  it("rejects when session.source !== 'supabase'", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      source: "preview",
      userId: "user-1",
      profile: { id: "profile-admin" },
    });

    await expect(
      runAttendanceImportDryRunAction({
        sourceFilename: "attendance.csv",
        csvText: "id,email,status\nA-1,jane@example.com,present",
      }),
    ).rejects.toThrow("Tenant backend is required for dry-run imports.");

    expect(runAttendanceImportDryRunMock).not.toHaveBeenCalled();
  });

  it("passes correct church-scoped args to runAttendanceImportDryRun", async () => {
    const result = await runAttendanceImportDryRunAction({
      sourceFilename: "attendance.csv",
      sourceSystem: "planning_center",
      csvText: "id,email,status\nA-1,jane@example.com,present",
    });

    expect(resolveActiveChurchProfileIdMock).toHaveBeenCalled();
    expect(runAttendanceImportDryRunMock).toHaveBeenCalledWith({
      churchId: "church-1",
      actorProfileId: "profile-admin",
      sourceFilename: "attendance.csv",
      sourceSystem: "planning_center",
      csvText: "id,email,status\nA-1,jane@example.com,present",
    });
    expect(result).toEqual({
      batchId: "batch-1",
      counts: {
        create: 1,
        update: 0,
        skip: 0,
        reject: 0,
        unmatchedProfiles: 0,
        unmatchedEvents: 0,
      },
      rows: [],
    });
  });
});

describe("commitAttendanceImportBatchAction", () => {
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
    commitAttendanceImportBatchMock.mockResolvedValue({
      batchId: "batch-1",
      status: "committed",
      created: 1,
      updated: 0,
      failed: 0,
    });
  });

  it("commits batch with correct church-scoped args", async () => {
    const result = await commitAttendanceImportBatchAction({ batchId: "batch-1" });

    expect(resolveActiveChurchProfileIdMock).toHaveBeenCalled();
    expect(commitAttendanceImportBatchMock).toHaveBeenCalledWith({
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
      commitAttendanceImportBatchAction({ batchId: "batch-1" }),
    ).rejects.toThrow("Church admin access is required.");

    expect(commitAttendanceImportBatchMock).not.toHaveBeenCalled();
  });

  it("rejects commit when hasTenantBackendEnv() is false", async () => {
    hasTenantBackendEnvMock.mockReturnValueOnce(false);

    await expect(
      commitAttendanceImportBatchAction({ batchId: "batch-1" }),
    ).rejects.toThrow("Tenant backend is required for import commit.");

    expect(commitAttendanceImportBatchMock).not.toHaveBeenCalled();
  });

  it("rejects commit when session.source !== 'supabase'", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      source: "preview",
      userId: "user-1",
      profile: { id: "profile-admin" },
    });

    await expect(
      commitAttendanceImportBatchAction({ batchId: "batch-1" }),
    ).rejects.toThrow("Tenant backend is required for import commit.");

    expect(commitAttendanceImportBatchMock).not.toHaveBeenCalled();
  });
});
