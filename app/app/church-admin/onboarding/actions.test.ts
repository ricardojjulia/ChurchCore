import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePathMock, requireChurchSessionMock, queryTenantLocalDbMock } = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const queryTenantLocalDb = vi.fn();

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    queryTenantLocalDbMock: queryTenantLocalDb,
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
}));

import { hydrateSandboxDataAction } from "@/app/app/church-admin/onboarding/actions";

describe("hydrateSandboxDataAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      profile: { id: "profile-1" },
    });
  });

  it("rejects non church-admin roles", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "member", church: { id: "church-1" } },
      profile: { id: "profile-1" },
    });

    const result = await hydrateSandboxDataAction();

    expect(result).toEqual({
      ok: false,
      error: "Unauthorized: only church admins can hydrate sandbox data.",
    });
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
  });

  it("refuses to hydrate when the church is not in sandbox mode", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [{ is_sandbox: false }] });

    const result = await hydrateSandboxDataAction();

    expect(result).toEqual({
      ok: false,
      error: "This operation is only allowed in Sandbox Mode.",
    });
    expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(1);
  });

  it("returns an error result instead of throwing when a query fails", async () => {
    queryTenantLocalDbMock.mockRejectedValueOnce(new Error("db unavailable"));

    const result = await hydrateSandboxDataAction();

    expect(result).toEqual({ ok: false, error: "db unavailable" });
  });
});
