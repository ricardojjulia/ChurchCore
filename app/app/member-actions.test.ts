import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireChurchSessionMock,
  hasTenantBackendEnvMock,
  shouldUseLocalTenantFallbackMock,
  queryTenantLocalDbMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  requireChurchSessionMock: vi.fn(),
  hasTenantBackendEnvMock: vi.fn(),
  shouldUseLocalTenantFallbackMock: vi.fn(),
  queryTenantLocalDbMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: vi.fn(),
  hasTenantBackendEnv: hasTenantBackendEnvMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

import { memberMobileCheckInAction } from "@/app/app/member-actions";

describe("memberMobileCheckInAction", () => {
  beforeEach(() => {
    revalidatePathMock.mockReset();
    requireChurchSessionMock.mockReset();
    hasTenantBackendEnvMock.mockReset();
    shouldUseLocalTenantFallbackMock.mockReset();
    queryTenantLocalDbMock.mockReset();

    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "member", church: { id: "church-1" } },
      profile: { id: "profile-1" },
      source: "supabase",
    });

    hasTenantBackendEnvMock.mockReturnValue(true);
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
  });

  it("returns preview mode when tenant backend is unavailable", async () => {
    hasTenantBackendEnvMock.mockReturnValue(false);

    const result = await memberMobileCheckInAction({ eventId: "event-1" });

    expect(result).toEqual({ ok: true, previewMode: true });
  });

  it("blocks when event check-in is not enabled", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [] });

    const result = await memberMobileCheckInAction({ eventId: "event-1" });

    expect(result).toEqual({
      ok: false,
      error: "Mobile member check-in is not enabled for this event.",
    });
  });

  it("returns alreadyCheckedIn when attendance exists", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [
          {
            title: "Sunday Worship",
            starts_at: "2026-01-01T09:00:00.000Z",
            ends_at: "2026-01-01T11:00:00.000Z",
            mobile_member_check_in_starts_at: "2000-01-01T00:00:00.000Z",
            mobile_member_check_in_ends_at: "2999-01-01T00:00:00.000Z",
            mobile_member_check_in_access_code: null,
            mobile_member_check_in_allow_household: false,
            mobile_member_check_in_location_lat: null,
            mobile_member_check_in_location_lng: null,
            mobile_member_check_in_location_radius_meters: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "profile-1", family_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: "attendance-1" }] });

    const result = await memberMobileCheckInAction({ eventId: "event-1" });

    expect(result).toEqual({ ok: true, alreadyCheckedIn: true });
  });

  it("inserts mobile_member attendance when event is open", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [
          {
            title: "Sunday Worship",
            starts_at: "2000-01-01T00:00:00.000Z",
            ends_at: "2999-01-01T00:00:00.000Z",
            mobile_member_check_in_starts_at: null,
            mobile_member_check_in_ends_at: null,
            mobile_member_check_in_access_code: null,
            mobile_member_check_in_allow_household: false,
            mobile_member_check_in_location_lat: null,
            mobile_member_check_in_location_lng: null,
            mobile_member_check_in_location_radius_meters: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "profile-1", family_id: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await memberMobileCheckInAction({ eventId: "event-1" });

    expect(result).toEqual({ ok: true, alreadyCheckedIn: false });
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("insert into public.attendance"),
      ["church-1", "event-1", "profile-1"],
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/app/member");
  });

  it("checks in a household member when household mode is enabled", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [
          {
            title: "Sunday Worship",
            starts_at: "2000-01-01T00:00:00.000Z",
            ends_at: "2999-01-01T00:00:00.000Z",
            mobile_member_check_in_starts_at: null,
            mobile_member_check_in_ends_at: null,
            mobile_member_check_in_access_code: null,
            mobile_member_check_in_allow_household: true,
            mobile_member_check_in_location_lat: null,
            mobile_member_check_in_location_lng: null,
            mobile_member_check_in_location_radius_meters: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "profile-1", family_id: "family-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "profile-2", family_id: "family-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await memberMobileCheckInAction({
      eventId: "event-1",
      targetProfileId: "profile-2",
    });

    expect(result).toEqual({ ok: true, alreadyCheckedIn: false });
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining("insert into public.attendance"),
      ["church-1", "event-1", "profile-2"],
    );
  });

  it("rejects household check-in outside the signed-in family", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [
          {
            title: "Sunday Worship",
            starts_at: "2000-01-01T00:00:00.000Z",
            ends_at: "2999-01-01T00:00:00.000Z",
            mobile_member_check_in_starts_at: null,
            mobile_member_check_in_ends_at: null,
            mobile_member_check_in_access_code: null,
            mobile_member_check_in_allow_household: true,
            mobile_member_check_in_location_lat: null,
            mobile_member_check_in_location_lng: null,
            mobile_member_check_in_location_radius_meters: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "profile-1", family_id: "family-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "profile-3", family_id: "family-2" }] });

    const result = await memberMobileCheckInAction({
      eventId: "event-1",
      targetProfileId: "profile-3",
    });

    expect(result).toEqual({
      ok: false,
      error: "You can only check in members from your own household.",
    });
  });

  it("rejects household target when household mode is disabled", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [
          {
            title: "Sunday Worship",
            starts_at: "2000-01-01T00:00:00.000Z",
            ends_at: "2999-01-01T00:00:00.000Z",
            mobile_member_check_in_starts_at: null,
            mobile_member_check_in_ends_at: null,
            mobile_member_check_in_access_code: null,
            mobile_member_check_in_allow_household: false,
            mobile_member_check_in_location_lat: null,
            mobile_member_check_in_location_lng: null,
            mobile_member_check_in_location_radius_meters: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "profile-1", family_id: "family-1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "profile-2", family_id: "family-1" }] });

    const result = await memberMobileCheckInAction({
      eventId: "event-1",
      targetProfileId: "profile-2",
    });

    expect(result).toEqual({
      ok: false,
      error: "Household check-in is not enabled for this event.",
    });
  });

  it("requires device location when geofence is configured", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [
          {
            title: "Sunday Worship",
            starts_at: "2000-01-01T00:00:00.000Z",
            ends_at: "2999-01-01T00:00:00.000Z",
            mobile_member_check_in_starts_at: null,
            mobile_member_check_in_ends_at: null,
            mobile_member_check_in_access_code: null,
            mobile_member_check_in_allow_household: false,
            mobile_member_check_in_location_lat: 35.0,
            mobile_member_check_in_location_lng: -78.0,
            mobile_member_check_in_location_radius_meters: 150,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "profile-1", family_id: null }] });

    const result = await memberMobileCheckInAction({ eventId: "event-1" });

    expect(result).toEqual({
      ok: false,
      error: "Check-in location verification is required for this event.",
    });
  });

  it("rejects invalid geofence coordinates", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [
          {
            title: "Sunday Worship",
            starts_at: "2000-01-01T00:00:00.000Z",
            ends_at: "2999-01-01T00:00:00.000Z",
            mobile_member_check_in_starts_at: null,
            mobile_member_check_in_ends_at: null,
            mobile_member_check_in_access_code: null,
            mobile_member_check_in_allow_household: false,
            mobile_member_check_in_location_lat: 35.0,
            mobile_member_check_in_location_lng: -78.0,
            mobile_member_check_in_location_radius_meters: 150,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "profile-1", family_id: null }] });

    const result = await memberMobileCheckInAction({
      eventId: "event-1",
      deviceLatitude: 120,
      deviceLongitude: -78,
    });

    expect(result).toEqual({
      ok: false,
      error: "Check-in location verification failed due to invalid latitude.",
    });
  });

  it("rejects when device is outside geofence radius", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [
          {
            title: "Sunday Worship",
            starts_at: "2000-01-01T00:00:00.000Z",
            ends_at: "2999-01-01T00:00:00.000Z",
            mobile_member_check_in_starts_at: null,
            mobile_member_check_in_ends_at: null,
            mobile_member_check_in_access_code: null,
            mobile_member_check_in_allow_household: false,
            mobile_member_check_in_location_lat: 35.0,
            mobile_member_check_in_location_lng: -78.0,
            mobile_member_check_in_location_radius_meters: 100,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "profile-1", family_id: null }] });

    const result = await memberMobileCheckInAction({
      eventId: "event-1",
      deviceLatitude: 35.01,
      deviceLongitude: -78.01,
    });

    expect(result).toEqual({
      ok: false,
      error: "You must be on-site to check in for this event.",
    });
  });
});
