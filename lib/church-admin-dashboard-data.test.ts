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

import { getChurchAdminDashboardSummary } from "@/lib/church-admin-dashboard-data";
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

describe("getChurchAdminDashboardSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasTenantBackendEnvMock.mockReturnValue(true);
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
  });

  it("returns preview summary when no tenant backend is configured", async () => {
    hasTenantBackendEnvMock.mockReturnValue(false);

    const summary = await getChurchAdminDashboardSummary(session);

    expect(summary.source).toBe("preview");
    expect(summary.people.active).toBe(0);
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
  });

  it("loads aggregate dashboard counts from local tenant fallback", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({
      rows: [
        {
          active_people: 8,
          visitor_count: 2,
          incomplete_profiles: 1,
          ministry_count: 5,
          ministries_without_leader: 1,
          ministry_assignments: 14,
          upcoming_events: 4,
          next_14_day_events: 3,
          events_without_roster: 2,
          giving_last_30_cents: 125000,
          giving_last_30_count: 9,
          latest_gift_at: "2026-05-06T12:00:00.000Z",
        },
      ],
    });

    const summary = await getChurchAdminDashboardSummary(session);

    expect(summary).toEqual({
      source: "live",
      people: { active: 8, visitors: 2, incomplete: 1 },
      ministries: { total: 5, withoutLeader: 1, assignments: 14 },
      events: { upcoming: 4, next14Days: 3, withoutRoster: 2 },
      giving: {
        last30DaysCents: 125000,
        giftCount: 9,
        latestGiftAt: "2026-05-06T12:00:00.000Z",
      },
    });
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("from public.profiles"),
      ["church-1"],
    );
  });
});
