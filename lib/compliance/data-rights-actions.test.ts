import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireChurchSessionMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  createTenantServerClientMock,
  supabaseFromMock,
  supabaseUpdateMock,
  supabaseEqMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();

  const eq = vi.fn(() => ({ eq }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  const createTenantServerClient = vi.fn(async () => ({ from }));

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
    createTenantServerClientMock: createTenantServerClient,
    supabaseFromMock: from,
    supabaseUpdateMock: update,
    supabaseEqMock: eq,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
  createTenantServerClient: createTenantServerClientMock,
}));

import {
  cancelDeletionRequestAction,
  generateDataExportAction,
  requestAccountDeletionAction,
  requestDataExportAction,
} from "@/lib/compliance/data-rights-actions";

describe("data rights pending-review actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    // Realistic ids: the login id (userId, profile.id) is never the church profile id (S7).
    requireChurchSessionMock.mockResolvedValue({
      userId: "login-1",
      churchProfileId: "profile-1",
      profile: { id: "login-1" },
      appContext: { roleId: "member", church: { id: "church-1" } },
    });
  });

  it("marks account deletion as pending review for eligible member accounts", async () => {
    await requestAccountDeletionAction();

    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("set data_delete_requested_at = now()"),
      ["profile-1"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/member/data-rights");
  });

  it("allows members to cancel a pending deletion request", async () => {
    await cancelDeletionRequestAction();

    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("set data_delete_requested_at = null"),
      ["profile-1"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/member/data-rights");
  });

  it("rejects self-service deletion for staff roles", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      churchProfileId: "profile-1", profile: { id: "profile-1-login"},
      appContext: { roleId: "pastor", church: { id: "church-1" } },
    });

    await expect(requestAccountDeletionAction()).rejects.toThrow(
      "Staff accounts cannot be deleted via self-service",
    );
  });

  it("records export requests in local fallback mode", async () => {
    await requestDataExportAction();

    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("set data_export_requested_at = now()"),
      ["profile-1"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/member/data-rights");
  });

  it("writes pending deletion timestamp in supabase mode", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValueOnce(false);

    await requestAccountDeletionAction();

    expect(supabaseFromMock).toHaveBeenCalledWith("profiles");
    expect(supabaseUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data_delete_requested_at: expect.any(String),
        updated_at: expect.any(String),
      }),
    );
    expect(supabaseEqMock).toHaveBeenCalledWith("id", "profile-1");
  });

  it("exports the member's memberships by login id and everything else by church profile id (S7)", async () => {
    queryTenantLocalDbMock.mockResolvedValue({ rows: [] });

    await generateDataExportAction();

    const calls = queryTenantLocalDbMock.mock.calls as Array<[string, unknown[]]>;
    const membershipQuery = calls.find(([sql]) => sql.includes("from public.church_memberships"));
    // church_memberships is keyed by user_id; it has no profile_id column.
    expect(membershipQuery?.[0]).toContain("where cm.user_id = $1");
    expect(membershipQuery?.[1]).toEqual(["login-1"]);
    const profileQuery = calls.find(([sql]) => sql.includes("from public.profiles where id = $1"));
    expect(profileQuery?.[1]).toEqual(["profile-1"]);
  });
});

