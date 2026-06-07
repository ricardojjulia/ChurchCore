import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireChurchSessionMock } = vi.hoisted(() => ({
  requireChurchSessionMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

const { createTenantAdminClientMock } = vi.hoisted(() => ({
  createTenantAdminClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantAdminClient: createTenantAdminClientMock,
}));

import { eraseProfileData } from "@/lib/actions/erasure";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeChurchAdminSession(overrides: { profileId?: string; churchId?: string } = {}) {
  return {
    profile: { id: overrides.profileId ?? "actor-profile-id" },
    userId: "actor-user-id",
    appContext: {
      kind: "church",
      roleId: "church-admin",
      church: { id: overrides.churchId ?? "church-id-1" },
    },
    source: "supabase",
  };
}

function makeNonAdminSession() {
  return {
    profile: { id: "actor-profile-id" },
    userId: "actor-user-id",
    appContext: {
      kind: "church",
      roleId: "pastor",
      church: { id: "church-id-1" },
    },
    source: "supabase",
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("eraseProfileData", () => {
  const TARGET_PROFILE_ID = "target-profile-id";
  const ACTOR_PROFILE_ID = "actor-profile-id";
  const CHURCH_ID = "church-id-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns Forbidden when session role is not church-admin", async () => {
    requireChurchSessionMock.mockResolvedValue(makeNonAdminSession());

    const result = await eraseProfileData(TARGET_PROFILE_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Forbidden: church admin required");
  });

  it("returns error when actor tries to erase their own profile", async () => {
    requireChurchSessionMock.mockResolvedValue(
      makeChurchAdminSession({ profileId: TARGET_PROFILE_ID })
    );

    const result = await eraseProfileData(TARGET_PROFILE_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Cannot erase your own profile");
  });

  it("returns error when target profile is not found", async () => {
    requireChurchSessionMock.mockResolvedValue(makeChurchAdminSession());

    const singleMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    createTenantAdminClientMock.mockReturnValue({ from: fromMock, rpc: vi.fn() });

    const result = await eraseProfileData(TARGET_PROFILE_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Profile not found");
  });

  it("returns error when Supabase lookup fails", async () => {
    requireChurchSessionMock.mockResolvedValue(makeChurchAdminSession());

    const singleMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "DB connection error" },
    });
    const eqMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    createTenantAdminClientMock.mockReturnValue({ from: fromMock, rpc: vi.fn() });

    const result = await eraseProfileData(TARGET_PROFILE_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Profile not found");
  });

  it("returns Forbidden when target profile belongs to a different church", async () => {
    requireChurchSessionMock.mockResolvedValue(
      makeChurchAdminSession({ churchId: CHURCH_ID })
    );

    const singleMock = vi.fn().mockResolvedValue({
      data: { id: TARGET_PROFILE_ID, church_id: "different-church-id" },
      error: null,
    });
    const eqMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    createTenantAdminClientMock.mockReturnValue({ from: fromMock, rpc: vi.fn() });

    const result = await eraseProfileData(TARGET_PROFILE_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Forbidden: cross-church access denied");
  });

  it("calls erase_profile_pii RPC with correct args and returns ok:true on success", async () => {
    requireChurchSessionMock.mockResolvedValue(
      makeChurchAdminSession({ profileId: ACTOR_PROFILE_ID, churchId: CHURCH_ID })
    );

    const rpcMock = vi.fn().mockResolvedValue({ error: null });
    const singleMock = vi.fn().mockResolvedValue({
      data: { id: TARGET_PROFILE_ID, church_id: CHURCH_ID },
      error: null,
    });
    const eqMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    createTenantAdminClientMock.mockReturnValue({ from: fromMock, rpc: rpcMock });

    const result = await eraseProfileData(TARGET_PROFILE_ID);

    expect(rpcMock).toHaveBeenCalledWith("erase_profile_pii", {
      target_profile_id: TARGET_PROFILE_ID,
      actor_profile_id: ACTOR_PROFILE_ID,
    });
    expect(result.ok).toBe(true);
    expect(result.profileId).toBe(TARGET_PROFILE_ID);
    expect(result.actorId).toBe(ACTOR_PROFILE_ID);
    expect(result.erasedAt).toBeTruthy();
  });

  it("returns error with RPC message when RPC call fails", async () => {
    requireChurchSessionMock.mockResolvedValue(
      makeChurchAdminSession({ profileId: ACTOR_PROFILE_ID, churchId: CHURCH_ID })
    );

    const rpcMock = vi.fn().mockResolvedValue({
      error: { message: "Privileged staff profiles cannot be erased with this tool." },
    });
    const singleMock = vi.fn().mockResolvedValue({
      data: { id: TARGET_PROFILE_ID, church_id: CHURCH_ID },
      error: null,
    });
    const eqMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });
    createTenantAdminClientMock.mockReturnValue({ from: fromMock, rpc: rpcMock });

    const result = await eraseProfileData(TARGET_PROFILE_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toBe(
      "Privileged staff profiles cannot be erased with this tool."
    );
  });

  it("returns Unauthorized when requireChurchSession throws", async () => {
    requireChurchSessionMock.mockRejectedValue(new Error("Redirect"));

    const result = await eraseProfileData(TARGET_PROFILE_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });
});
