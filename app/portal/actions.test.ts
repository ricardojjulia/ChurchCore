import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  hasTenantBackendEnvMock,
  hasTenantDbUrlMock,
  createTenantServerClientMock,
  getRequestedPublicChurchMock,
} = vi.hoisted(() => {
  const revalidatePath = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();
  const hasTenantBackendEnv = vi.fn();
  const hasTenantDbUrl = vi.fn();
  const createTenantServerClient = vi.fn();
  const getRequestedPublicChurch = vi.fn();

  return {
    revalidatePathMock: revalidatePath,
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
    hasTenantBackendEnvMock: hasTenantBackendEnv,
    hasTenantDbUrlMock: hasTenantDbUrl,
    createTenantServerClientMock: createTenantServerClient,
    getRequestedPublicChurchMock: getRequestedPublicChurch,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/public-portal-data", () => ({
  getRequestedPublicChurch: getRequestedPublicChurchMock,
}));

vi.mock("@/lib/supabase/config", () => ({
  hasTenantDbUrl: hasTenantDbUrlMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: createTenantServerClientMock,
  hasTenantBackendEnv: hasTenantBackendEnvMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

import { submitPublicEventRegistrationAction } from "@/app/portal/actions";

describe("submitPublicEventRegistrationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasTenantBackendEnvMock.mockReturnValue(true);
    hasTenantDbUrlMock.mockReturnValue(true);
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    getRequestedPublicChurchMock.mockResolvedValue(null);
  });

  it("sets pending payment status for paid public registrations", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [
          {
            registration_open: true,
            capacity: null,
            waitlist_enabled: false,
            approval_required: false,
            deadline: null,
            price_cents: 5000,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await submitPublicEventRegistrationAction({
      churchId: "church-1",
      eventId: "event-1",
      registrantName: "Public Guest",
      registrantEmail: "guest@example.com",
    });

    expect(result).toEqual({ ok: true, status: "confirmed" });
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("payment_status"),
      [
        "event-1",
        "church-1",
        "Public Guest",
        "guest@example.com",
        null,
        "confirmed",
        false,
        "pending",
        null,
        null,
      ],
    );
  });

  it("keeps waitlisted paid public registrations as not_required payment status", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [
          {
            registration_open: true,
            capacity: 1,
            waitlist_enabled: true,
            approval_required: false,
            deadline: null,
            price_cents: 5000,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await submitPublicEventRegistrationAction({
      churchId: "church-1",
      eventId: "event-1",
      registrantName: "Public Waitlist Guest",
      registrantEmail: "waitlist@example.com",
    });

    expect(result).toEqual({ ok: true, status: "waitlisted" });
    expect(queryTenantLocalDbMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("payment_status"),
      [
        "event-1",
        "church-1",
        "Public Waitlist Guest",
        "waitlist@example.com",
        null,
        "waitlisted",
        true,
        "not_required",
        null,
        null,
      ],
    );
  });
});
