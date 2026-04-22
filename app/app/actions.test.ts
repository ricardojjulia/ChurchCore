import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireChurchSessionMock,
  createTenantServerClientMock,
  createTenantAdminClientMock,
  hasTenantBackendEnvMock,
  hasTenantAdminBackendEnvMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const createTenantServerClient = vi.fn();
  const createTenantAdminClient = vi.fn();
  const hasTenantBackendEnv = vi.fn();
  const hasTenantAdminBackendEnv = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    createTenantServerClientMock: createTenantServerClient,
    createTenantAdminClientMock: createTenantAdminClient,
    hasTenantBackendEnvMock: hasTenantBackendEnv,
    hasTenantAdminBackendEnvMock: hasTenantAdminBackendEnv,
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantAdminClient: createTenantAdminClientMock,
  createTenantServerClient: createTenantServerClientMock,
  hasTenantAdminBackendEnv: hasTenantAdminBackendEnvMock,
  hasTenantBackendEnv: hasTenantBackendEnvMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

import { updateMinistryAction } from "@/app/app/actions";

describe("app actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      profile: { id: "admin-1" },
      source: "supabase",
      userId: "user-1",
    });
    hasTenantBackendEnvMock.mockReturnValue(true);
    hasTenantAdminBackendEnvMock.mockReturnValue(false);
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
  });

  it("updates ministry leader assignment in local fallback mode", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "profile-2" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await updateMinistryAction({
      ministryId: "ministry-1",
      name: "Women's Ministry",
      ministryType: "women",
      visionStatement: "Equip women for prayer, discipleship, and care.",
      scripturalAnchor: ["Titus 2:3-5"],
      leaderProfileId: "profile-2",
    });

    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("from public.profiles"),
      ["profile-2", "church-1"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("update public.ministries"),
      [
        "Women's Ministry",
        "women",
        "Equip women for prayer, discipleship, and care.",
        ["Titus 2:3-5"],
        "profile-2",
        "ministry-1",
        "church-1",
      ],
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("insert into public.profile_ministries"),
      ["church-1", "profile-2", "ministry-1"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/ministry");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/pastor");
  });

  it("rejects leader assignments outside the church scope", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    await expect(
      updateMinistryAction({
        ministryId: "ministry-1",
        name: "Care Team",
        ministryType: "care",
        visionStatement: null,
        scripturalAnchor: [],
        leaderProfileId: "missing-profile",
      }),
    ).rejects.toThrow("Selected leader was not found in this church.");

    expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
