import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  hasTenantBackendEnvMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
} = vi.hoisted(() => {
  const hasTenantBackendEnv = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();

  return {
    hasTenantBackendEnvMock: hasTenantBackendEnv,
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/shepherd-ai/ops-data", () => ({
  getMemberShepherdInsights: vi.fn(async () => new Map()),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: vi.fn(),
  hasTenantBackendEnv: hasTenantBackendEnvMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

import type { ChurchAppSession } from "@/lib/auth";
import { getChurchAdminPeopleData } from "@/lib/church-admin-people-data";

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

describe("getChurchAdminPeopleData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasTenantBackendEnvMock.mockReturnValue(true);
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
  });

  it("adds pending account request context to people records", async () => {
    queryTenantLocalDbMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "profile-1",
            full_name: "Ada Lovelace",
            email: "ada@example.com",
            phone: null,
            address: null,
            display_title: null,
            role: "member_volunteer",
            membership_status: "visitor",
            member_number: null,
            account_status: "pending",
            directory_visible: true,
            contact_allowed: true,
            preferred_contact_method: "email",
            emergency_contact_name: null,
            emergency_contact_phone: null,
            family_name: "Lovelace household",
            family_id: "family-1",
          },
          {
            id: "profile-2",
            full_name: "Grace Hopper",
            email: "grace@example.com",
            phone: "555-0100",
            address: null,
            display_title: null,
            role: "member_volunteer",
            membership_status: "active",
            member_number: "GH-0002",
            account_status: "active",
            directory_visible: true,
            contact_allowed: true,
            preferred_contact_method: "email",
            emergency_contact_name: "Emergency Contact",
            emergency_contact_phone: "555-0101",
            family_name: null,
            family_id: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "family-1", family_name: "Lovelace household" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "request-1",
            profile_id: "profile-1",
            email: "ada@example.com",
            created_at: "2026-05-08T12:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const data = await getChurchAdminPeopleData(session);

    expect(data.summary.pendingAccountRequests).toBe(1);
    expect(data.summary.familyCount).toBe(1);
    expect(data.summary.unassignedHouseholdCount).toBe(1);
    expect(data.people[0]).toMatchObject({
      id: "profile-1",
      familyId: "family-1",
      familyName: "Lovelace household",
      memberNumber: null,
      accountStatus: "pending",
      pendingAccountRequestId: "request-1",
      pendingAccountRequestCreatedAt: "2026-05-08T12:00:00.000Z",
    });
    expect(data.people[1]).toMatchObject({
      id: "profile-2",
      familyId: null,
      familyName: null,
      memberNumber: "GH-0002",
      accountStatus: "active",
      pendingAccountRequestId: null,
    });
  });
});
