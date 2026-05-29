import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireChurchSessionMock,
  createTenantServerClientMock,
  hasTenantBackendEnvMock,
  hasTenantAdminBackendEnvMock,
  createTenantAdminClientMock,
  adminInviteUserByEmailMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  supabaseFromMock,
  supabaseMaybeSingleMock,
  supabaseUpdateEqMock,
  supabaseUpsertMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const hasTenantBackendEnv = vi.fn();
  const hasTenantAdminBackendEnv = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();
  const adminInviteUserByEmail = vi.fn();
  const createTenantAdminClient = vi.fn(() => ({
    auth: {
      admin: {
        inviteUserByEmail: adminInviteUserByEmail,
      },
    },
  }));

  const supabaseMaybeSingle = vi.fn();
  const supabaseEq = vi.fn(() => ({
    eq: supabaseEq,
    maybeSingle: supabaseMaybeSingle,
  }));
  const supabaseSelect = vi.fn(() => ({
    eq: supabaseEq,
    maybeSingle: supabaseMaybeSingle,
  }));
  const supabaseUpdateEq = vi.fn();
  const supabaseUpdate = vi.fn(() => ({
    eq: supabaseUpdateEq,
  }));
  const supabaseUpsert = vi.fn();
  const supabaseFrom = vi.fn((table: string) => ({
    select: supabaseSelect,
    update: table === "churches" ? supabaseUpdate : undefined,
    upsert: table === "event_registration_settings" ? supabaseUpsert : undefined,
  }));
  const createTenantServerClient = vi.fn(async () => ({
    from: supabaseFrom,
  }));

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    createTenantServerClientMock: createTenantServerClient,
    createTenantAdminClientMock: createTenantAdminClient,
    adminInviteUserByEmailMock: adminInviteUserByEmail,
    hasTenantBackendEnvMock: hasTenantBackendEnv,
    hasTenantAdminBackendEnvMock: hasTenantAdminBackendEnv,
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
    supabaseFromMock: supabaseFrom,
    supabaseMaybeSingleMock: supabaseMaybeSingle,
    supabaseUpdateEqMock: supabaseUpdateEq,
    supabaseUpsertMock: supabaseUpsert,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: vi.fn(() => "http://localhost:4200") })),
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantAdminClient: createTenantAdminClientMock,
  createTenantServerClient: createTenantServerClientMock,
  hasTenantAdminBackendEnv: hasTenantAdminBackendEnvMock,
  hasTenantBackendEnv: hasTenantBackendEnvMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

import {
  addRosterAssignmentAction,
  approveRegistrationAction,
  approveAccountRequestAction,
  createEventAction,
  rejectAccountRequestAction,
  registerForEventAction,
  updateChurchSettingsAction,
  upsertRegistrationFormFieldsAction,
  upsertRegistrationSettingsAction,
} from "@/app/app/church-admin-actions";

