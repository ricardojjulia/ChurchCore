import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireChurchSessionMock,
  createTenantServerClientMock,
  hasTenantBackendEnvMock,
  hasTenantAdminBackendEnvMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  supabaseFromMock,
  supabaseMaybeSingleMock,
  supabaseUpsertMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const requireChurchSession = vi.fn();
  const hasTenantBackendEnv = vi.fn();
  const hasTenantAdminBackendEnv = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();

  const supabaseMaybeSingle = vi.fn();
  const supabaseEq = vi.fn(() => ({
    eq: supabaseEq,
    maybeSingle: supabaseMaybeSingle,
  }));
  const supabaseSelect = vi.fn(() => ({
    eq: supabaseEq,
    maybeSingle: supabaseMaybeSingle,
  }));
  const supabaseUpsert = vi.fn();
  const supabaseFrom = vi.fn((table: string) => ({
    select: supabaseSelect,
    upsert: table === "event_registration_settings" ? supabaseUpsert : undefined,
  }));
  const createTenantServerClient = vi.fn(async () => ({
    from: supabaseFrom,
  }));

  return {
    revalidatePathMock: revalidatePath,
    requireChurchSessionMock: requireChurchSession,
    createTenantServerClientMock: createTenantServerClient,
    hasTenantBackendEnvMock: hasTenantBackendEnv,
    hasTenantAdminBackendEnvMock: hasTenantAdminBackendEnv,
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
    supabaseFromMock: supabaseFrom,
    supabaseMaybeSingleMock: supabaseMaybeSingle,
    supabaseUpsertMock: supabaseUpsert,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: vi.fn(() => "http://localhost:3000") })),
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantAdminClient: vi.fn(),
  createTenantServerClient: createTenantServerClientMock,
  hasTenantAdminBackendEnv: hasTenantAdminBackendEnvMock,
  hasTenantBackendEnv: hasTenantBackendEnvMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

import {
  addRosterAssignmentAction,
  createEventAction,
  registerForEventAction,
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
    supabaseMaybeSingleMock.mockResolvedValue({ data: { id: "event-1" }, error: null });
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
      .mockResolvedValueOnce({ rows: [{ capacity: 1, waitlist_enabled: false, registration_open: true }] })
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
      .mockResolvedValueOnce({ rows: [{ capacity: 1, waitlist_enabled: true, registration_open: true }] })
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
});
