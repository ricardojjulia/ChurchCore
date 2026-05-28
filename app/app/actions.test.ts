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

vi.mock("@/lib/church-profile", () => ({
  resolveActiveChurchProfileId: vi.fn(async () => "admin-1"),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantAdminClient: createTenantAdminClientMock,
  createTenantServerClient: createTenantServerClientMock,
  hasTenantAdminBackendEnv: hasTenantAdminBackendEnvMock,
  hasTenantBackendEnv: hasTenantBackendEnvMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

import {
  reviewMemberChangeRequestAction,
  updateChurchAdminPersonAction,
  updateChurchAdminPeopleBulkAction,
  updateMinistryAction,
} from "@/app/app/actions";

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
      .mockResolvedValueOnce({ rows: [{ id: "ministry-1" }] })
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
      expect.stringContaining("from public.ministries"),
      ["ministry-1", "church-1"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("from public.profiles"),
      ["profile-2", "church-1"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      3,
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
      4,
      expect.stringContaining("insert into public.profile_ministries"),
      ["church-1", "profile-2", "ministry-1"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/ministry");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/pastor");
  });

  it("rejects leader assignments outside the church scope", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "ministry-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      updateMinistryAction({
        ministryId: "ministry-1",
        name: "Care Team",
        ministryType: "care",
        visionStatement: null,
        scripturalAnchor: [],
        leaderProfileId: "missing-profile",
      }),
    ).rejects.toThrow("Profile not found in this church.");

    expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(2);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("updates a church-admin managed role and membership in local fallback mode", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ user_id: "user-2" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await updateChurchAdminPersonAction({
      profileId: "profile-2",
      fullName: "Miriam Lane",
      phone: "555-0102",
      address: "22 Harbor Way",
      displayTitle: "Pastor of Care",
      role: "pastor",
      membershipStatus: "active",
      preferredContactMethod: "email",
      emergencyContactName: "Jon Lane",
      emergencyContactPhone: "555-0199",
      directoryVisible: true,
      contactAllowed: true,
    });

    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("where id = $1"),
      ["profile-2", "user-1", "church-1"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("update public.profiles"),
      [
        "Miriam Lane",
        "555-0102",
        "22 Harbor Way",
        "Pastor of Care",
        "pastor_elder",
        true,
        "active",
        "email",
        true,
        true,
        "profile-2",
        "church-1",
      ],
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("update public.church_memberships"),
      ["church-1", "user-2", "pastor"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining("insert into public.church_memberships"),
      ["church-1", "user-2", "pastor"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/people");
  });

  it("blocks a church-admin from removing their own admin role", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [{ id: "admin-1" }] });

    await expect(
      updateChurchAdminPersonAction({
        profileId: "admin-1",
        fullName: "Admin User",
        phone: null,
        address: null,
        displayTitle: null,
        role: "member",
        membershipStatus: "active",
        preferredContactMethod: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        directoryVisible: true,
        contactAllowed: true,
      }),
    ).rejects.toThrow("You cannot remove your own church-admin access.");

    expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("bulk-updates profile status and visibility inside the church scope", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    await updateChurchAdminPeopleBulkAction({
      profileIds: ["profile-2", "profile-3"],
      membershipStatus: "inactive",
      directoryVisible: false,
      contactAllowed: false,
    });

    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.profiles"),
      ["inactive", false, false, ["profile-2", "profile-3"], "church-1"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/people");
  });

  it("rejects empty church-admin bulk profile updates", async () => {
    await expect(
      updateChurchAdminPeopleBulkAction({
        profileIds: [],
        membershipStatus: null,
        directoryVisible: null,
        contactAllowed: null,
      }),
    ).rejects.toThrow("At least one person must be selected.");

    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("approves a pending member profile change request", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "admin-profile-1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "request-1",
            target_profile_id: "profile-2",
            change_type: "profile",
            proposed_changes: {
              fullName: "Ada Lovelace",
              phone: "555-0100",
              address: "123 Main",
              preferredContactMethod: "email",
              interests: ["hospitality"],
              emergencyContactName: "Grace Hopper",
              emergencyContactPhone: "555-0101",
              directoryVisible: true,
              contactAllowed: true,
            },
            status: "pending",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "profile-2",
            directory_visible: false,
            contact_allowed: false,
            preferred_contact_method: "sms",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await reviewMemberChangeRequestAction({
      requestId: "request-1",
      decision: "approved",
      reviewerNote: "Looks good.",
    });

    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("from public.member_change_requests"),
      ["request-1", "church-1"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("update public.profiles"),
      [
        "Ada Lovelace",
        "555-0100",
        "123 Main",
        "email",
        ["hospitality"],
        true,
        true,
        "profile-2",
        "church-1",
      ],
    );
    expect(
      queryTenantLocalDbMock.mock.calls.some(
        ([sql, params]) =>
          typeof sql === "string" &&
          sql.includes("update public.member_change_requests") &&
          Array.isArray(params) &&
          params[0] === "approved" &&
          params[1] === "admin-profile-1" &&
          params[2] === "Looks good." &&
          params[3] === "request-1" &&
          params[4] === "church-1",
      ),
    ).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/people");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/member");
  });

  it("rejects a pending member family change request without applying canonical writes", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "admin-profile-1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "request-2",
            target_profile_id: "profile-3",
            change_type: "family",
            proposed_changes: {
              familyName: "Lovelace",
              address: "123 Main",
              homePhone: "555-0100",
            },
            status: "pending",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    await reviewMemberChangeRequestAction({
      requestId: "request-2",
      decision: "rejected",
      reviewerNote: "Needs guardian details.",
    });

    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("update public.member_change_requests"),
      ["rejected", "admin-profile-1", "Needs guardian details.", "request-2", "church-1"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(3);
  });
});
