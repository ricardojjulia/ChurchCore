import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireChurchSessionMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  createTenantServerClientMock,
  supabaseUpdateMock,
  supabaseEqMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();

  // update().eq().select() resolves to the updated rows (S8 row-count check).
  const select = vi.fn(async () => ({ data: [{ id: "profile-1" }], error: null }));
  const eq = vi.fn(() => ({ eq, select }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  const createTenantServerClient = vi.fn(async () => ({ from }));

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
    createTenantServerClientMock: createTenantServerClient,
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

  it("marks account deletion as pending review for the member's own profile", async () => {
    expect(await requestAccountDeletionAction()).toEqual({ ok: true });

    expect(supabaseUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data_delete_requested_at: expect.any(String) }),
    );
    expect(supabaseEqMock).toHaveBeenCalledWith("id", "profile-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/member/data-rights");
  });

  it("lets a member cancel a pending deletion request", async () => {
    expect(await cancelDeletionRequestAction()).toEqual({ ok: true });
    expect(supabaseUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ data_delete_requested_at: null }));
  });

  it("returns an error, not a throw, for staff self-service deletion", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      userId: "login-1",
      churchProfileId: "profile-1",
      profile: { id: "login-1" },
      appContext: { roleId: "pastor", church: { id: "church-1" } },
    });

    expect(await requestAccountDeletionAction()).toEqual({
      ok: false,
      error: "Staff accounts cannot be deleted via self-service. Contact your platform administrator.",
    });
    expect(supabaseUpdateMock).not.toHaveBeenCalled();
  });

  it("records an export request", async () => {
    expect(await requestDataExportAction()).toEqual({ ok: true });
    expect(supabaseUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data_export_requested_at: expect.any(String) }),
    );
  });

  it("reports a request that matched no row instead of pretending it was sent (S8)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { select } = supabaseEqMock() as unknown as { select: ReturnType<typeof vi.fn> };
    select.mockResolvedValueOnce({ data: [], error: null });
    expect(await requestDataExportAction()).toEqual({ ok: false, error: "Couldn't find your profile to update." });
    errorSpy.mockRestore();
  });

  it("refuses someone with no profile in this church", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      userId: "login-1",
      churchProfileId: null,
      profile: { id: "login-1" },
      appContext: { roleId: "member", church: { id: "church-1" } },
    });
    expect(await requestDataExportAction()).toEqual({ ok: false, error: "Your account has no profile in this church." });
  });

  it("exports the member's memberships by login id and everything else by church profile id (S7)", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    queryTenantLocalDbMock.mockResolvedValue({ rows: [] });

    expect(await generateDataExportAction()).toMatchObject({ ok: true, payload: { memberships: [] } });

    const calls = queryTenantLocalDbMock.mock.calls as Array<[string, unknown[]]>;
    const membershipQuery = calls.find(([sql]) => sql.includes("from public.church_memberships"));
    // church_memberships is keyed by user_id; it has no profile_id column.
    expect(membershipQuery?.[0]).toContain("where cm.user_id = $1");
    expect(membershipQuery?.[1]).toEqual(["login-1"]);
    const profileQuery = calls.find(([sql]) => sql.includes("from public.profiles where id = $1"));
    expect(profileQuery?.[1]).toEqual(["profile-1"]);
  });
});

