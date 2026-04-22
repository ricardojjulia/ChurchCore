import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireChurchSessionMock,
  shouldUseLocalTenantFallbackMock,
  queryTenantLocalDbMock,
  supabaseFromMock,
  supabaseInsertMock,
  supabaseUpsertMock,
  createTenantServerClientMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();
  const queryTenantLocalDb = vi.fn();

  const supabaseInsert = vi.fn();
  const supabaseUpsert = vi.fn();
  const supabaseFrom = vi.fn(() => ({
    insert: supabaseInsert,
    upsert: supabaseUpsert,
  }));
  const createTenantServerClient = vi.fn(async () => ({
    from: supabaseFrom,
  }));

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
    queryTenantLocalDbMock: queryTenantLocalDb,
    supabaseFromMock: supabaseFrom,
    supabaseInsertMock: supabaseInsert,
    supabaseUpsertMock: supabaseUpsert,
    createTenantServerClientMock: createTenantServerClient,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: createTenantServerClientMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

import {
  addFirstTimeVisitorAction,
  createGroupAction,
  joinGroupAction,
  recordAttendanceAction,
} from "@/app/app/groups-actions";

describe("groups actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    requireChurchSessionMock.mockImplementation(async (path: string) => {
      if (path === "/app/member/groups") {
        return {
          appContext: { roleId: "member", church: { id: "church-1" } },
          profile: { id: "member-1" },
        };
      }
      return {
        appContext: { roleId: "church-admin", church: { id: "church-1" } },
        profile: { id: "admin-1" },
      };
    });
    supabaseInsertMock.mockReturnValue({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({ data: { id: "created-1" }, error: null })),
      })),
    });
    supabaseUpsertMock.mockResolvedValue({ error: null });
  });

  it("blocks create group for non-admin/pastor roles", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "member", church: { id: "church-1" } },
      profile: { id: "member-1" },
    });

    await expect(
      createGroupAction({
        name: "Leaders Group",
        category: "small-group",
        isOpen: true,
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("validates required group name", async () => {
    const result = await createGroupAction({
      name: "   ",
      category: "small-group",
      isOpen: true,
    });

    expect(result).toEqual({ ok: false, error: "Group name is required." });
  });

  it("creates group in local fallback mode", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [{ id: "group-1" }] });

    const result = await createGroupAction({
      name: "Men's Group",
      category: "small-group",
      isOpen: true,
      meetingDay: "Tuesday",
    });

    expect(result).toEqual({ ok: true, id: "group-1" });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into public.groups"),
      expect.arrayContaining(["church-1", "Men's Group", "small-group"]),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/groups");
  });

  it("creates a pending member join request in local fallback mode", async () => {
    const result = await joinGroupAction("group-22");

    expect(result).toEqual({ ok: true });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into public.group_members"),
      ["group-22", "church-1", "member-1"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/member/groups");
  });

  it("validates first-time visitor name", async () => {
    const result = await addFirstTimeVisitorAction({
      fullName: "   ",
      visitDate: "2025-01-02",
    });

    expect(result).toEqual({ ok: false, error: "Name is required." });
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
  });

  it("returns Supabase errors from attendance upsert", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    supabaseUpsertMock.mockResolvedValueOnce({ error: { message: "db failure" } });

    const result = await recordAttendanceAction("meeting-1", "group-1", [
      { profileId: "member-1", status: "present" },
    ]);

    expect(result).toEqual({ ok: false, error: "db failure" });
    expect(createTenantServerClientMock).toHaveBeenCalled();
    expect(supabaseFromMock).toHaveBeenCalledWith("group_attendance");
  });
});