describe("church-admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      profile: { id: "profile-1" },
      source: "supabase",
      userId: "user-1",
    });
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    hasTenantBackendEnvMock.mockReturnValue(true);
    hasTenantAdminBackendEnvMock.mockReturnValue(false);
    adminInviteUserByEmailMock.mockResolvedValue({ data: { user: { id: "invited-user-1" } }, error: null });
    supabaseMaybeSingleMock.mockResolvedValue({ data: { id: "event-1" }, error: null });
    supabaseUpdateEqMock.mockResolvedValue({ error: null });
    supabaseUpsertMock.mockResolvedValue({ error: null });
  });

  it("rejects create event for unauthorized roles", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "member", church: { id: "church-1" } },
      profile: { id: "profile-1" },
      source: "supabase",
      userId: "user-1",
    });

    const result = await createEventAction({
      title: "Sunday Service",
      category: "service",
      startsAt: "2026-04-21T09:00:00.000Z",
      endsAt: "2026-04-21T10:30:00.000Z",
    });

    expect(result).toEqual({ ok: false, error: "Unauthorized." });
  });

  it("creates an event in local fallback mode", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "profile-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "event-1" }] });

    const result = await createEventAction({
      title: "Sunday Service",
      description: "Main gathering",
      category: "service",
      location: "Main Hall",
      startsAt: "2026-04-21T09:00:00.000Z",
      endsAt: "2026-04-21T10:30:00.000Z",
    });

    expect(result).toEqual({ ok: true, id: "event-1" });
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("insert into public.events"),
      [
        "church-1",
        "Sunday Service",
        "Main gathering",
        "service",
        "Main Hall",
        "2026-04-21T09:00:00.000Z",
        "2026-04-21T10:30:00.000Z",
        "profile-1",
      ],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/events");
  });

  it("returns supabase errors when saving registration settings", async () => {
    shouldUseLocalTenantFallbackMock.mockReturnValue(false);
    supabaseUpsertMock.mockResolvedValueOnce({ error: { message: "settings failure" } });

    const result = await upsertRegistrationSettingsAction({
      eventId: "event-1",
      registrationOpen: true,
      capacity: 120,
    });

    expect(result).toEqual({ ok: false, error: "settings failure" });
    expect(createTenantServerClientMock).toHaveBeenCalled();
    expect(supabaseFromMock).toHaveBeenCalledWith("event_registration_settings");
  });

  it("rejects partial mobile check-in location constraints", async () => {
    const result = await upsertRegistrationSettingsAction({
      eventId: "event-1",
      registrationOpen: true,
      mobileMemberCheckInLocationLat: 35.78,
    });

    expect(result).toEqual({
      ok: false,
      error:
        "Mobile member check-in location constraints require latitude, longitude, and radius.",
    });
  });

  it("rejects invalid mobile check-in location constraints", async () => {
    const result = await upsertRegistrationSettingsAction({
      eventId: "event-1",
      registrationOpen: true,
      mobileMemberCheckInLocationLat: 91,
      mobileMemberCheckInLocationLng: -78,
      mobileMemberCheckInLocationRadiusMeters: 75,
    });

    expect(result).toEqual({
      ok: false,
      error: "Mobile member check-in location constraints are invalid.",
    });
  });

  it("validates required registrant name", async () => {
    const result = await registerForEventAction({
      eventId: "event-1",
      churchId: "church-1",
      registrantName: "   ",
    });

    expect(result).toEqual({ ok: false, error: "Name is required." });
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
  });

  it("returns full event error when waitlist is disabled", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ church_id: "church-1" }] })
      .mockResolvedValueOnce({ rows: [{ capacity: 1, waitlist_enabled: false, registration_open: true, price_cents: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] });

    const result = await registerForEventAction({
      eventId: "event-1",
      churchId: "church-1",
      registrantName: "New Visitor",
    });

    expect(result).toEqual({ ok: false, error: "This event is full and does not have a waitlist." });
  });

  it("creates waitlisted registration when capacity is reached and waitlist is enabled", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ church_id: "church-1" }] })
      .mockResolvedValueOnce({ rows: [{ capacity: 1, waitlist_enabled: true, registration_open: true, price_cents: 2500 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: "reg-1" }] });

    const result = await registerForEventAction({
      eventId: "event-1",
      churchId: "church-1",
      registrantName: "New Visitor",
      registrantEmail: "visitor@example.com",
    });

    expect(result).toEqual({ ok: true, registrationId: "reg-1", isWaitlisted: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/events/event-1");
  });

  it("creates pending-approval registration when approval is required", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ church_id: "church-1" }] })
      .mockResolvedValueOnce({ rows: [{ capacity: null, waitlist_enabled: false, registration_open: true, approval_required: true, price_cents: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: "reg-approval-1" }] });

    const result = await registerForEventAction({
      eventId: "event-1",
      churchId: "church-1",
      registrantName: "Approval Needed",
      customFields: { tshirt_size: "L" },
    });

    expect(result).toEqual({ ok: true, registrationId: "reg-approval-1", isWaitlisted: false });
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("insert into public.event_registrations"),
      [
        "event-1",
        "church-1",
        "Approval Needed",
        null,
        null,
        "pending_approval",
        false,
        "not_required",
        null,
        JSON.stringify({ tshirt_size: "L" }),
      ],
    );
  });

  it("sets pending payment status for paid non-waitlisted registrations", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ church_id: "church-1" }] })
      .mockResolvedValueOnce({ rows: [{ capacity: null, waitlist_enabled: false, registration_open: true, approval_required: false, price_cents: 5000 }] })
      .mockResolvedValueOnce({ rows: [{ id: "reg-paid-1" }] });

    const result = await registerForEventAction({
      eventId: "event-1",
      churchId: "church-1",
      registrantName: "Paid Registrant",
      registrantEmail: "paid@example.com",
    });

    expect(result).toEqual({ ok: true, registrationId: "reg-paid-1", isWaitlisted: false });
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("payment_status"),
      [
        "event-1",
        "church-1",
        "Paid Registrant",
        "paid@example.com",
        null,
        "confirmed",
        false,
        "pending",
        null,
        null,
      ],
    );
  });

  it("rejects registration requests when provided church does not match event church", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [{ church_id: "church-1" }] });

    const result = await registerForEventAction({
      eventId: "event-1",
      churchId: "church-2",
      registrantName: "Mismatched Church",
    });

    expect(result).toEqual({
      ok: false,
      error: "Event does not belong to the requested church.",
    });
    expect(queryTenantLocalDbMock).toHaveBeenCalledTimes(1);
  });

  it("approves a pending registration in local fallback mode", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "event-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "reg-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await approveRegistrationAction("reg-1", "event-1");

    expect(result).toEqual({ ok: true });
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("set status = 'confirmed'"),
      ["reg-1", "church-1"],
    );
  });

  it("rejects approval when registration is not scoped to the current church event", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "event-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(approveRegistrationAction("reg-foreign", "event-1")).rejects.toThrow(
      "Registration not found for this event.",
    );
  });

  it("replaces registration form fields in local fallback mode", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "event-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await upsertRegistrationFormFieldsAction({
      eventId: "event-1",
      fields: [
        {
          label: "Shirt size",
          fieldKey: "shirt_size",
          fieldType: "select",
          isRequired: true,
          options: ["S", "M", "L"],
        },
      ],
    });

    expect(result).toEqual({ ok: true });
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("delete from public.event_registration_form_fields"),
      ["event-1", "church-1"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("insert into public.event_registration_form_fields"),
      [
        "event-1",
        "church-1",
        "Shirt size",
        "shirt_size",
        "select",
        true,
        JSON.stringify(["S", "M", "L"]),
        0,
      ],
    );
  });

  it("rejects registration settings updates when event is outside the active church", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    await expect(
      upsertRegistrationSettingsAction({
        eventId: "event-foreign",
        registrationOpen: true,
      }),
    ).rejects.toThrow("Event not found in this church.");
  });

  it("returns preview mode for roster assignment when tenant backend is unavailable", async () => {
    hasTenantBackendEnvMock.mockReturnValue(false);

    const result = await addRosterAssignmentAction({
      eventId: "event-1",
      profileId: "profile-2",
      roleTitle: "Greeter",
    });

    expect(result).toEqual({ previewMode: true });
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
  });

  it("updates church settings in local fallback mode", async () => {
    const result = await updateChurchSettingsAction({
      name: "Grace Harbor Church",
      legalName: "Grace Harbor Church Inc.",
      timezone: "America/Detroit",
      websiteUrl: "https://graceharbor.church",
      contactEmail: "office@graceharbor.church",
      contactPhone: "555-0100",
      mailingAddress: "100 Harbor Way",
      publicSummary: "A local church serving its neighborhood.",
    });

    expect(result).toEqual({ ok: true });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("update public.churches"),
      [
        "church-1",
        "Grace Harbor Church",
        "Grace Harbor Church Inc.",
        "America/Detroit",
        "https://graceharbor.church",
        "office@graceharbor.church",
        "555-0100",
        "100 Harbor Way",
        "A local church serving its neighborhood.",
      ],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/settings");
  });

  it("rejects church settings updates outside church-admin", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "pastor", church: { id: "church-1" } },
      profile: { id: "profile-1" },
      source: "supabase",
      userId: "user-1",
    });

    const result = await updateChurchSettingsAction({
      name: "Grace Harbor Church",
      timezone: "America/Detroit",
    });

    expect(result).toEqual({ ok: false, error: "Church-admin access is required." });
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
  });

  it("validates church settings payload before writing", async () => {
    const result = await updateChurchSettingsAction({
      name: "   ",
      timezone: "America/Detroit",
    });

    expect(result).toEqual({ ok: false, error: "Church name is required." });
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
  });

  it("approves a new portal account request in local fallback mode", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "admin-profile-1" }] })
      .mockResolvedValueOnce({ rows: [{ member_number: "GH-0007" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "request-1",
            profile_id: null,
            email: "new.member@example.com",
            phone: "555-0190",
            first_name: "New",
            last_name: "Member",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "profile-7" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await approveAccountRequestAction({ requestId: "request-1" });

    expect(result).toEqual({ previewMode: true, invited: false });
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("from public.profiles"),
      ["user-1", "church-1"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      2,
      "select public.generate_member_number() as member_number",
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("from public.account_requests"),
      ["request-1", "church-1"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("insert into public.profiles"),
      [null, "church-1", "New Member", "new.member@example.com", "555-0190", "GH-0007"],
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining("update public.account_requests"),
      ["profile-7", "admin-profile-1", expect.any(String), "request-1"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/accounts");
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/people");
  });

  it("links local account approval to an invited auth user when admin auth is configured", async () => {
    hasTenantAdminBackendEnvMock.mockReturnValue(true);
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "admin-profile-1" }] })
      .mockResolvedValueOnce({ rows: [{ member_number: "GH-0008" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "request-2",
            profile_id: null,
            email: "invited.member@example.com",
            phone: "555-0191",
            first_name: "Invited",
            last_name: "Member",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "profile-8" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await approveAccountRequestAction({ requestId: "request-2" });

    expect(result).toEqual({ previewMode: false, invited: true });
    expect(adminInviteUserByEmailMock).toHaveBeenCalledWith(
      "invited.member@example.com",
      expect.objectContaining({
        data: expect.objectContaining({
          church_id: "church-1",
          full_name: "Invited Member",
          role: "member",
        }),
        redirectTo: "http://localhost:4200/app/member",
      }),
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("insert into public.profiles"),
      [
        "invited-user-1",
        "church-1",
        "Invited Member",
        "invited.member@example.com",
        "555-0191",
        "GH-0008",
      ],
    );
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining("insert into public.church_memberships"),
      ["church-1", "invited-user-1"],
    );
  });

  it("rejects a portal account request inside the active church only", async () => {
    const result = await rejectAccountRequestAction({ requestId: "request-1" });

    expect(result).toEqual({ previewMode: false });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("delete from public.account_requests"),
      ["request-1", "church-1"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/church-admin/accounts");
  });
});
