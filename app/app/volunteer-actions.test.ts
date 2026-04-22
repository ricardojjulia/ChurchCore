import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireChurchSessionMock,
  createTenantServerClientMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  supabaseFromMock,
  supabaseInsertMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();

  const supabaseInsert = vi.fn();
  const supabaseFrom = vi.fn(() => ({
    insert: supabaseInsert,
  }));
  const createTenantServerClient = vi.fn(async () => ({
    from: supabaseFrom,
  }));

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    createTenantServerClientMock: createTenantServerClient,
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
    supabaseFromMock: supabaseFrom,
    supabaseInsertMock: supabaseInsert,
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
  assignVolunteerAction,
  createServicePlanAction,
  respondToShiftAction,
  saveServicePlanTemplateAction,
} from "@/app/app/volunteer-actions";

describe("volunteer actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    requireChurchSessionMock.mockImplementation(async (path: string) => {
      if (path === "/app/member/schedule") {
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
    supabaseInsertMock.mockResolvedValue({ error: { message: "insert failed" } });
  });

  it("rejects create service plan for non-admin roles", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "member", church: { id: "church-1" } },
      profile: { id: "member-1" },
    });

    await expect(
      createServicePlanAction({
        name: "Sunday Morning",
        serviceDate: "2026-04-21",
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("validates required service plan name and date", async () => {
    const result = await createServicePlanAction({
      name: "   ",
      serviceDate: "",
    });

    expect(result).toEqual({ ok: false, error: "Name and service date are required." });
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
  });

  it("creates service plan and applies template positions in local mode", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "plan-1" }] })
      .mockResolvedValueOnce({ rows: [{ positions: JSON.stringify([{ roleName: "Greeter", quantity: 2 }]) }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await createServicePlanAction({
      name: "Sunday Morning",
      serviceDate: "2026-04-21",
      templateId: "template-1",
    });

    expect(result).toEqual({ ok: true, id: "plan-1" });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into public.service_plan_positions"),
      ["plan-1", "church-1", "Greeter", 2, 0],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/volunteers/schedules");
  });

  it("returns conflict when volunteer already assigned on same date", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [{ id: "existing-shift" }] });

    const result = await assignVolunteerAction({
      planId: "plan-1",
      positionId: "position-1",
      profileId: "member-2",
      roleName: "Usher",
      startsAt: "2026-04-21T09:00:00.000Z",
      endsAt: "2026-04-21T10:30:00.000Z",
    });

    expect(result).toEqual({
      ok: false,
      error: "This volunteer is already assigned on this service date.",
    });
  });

  it("updates member response for assigned shift", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    const result = await respondToShiftAction("shift-1", "confirmed");

    expect(result).toEqual({ ok: true });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.volunteer_shifts"),
      ["shift-1", "member-1", "confirmed", null, "church-1"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/member/schedule");
  });

  it("returns supabase insert errors for template save", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    supabaseInsertMock.mockResolvedValueOnce({ error: { message: "insert failed" } });

    const result = await saveServicePlanTemplateAction({
      name: "Sunday Core Team",
      positions: [{ roleName: "Greeter", quantity: 2 }],
    });

    expect(result).toEqual({ ok: false, error: "insert failed" });
    expect(createTenantServerClientMock).toHaveBeenCalled();
    expect(supabaseFromMock).toHaveBeenCalledWith("service_plan_templates");
  });
});
