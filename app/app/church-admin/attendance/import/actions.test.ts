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
      appContext: { roleId: "church-admin", church: { id: "church-1", timezone: "America/Chicago" } },
      source: "supabase",
      userId: "user-1",
      churchProfileId: "profile-admin", profile: { id: "profile-admin-login"},
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
      churchProfileId: "profile-pastor", profile: { id: "profile-pastor-login"},
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
      churchProfileId: "profile-admin", profile: { id: "profile-admin-login"},
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
      timeZone: "America/Chicago",
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

  it("rejects csvText exceeding 3.5MB size limit", async () => {
    const oversizedCsv = "a".repeat(3.5 * 1024 * 1024 + 1);

    await expect(
      runAttendanceImportDryRunAction({
        sourceFilename: "attendance.csv",
        csvText: oversizedCsv,
      }),
    ).rejects.toThrow("CSV file size exceeds the maximum limit of 3.5MB.");
  });

  it("rejects csvText exceeding the 5,000 record limit", async () => {
    const tooManyRowsCsv = ["header_col", ...Array(5001).fill("val")].join("\n");

    await expect(
      runAttendanceImportDryRunAction({
        sourceFilename: "attendance.csv",
        csvText: tooManyRowsCsv,
      }),
    ).rejects.toThrow("CSV import is limited to a maximum of 5,000 records per batch.");
    expect(runAttendanceImportDryRunMock).not.toHaveBeenCalled();
  });

  it("accepts a 5,000 record file (large-file import)", async () => {
    const largeCsv = ["header_col", ...Array(5000).fill("val")].join("\n");

    await expect(
      runAttendanceImportDryRunAction({
        sourceFilename: "attendance.csv",
        csvText: largeCsv,
      }),
    ).resolves.toBeDefined();
    expect(runAttendanceImportDryRunMock).toHaveBeenCalledTimes(1);
  });
});

describe("commitAttendanceImportBatchAction", () => {
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
      churchProfileId: "profile-ml", profile: { id: "profile-ml-login"},
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
      churchProfileId: "profile-admin", profile: { id: "profile-admin-login"},
    });

    await expect(
      commitAttendanceImportBatchAction({ batchId: "batch-1" }),
    ).rejects.toThrow("Tenant backend is required for import commit.");

    expect(commitAttendanceImportBatchMock).not.toHaveBeenCalled();
  });
});
