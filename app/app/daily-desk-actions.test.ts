import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireChurchSessionMock,
  createTenantServerClientMock,
  hasTenantBackendEnvMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const createTenantServerClient = vi.fn();
  const hasTenantBackendEnv = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    createTenantServerClientMock: createTenantServerClient,
    hasTenantBackendEnvMock: hasTenantBackendEnv,
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
  createTenantServerClient: createTenantServerClientMock,
  hasTenantBackendEnv: hasTenantBackendEnvMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

import {
  createDailyWorkItemAction,
  updateDailyWorkItemStatusAction,
} from "@/app/app/daily-desk-actions";

describe("daily desk actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      profile: { id: "profile-1" },
      userId: "user-1",
      source: "supabase",
    });
    hasTenantBackendEnvMock.mockReturnValue(true);
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    queryTenantLocalDbMock.mockResolvedValue({ rows: [] });
  });

  describe("createDailyWorkItemAction", () => {
    it("rejects roles outside church-admin, secretary, and pastor", async () => {
      requireChurchSessionMock.mockResolvedValueOnce({
        appContext: { roleId: "member", church: { id: "church-1" } },
        profile: { id: "profile-1" },
        userId: "user-1",
        source: "supabase",
      });

      await expect(
        createDailyWorkItemAction({ itemType: "note", title: "Follow up" }),
      ).rejects.toThrow("Church-admin, secretary, or pastor access is required.");
    });

    it("rejects an empty title", async () => {
      await expect(
        createDailyWorkItemAction({ itemType: "note", title: "   " }),
      ).rejects.toThrow("Title is required.");
    });

    it("inserts a work item via the local fallback and revalidates the daily desk path", async () => {
      const result = await createDailyWorkItemAction({
        itemType: "note",
        title: "Call the Smiths",
      });

      expect(result).toEqual({ ok: true, previewMode: false });
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("insert into public.daily_work_items"),
        expect.arrayContaining(["church-1", "note", "Call the Smiths"]),
      );
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/daily-desk");
    });

    it("returns an error result when the tenant backend is not configured", async () => {
      hasTenantBackendEnvMock.mockReturnValueOnce(false);

      const result = await createDailyWorkItemAction({
        itemType: "note",
        title: "Call the Smiths",
      });

      expect(result).toEqual({
        ok: false,
        error: "Backend not configured. Supabase connection required.",
      });
    });
  });

  describe("updateDailyWorkItemStatusAction", () => {
    it("updates status via the local fallback and revalidates the daily desk path", async () => {
      const result = await updateDailyWorkItemStatusAction({
        itemId: "item-1",
        status: "done",
      });

      expect(result).toEqual({ ok: true, previewMode: false });
      expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
        expect.stringContaining("update public.daily_work_items"),
        ["item-1", "church-1", "done"],
      );
      expect(revalidatePathMock).toHaveBeenCalledWith("/app/daily-desk");
    });
  });
});
