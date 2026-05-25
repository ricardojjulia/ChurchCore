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

import {
  buildChurchAdminReadinessItems,
  getChurchAdminReadinessData,
} from "@/lib/church-admin-readiness-data";
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

const clearMetricRow = {
  missing_settings: 0,
  pending_account_requests: 0,
  incomplete_profiles: 0,
  unassigned_households: 0,
  upcoming_events: 2,
  events_without_roster: 0,
  open_ccm_services: 1,
  ccm_volunteers: 4,
  ccm_followups: 0,
  open_volunteer_shifts: 0,
  unassigned_volunteer_shifts: 0,
  failed_donations: 0,
  unposted_donations: 0,
  draft_journals: 0,
  live_giving_pages: 1,
  open_workflows: 0,
};

describe("church admin readiness data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasTenantBackendEnvMock.mockReturnValue(true);
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
  });

  it("returns preview readiness summaries with contract metadata when no backend is configured", async () => {
    hasTenantBackendEnvMock.mockReturnValue(false);

    const data = await getChurchAdminReadinessData(session);

    expect(data.source).toBe("preview");
    expect(data.items[0]).toMatchObject({
      id: "church-setup",
      module: "setup",
      severity: "notice",
      issueCount: 1,
      completionState: "unavailable",
      target: { route: "/app/church-admin/settings" },
      href: "/app/church-admin/settings",
    });
    expect(queryTenantLocalDbMock).not.toHaveBeenCalled();
  });

  it("builds route targets, issue counts, and recommended actions from readiness metrics", () => {
    const items = buildChurchAdminReadinessItems({
      ...clearMetricRow,
      incomplete_profiles: 2,
      unassigned_households: 1,
      failed_donations: 1,
      draft_journals: 2,
      live_giving_pages: 0,
    });

    const people = items.find((item) => item.id === "people-households");
    const money = items.find((item) => item.id === "giving-finance");

    expect(people).toMatchObject({
      status: "attention",
      severity: "warning",
      issueCount: 3,
      completionState: "needs_review",
      target: {
        route: "/app/church-admin/people",
        query: { view: "unassigned-households", household: "unassigned" },
      },
      href: "/app/church-admin/people?view=unassigned-households&household=unassigned",
    });
    expect(money).toMatchObject({
      status: "blocked",
      severity: "critical",
      issueCount: 4,
      recommendedAction: expect.stringContaining("Open giving and finance exceptions"),
      href: "/app/church-admin/giving?view=exceptions",
    });
  });

  it("loads local fallback metrics into the shared readiness contract", async () => {
    queryTenantLocalDbMock.mockResolvedValueOnce({ rows: [clearMetricRow] });

    const data = await getChurchAdminReadinessData(session);

    expect(data.source).toBe("live");
    expect(data.blockedCount).toBe(0);
    expect(data.attentionCount).toBe(0);
    expect(data.readyCount).toBe(8);
    expect(data.items.every((item) => item.completionState === "complete")).toBe(true);
    expect(queryTenantLocalDbMock).toHaveBeenCalledWith(
      expect.stringContaining("with"),
      ["church-1"],
    );
  });
});
