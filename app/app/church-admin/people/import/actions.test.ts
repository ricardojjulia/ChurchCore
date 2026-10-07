import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireChurchSessionMock,
  resolveActiveChurchProfileIdMock,
  runPeopleHouseholdImportDryRunMock,
  commitPeopleHouseholdImportBatchMock,
  hasTenantBackendEnvMock,
} = vi.hoisted(() => {
  const requireChurchSession = vi.fn();
  const resolveActiveChurchProfileId = vi.fn();
  const runPeopleHouseholdImportDryRun = vi.fn();
  const commitPeopleHouseholdImportBatch = vi.fn();
  const hasTenantBackendEnv = vi.fn();

  return {
    requireChurchSessionMock: requireChurchSession,
    resolveActiveChurchProfileIdMock: resolveActiveChurchProfileId,
    runPeopleHouseholdImportDryRunMock: runPeopleHouseholdImportDryRun,
    commitPeopleHouseholdImportBatchMock: commitPeopleHouseholdImportBatch,
    hasTenantBackendEnvMock: hasTenantBackendEnv,
  };
});

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/church-profile", () => ({
  resolveActiveChurchProfileId: resolveActiveChurchProfileIdMock,
}));

vi.mock("@/lib/people-import-dry-run", () => ({
  runPeopleHouseholdImportDryRun: runPeopleHouseholdImportDryRunMock,
  commitPeopleHouseholdImportBatch: commitPeopleHouseholdImportBatchMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  hasTenantBackendEnv: hasTenantBackendEnvMock,
}));

import {
  commitPeopleImportBatchAction,
  runPeopleImportDryRunAction,
} from "@/app/app/church-admin/people/import/actions";

describe("runPeopleImportDryRunAction", () => {
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
    runPeopleHouseholdImportDryRunMock.mockResolvedValue({
      batchId: "batch-1",
      counts: { create: 1, update: 0, skip: 0, reject: 0 },
      householdCreates: 1,
      rows: [],
    });
    commitPeopleHouseholdImportBatchMock.mockResolvedValue({
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
      runPeopleImportDryRunAction({
        sourceFilename: "people.csv",
        csvText: "full_name\nAda Lovelace",
      }),
    ).rejects.toThrow("Church admin access is required.");

    expect(runPeopleHouseholdImportDryRunMock).not.toHaveBeenCalled();
  });

  it("requires tenant backend and supabase session", async () => {
    hasTenantBackendEnvMock.mockReturnValueOnce(false);

    await expect(
      runPeopleImportDryRunAction({
        sourceFilename: "people.csv",
        csvText: "full_name\nAda Lovelace",
      }),
    ).rejects.toThrow("Tenant backend is required for dry-run imports.");

    expect(runPeopleHouseholdImportDryRunMock).not.toHaveBeenCalled();
  });

  it("passes church and actor scoped payload to dry run", async () => {
    const result = await runPeopleImportDryRunAction({
      sourceFilename: "people.csv",
      sourceSystem: "planning_center",
      csvText: "full_name,email\nAda Lovelace,ada@example.com",
    });

    expect(resolveActiveChurchProfileIdMock).toHaveBeenCalled();
    expect(runPeopleHouseholdImportDryRunMock).toHaveBeenCalledWith({
      churchId: "church-1",
      actorProfileId: "profile-admin",
      sourceFilename: "people.csv",
      sourceSystem: "planning_center",
      csvText: "full_name,email\nAda Lovelace,ada@example.com",
    });
    expect(result).toEqual({
      batchId: "batch-1",
      counts: { create: 1, update: 0, skip: 0, reject: 0 },
      householdCreates: 1,
      rows: [],
    });
  });

  it("rejects csvText exceeding 3.5MB size limit", async () => {
    const oversizedCsv = "a".repeat(3.5 * 1024 * 1024 + 1);

    await expect(
      runPeopleImportDryRunAction({
        sourceFilename: "people.csv",
        csvText: oversizedCsv,
      }),
    ).rejects.toThrow("CSV file size exceeds the maximum limit of 3.5MB.");
  });

  it("rejects csvText exceeding the 5,000 record limit", async () => {
    const tooManyRowsCsv = ["header_col", ...Array(5001).fill("val")].join("\n");

    await expect(
      runPeopleImportDryRunAction({
        sourceFilename: "people.csv",
        csvText: tooManyRowsCsv,
      }),
    ).rejects.toThrow("CSV import is limited to a maximum of 5,000 records per batch.");
    expect(runPeopleHouseholdImportDryRunMock).not.toHaveBeenCalled();
  });

  it("accepts a 5,000 record file (large-file import)", async () => {
    const largeCsv = ["header_col", ...Array(5000).fill("val")].join("\n");

    await expect(
      runPeopleImportDryRunAction({
        sourceFilename: "people.csv",
        csvText: largeCsv,
      }),
    ).resolves.toBeDefined();
    expect(runPeopleHouseholdImportDryRunMock).toHaveBeenCalledTimes(1);
  });

  it("commits a dry-run batch in church scope", async () => {
    const result = await commitPeopleImportBatchAction({ batchId: "batch-1" });

    expect(resolveActiveChurchProfileIdMock).toHaveBeenCalled();
    expect(commitPeopleHouseholdImportBatchMock).toHaveBeenCalledWith({
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

  it("rejects commit when backend is unavailable", async () => {
    hasTenantBackendEnvMock.mockReturnValueOnce(false);

    await expect(commitPeopleImportBatchAction({ batchId: "batch-1" })).rejects.toThrow(
      "Tenant backend is required for import commit.",
    );

    expect(commitPeopleHouseholdImportBatchMock).not.toHaveBeenCalled();
  });

  it("rejects commit for non church-admin roles", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "pastor", church: { id: "church-1" } },
      source: "supabase",
      userId: "user-1",
      churchProfileId: "profile-pastor", profile: { id: "profile-pastor-login"},
    });

    await expect(commitPeopleImportBatchAction({ batchId: "batch-1" })).rejects.toThrow(
      "Church admin access is required.",
    );

    expect(commitPeopleHouseholdImportBatchMock).not.toHaveBeenCalled();
  });
});
