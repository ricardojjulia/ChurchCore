import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  getSessionMock,
  requireChurchSessionMock,
  persistCalendarBoardStateMock,
  hasTenantBackendEnvMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  getSessionMock: vi.fn(),
  requireChurchSessionMock: vi.fn(),
  persistCalendarBoardStateMock: vi.fn(),
  hasTenantBackendEnvMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth", () => ({
  getSession: getSessionMock,
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/application-state-store", () => ({
  persistCalendarBoardState: persistCalendarBoardStateMock,
}));

vi.mock("@/lib/church-profile", () => ({
  resolveActiveChurchProfileId: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: vi.fn(),
  hasTenantBackendEnv: hasTenantBackendEnvMock,
  queryTenantLocalDb: vi.fn(),
  shouldUseLocalTenantFallback: vi.fn(),
}));

import { createCalendarEventAction, persistCalendarBoardStateAction } from "@/app/calendar/actions";
import type { CalendarBoardState } from "@/lib/application-state";

describe("persistCalendarBoardStateAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when there is no active session", async () => {
    getSessionMock.mockResolvedValueOnce(null);

    await expect(
      persistCalendarBoardStateAction({} as CalendarBoardState),
    ).rejects.toThrow("No active session.");

    expect(persistCalendarBoardStateMock).not.toHaveBeenCalled();
  });

  it("persists board state and revalidates the calendar path", async () => {
    const session = { userId: "user-1", appContext: { roleId: "member" } };
    getSessionMock.mockResolvedValueOnce(session);
    const state = { view: "month" } as unknown as CalendarBoardState;

    await persistCalendarBoardStateAction(state);

    expect(persistCalendarBoardStateMock).toHaveBeenCalledWith(session, state);
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/calendar");
  });
});

describe("createCalendarEventAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects roles that cannot manage events", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "member", church: { id: "church-1" } },
      profile: { id: "profile-1" },
      userId: "user-1",
      source: "supabase",
    });

    await expect(createCalendarEventAction(new FormData())).rejects.toThrow(
      "Only church management roles can create events.",
    );
  });

  it("requires tenant backend configuration for church-admin writes", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      profile: { id: "profile-1" },
      userId: "user-1",
      source: "supabase",
    });
    hasTenantBackendEnvMock.mockReturnValueOnce(false);

    await expect(createCalendarEventAction(new FormData())).rejects.toThrow(
      "Calendar write actions require tenant backend configuration.",
    );
  });
});
