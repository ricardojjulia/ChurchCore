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
  requestAccountDeletionAction,
  requestDataExportAction,
} from "@/lib/compliance/data-rights-actions";

describe("data rights pending-review actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    requireChurchSessionMock.mockResolvedValue({
      profile: { id: "profile-1" },
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
      profile: { id: "profile-1" },
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
});
