import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createTenantServerClientMock,
  hasTenantBackendEnvMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
} = vi.hoisted(() => {
  const createTenantServerClient = vi.fn();
  const hasTenantBackendEnv = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();

  return {
    createTenantServerClientMock: createTenantServerClient,
    hasTenantBackendEnvMock: hasTenantBackendEnv,
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: createTenantServerClientMock,
  hasTenantBackendEnv: hasTenantBackendEnvMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

import { getChurchAdminOperationsData } from "@/lib/church-admin-operations-data";
import type { ChurchAppSession } from "@/lib/auth";

const session = {
  source: "supabase",
  appContext: {
    kind: "church",
    roleId: "church-admin",
    church: { id: "church-1", name: "Grace Harbor", slug: "grace", timezone: "America/Detroit" },
    source: "membership",
    homePath: "/app/church-admin",
  },
} as ChurchAppSession;

describe("getChurchAdminOperationsData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasTenantBackendEnvMock.mockReturnValue(true);
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
  });

  it("returns preview operations when no tenant backend is configured", async () => {
    hasTenantBackendEnvMock.mockReturnValue(false);

    const data = await getChurchAdminOperationsData(session);

    expect(data).toEqual({ source: "preview", weekendItems: [] });
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
  });

  it("builds weekend operations from actionable upcoming events", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({
      rows: [
        {
          id: "event-1",
          title: "Sunday Service",
          starts_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          location: "Sanctuary",
          approval_status: "pending",
          roster_count: 0,
          registration_count: 20,
          waitlist_count: 0,
          capacity: 100,
          registration_open: true,
        },
        {
          id: "event-2",
          title: "Later Training",
          starts_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          location: null,
          approval_status: "approved",
          roster_count: 3,
          registration_count: 8,
          waitlist_count: 0,
          capacity: 40,
          registration_open: true,
        },
      ],
    });

    const data = await getChurchAdminOperationsData(session);

    expect(data.source).toBe("live");
    expect(data.weekendItems).toHaveLength(1);
    expect(data.weekendItems[0]).toMatchObject({
      id: "event-event-1",
      eventId: "event-1",
      title: "Sunday Service",
      status: "blocked",
      href: "/app/church-admin/events/event-1",
      badges: expect.arrayContaining(["pending", "no roster", "next 14 days"]),
    });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("from public.events event"),
      ["church-1"],
    );
  });
});
