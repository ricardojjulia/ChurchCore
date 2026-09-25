import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePathMock, getSessionMock, persistChurchAdminWorkspaceStateMock } = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const getSession = vi.fn();
  const persistChurchAdminWorkspaceState = vi.fn();

  return {
    revalidatePathMock: revalidatePath,
    getSessionMock: getSession,
    persistChurchAdminWorkspaceStateMock: persistChurchAdminWorkspaceState,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth", () => ({
  getSession: getSessionMock,
}));

vi.mock("@/lib/application-state-store", () => ({
  persistChurchAdminWorkspaceState: persistChurchAdminWorkspaceStateMock,
}));

import { persistChurchAdminWorkspaceStateAction } from "@/app/workspace/actions";
import type { ChurchAdminWorkspaceState } from "@/lib/application-state";

describe("persistChurchAdminWorkspaceStateAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when there is no active session", async () => {
    getSessionMock.mockResolvedValueOnce(null);

    await expect(
      persistChurchAdminWorkspaceStateAction({} as ChurchAdminWorkspaceState),
    ).rejects.toThrow("No active session.");

    expect(persistChurchAdminWorkspaceStateMock).not.toHaveBeenCalled();
  });

  it("persists state for the active session and revalidates the church-admin path", async () => {
    const session = { userId: "user-1", appContext: { roleId: "church-admin" } };
    getSessionMock.mockResolvedValueOnce(session);
    const state = { widgets: [] } as unknown as ChurchAdminWorkspaceState;

    await persistChurchAdminWorkspaceStateAction(state);

    expect(persistChurchAdminWorkspaceStateMock).toHaveBeenCalledWith(session, state);
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin");
  });
});
