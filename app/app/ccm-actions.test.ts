import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireChurchSessionMock,
  createTenantServerClientMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  isMissingCcmSchemaErrorMock,
  getMissingCcmSchemaMessageMock,
  supabaseFromMock,
  supabaseInsertMock,
  supabaseSelectMock,
  supabaseSingleMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();
  const isMissingCcmSchemaError = vi.fn();
  const getMissingCcmSchemaMessage = vi.fn();

  const supabaseSingle = vi.fn();
  const supabaseSelect = vi.fn(() => ({ single: supabaseSingle }));
  const supabaseInsert = vi.fn(() => ({ select: supabaseSelect }));
  const supabaseFrom = vi.fn(() => ({
    insert: supabaseInsert,
    update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn() })) })),
  }));
  const createTenantServerClient = vi.fn(async () => ({ from: supabaseFrom }));

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    createTenantServerClientMock: createTenantServerClient,
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
    isMissingCcmSchemaErrorMock: isMissingCcmSchemaError,
    getMissingCcmSchemaMessageMock: getMissingCcmSchemaMessage,
    supabaseFromMock: supabaseFrom,
    supabaseInsertMock: supabaseInsert,
    supabaseSelectMock: supabaseSelect,
    supabaseSingleMock: supabaseSingle,
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

vi.mock("@/lib/ccm-runtime", () => ({
  getMissingCcmSchemaMessage: getMissingCcmSchemaMessageMock,
  isMissingCcmSchemaError: isMissingCcmSchemaErrorMock,
}));

import {
  addCustodyRestrictionAction,
  checkoutChildAction,
  checkinChildAction,
  closeServiceAction,
  openServiceAction,
  updateCheckinSessionLifecycleAction,
} from "@/app/app/ccm-actions";

describe("ccm actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      profile: { id: "profile-1" },
    });
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    isMissingCcmSchemaErrorMock.mockReturnValue(false);
    getMissingCcmSchemaMessageMock.mockReturnValue("CCM schema missing in local database.");
    supabaseSingleMock.mockResolvedValue({ data: { id: "row-1" }, error: null });
  });

  it("rejects non-admin roles", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "member", church: { id: "church-1" } },
      profile: { id: "profile-1" },
    });

    await expect(
      openServiceAction({
        ministryId: "ministry-1",
        serviceName: "Sunday AM",
        serviceDate: "2026-04-21",
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("opens a service in local fallback mode", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [{ id: "service-1" }] });

    const result = await openServiceAction({
      ministryId: "ministry-1",
      serviceName: "Sunday AM",
      serviceDate: "2026-04-21",
    });

    expect(result).toEqual({ id: "service-1" });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("insert into public.ccm_services"),
      ["church-1", "ministry-1", "Sunday AM", "2026-04-21"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/children");
  });

  it("maps missing CCM schema errors to friendly setup guidance", async () => {
    const lowLevel = new Error("relation does not exist");
    queryTenantLocalDbMock.mockRejectedValueOnce(lowLevel);
    isMissingCcmSchemaErrorMock.mockReturnValueOnce(true);
    getMissingCcmSchemaMessageMock.mockReturnValueOnce("Run db reset and create dev users.");

    await expect(
      openServiceAction({
        ministryId: "ministry-1",
        serviceName: "Sunday AM",
        serviceDate: "2026-04-21",
      }),
    ).rejects.toThrow("Run db reset and create dev users.");
  });

  it("closes service and marks late pickups in local fallback mode", async () => {
    queryTenantLocalDbMock.mockResolvedValue({ rows: [] });

    await closeServiceAction("service-22");

    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("update public.ccm_services"),
      ["service-22", "church-1"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("update public.ccm_checkin_sessions"),
      ["service-22", "church-1"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/children/services/service-22");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/children/dashboard");
  });

  it("updates check-in session lifecycle in local fallback mode", async () => {
    queryTenantLocalDbMock.mockResolvedValue({ rows: [] });

    await updateCheckinSessionLifecycleAction({
      serviceId: "service-22",
      status: "enabled",
      startsAt: "2026-05-27T08:30",
      endsAt: "2026-05-27T12:00",
    });

    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.ccm_services"),
      ["service-22", "church-1", "enabled", "2026-05-27T08:30", "2026-05-27T12:00"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/children/services/service-22");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/children/checkin");
  });

  it("rejects check-in when service session is not enabled", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({
      rows: [
        {
          status: "open",
          checkin_session_status: "paused",
          checkin_session_starts_at: null,
          checkin_session_ends_at: null,
        },
      ],
    });

    await expect(
      checkinChildAction({
        serviceId: "service-22",
        roomId: "room-1",
        childName: "Ada Child",
      }),
    ).rejects.toThrow("Check-in session is not enabled for this service.");
  });

  it("returns session not found when checkout session does not exist", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    const result = await checkoutChildAction({
      sessionId: "session-1",
      providedPin: "123456",
      releasedToName: "Parent",
    });

    expect(result).toEqual({ ok: false, error: "Session not found." });
  });

  it("returns already checked out error without bcrypt compare", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({
      rows: [{ pin_hash: "hash", status: "checked_out", qr_token: "token-1" }],
    });

    const result = await checkoutChildAction({
      sessionId: "session-1",
      providedPin: "123456",
      releasedToName: "Parent",
    });

    expect(result).toEqual({ ok: false, error: "Child has already been checked out." });
  });

  it("inserts custody restrictions via supabase path", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    supabaseSingleMock.mockResolvedValueOnce({ data: { id: "restriction-1" }, error: null });

    const result = await addCustodyRestrictionAction({
      childProfileId: "child-1",
      restrictedName: "John Doe",
      relationship: "Father",
      courtOrderOnFile: true,
      notes: "No pickup rights",
    });

    expect(result).toEqual({ id: "restriction-1" });
    expect(createTenantServerClientMock).toHaveBeenCalled();
    expect(supabaseFromMock).toHaveBeenCalledWith("ccm_custody_restrictions");
    expect(supabaseInsertMock).toHaveBeenCalled();
    expect(supabaseSelectMock).toHaveBeenCalledWith("id");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/children/children/child-1");
  });
});
