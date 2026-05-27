import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  headersMock,
  getPublicCcmSessionByTokenMock,
  evaluateAvailabilityMock,
  hasTenantBackendEnvMock,
  hasTenantAdminBackendEnvMock,
  shouldUseLocalTenantFallbackMock,
  queryTenantLocalDbMock,
  hasTenantDbUrlMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  headersMock: vi.fn(),
  getPublicCcmSessionByTokenMock: vi.fn(),
  evaluateAvailabilityMock: vi.fn(),
  hasTenantBackendEnvMock: vi.fn(),
  hasTenantAdminBackendEnvMock: vi.fn(),
  shouldUseLocalTenantFallbackMock: vi.fn(),
  queryTenantLocalDbMock: vi.fn(),
  hasTenantDbUrlMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("@/lib/ccm-public-data", () => ({
  getPublicCcmSessionByToken: getPublicCcmSessionByTokenMock,
  evaluatePublicCcmSessionAvailability: evaluateAvailabilityMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantAdminClient: vi.fn(),
  hasTenantAdminBackendEnv: hasTenantAdminBackendEnvMock,
  hasTenantBackendEnv: hasTenantBackendEnvMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

vi.mock("@/lib/supabase/config", () => ({
  hasTenantDbUrl: hasTenantDbUrlMock,
}));

import { submitPublicChildCheckoutAction } from "@/app/portal/children/actions";

describe("submitPublicChildCheckoutAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    headersMock.mockResolvedValue({
      get: vi.fn((key: string) => {
        if (key === "x-forwarded-for") return "127.0.0.1";
        if (key === "user-agent") return "vitest";
        return null;
      }),
    });

    hasTenantBackendEnvMock.mockReturnValue(true);
    hasTenantAdminBackendEnvMock.mockReturnValue(true);
    hasTenantDbUrlMock.mockReturnValue(true);
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);

    getPublicCcmSessionByTokenMock.mockResolvedValue({
      churchId: "church-1",
      serviceId: "service-1",
      ministryId: "ministry-1",
      churchName: "Grace Harbor",
      serviceName: "Sunday Children",
      serviceDate: "2026-05-27",
      serviceStatus: "open",
      sessionStatus: "enabled",
      sessionStartsAt: null,
      sessionEndsAt: null,
      sessionEnabledAt: "2026-05-27T09:00:00.000Z",
      token: "token-1",
    });

    evaluateAvailabilityMock.mockReturnValue({
      state: "available",
      title: "available",
      detail: "available",
    });
  });

  it("requires guardian verification name", async () => {
    const result = await submitPublicChildCheckoutAction({
      token: "token-1",
      sessionId: "session-1",
      providedPin: "123456",
      releasedToName: "Parent",
      guardianName: "",
    });

    expect(result).toEqual({
      ok: false,
      error: "Checkout requires child, claim token, guardian name, and release name.",
    });
  });

  it("rejects pickup-code verification when child profile is unavailable", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ attempts: 0 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            child_name: "Ada Child",
            child_profile_id: null,
            guardian_name: "Ada Guardian",
            status: "checked_in",
            pin_hash: "hash",
            qr_token: "qr-1",
          },
        ],
      })
      .mockResolvedValue({ rows: [] });

    const result = await submitPublicChildCheckoutAction({
      token: "token-1",
      sessionId: "session-1",
      providedPin: "PICKUP123",
      releasedToName: "Ada Guardian",
      guardianName: "Ada Guardian",
      verificationMethod: "pickup_code",
    });

    expect(result).toEqual({
      ok: false,
      error: "Pickup code verification is unavailable for this child session.",
    });
  });
});
