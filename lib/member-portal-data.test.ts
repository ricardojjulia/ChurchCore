import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  hasTenantBackendEnvMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  resolveActiveChurchProfileIdMock,
} = vi.hoisted(() => {
  const hasTenantBackendEnv = vi.fn();
  const queryTenantLocalDb = vi.fn();
  const shouldUseLocalTenantFallback = vi.fn();
  const resolveActiveChurchProfileId = vi.fn();

  return {
    hasTenantBackendEnvMock: hasTenantBackendEnv,
    queryTenantLocalDbMock: queryTenantLocalDb,
    shouldUseLocalTenantFallbackMock: shouldUseLocalTenantFallback,
    resolveActiveChurchProfileIdMock: resolveActiveChurchProfileId,
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/church-profile", () => ({
  resolveActiveChurchProfileId: resolveActiveChurchProfileIdMock,
}));

vi.mock("@/lib/portal", () => ({
  getPortalRole: vi.fn(() => ({ timeline: [] })),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  createTenantServerClient: vi.fn(),
  hasTenantBackendEnv: hasTenantBackendEnvMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
}));

import type { ChurchAppSession } from "@/lib/auth";
import { getMemberPortalData } from "@/lib/member-portal-data";

const session = {
  userId: "user-1",
  source: "supabase",
  profile: {
    id: "profile-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    title: "Member",
  },
  appContext: {
    kind: "church",
    roleId: "member",
    church: {
      id: "church-1",
      slug: "grace",
      name: "Grace Harbor",
      timezone: "America/Detroit",
    },
    source: "membership",
    homePath: "/app/member",
  },
} as ChurchAppSession;

describe("getMemberPortalData pending-review status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasTenantBackendEnvMock.mockReturnValue(true);
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
    resolveActiveChurchProfileIdMock.mockResolvedValue("profile-1");
  });

  it("maps latest profile and family review states from member change requests", async () => {
    queryTenantLocalDbMock.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.profiles profile")) {
        return {
          rows: [
            {
              id: "profile-1",
              full_name: "Ada Lovelace",
              member_number: null,
              email: "ada@example.com",
              phone: null,
              address: null,
              display_title: "Member",
              role: "member_volunteer",
              is_pastoral: false,
              membership_status: "active",
              joined_date: null,
              directory_visible: true,
              contact_allowed: true,
              preferred_contact_method: "email",
              interests: ["hospitality"],
              emergency_contact_name: "Grace",
              emergency_contact_phone: "555-0101",
              family_id: "family-1",
              family_name: "Lovelace",
            },
          ],
        };
      }

      if (sql.includes("from public.profile_ministries profile_ministry") && sql.includes("where profile_ministry.profile_id = $1")) {
        return { rows: [] };
      }

      if (sql.includes("from public.events event")) {
        return { rows: [] };
      }

      if (sql.includes("from public.profiles profile") && sql.includes("directory_visible = true")) {
        return { rows: [] };
      }

      if (sql.includes("where id = $1") && sql.includes("from public.families")) {
        return {
          rows: [
            {
              id: "family-1",
              family_name: "Lovelace",
              address: "123 Main",
              home_phone: "555-0100",
            },
          ],
        };
      }

      if (sql.includes("where family_id = $1") && sql.includes("from public.profiles")) {
        return {
          rows: [
            { id: "profile-1", full_name: "Ada Lovelace", display_title: "Member" },
          ],
        };
      }

      if (sql.includes("from public.attendance")) {
        return { rows: [] };
      }

      if (sql.includes("from public.event_rosters")) {
        return { rows: [] };
      }

      if (sql.includes("from public.notification_preferences")) {
        return { rows: [] };
      }

      if (sql.includes("from public.member_change_requests")) {
        return {
          rows: [
            {
              change_type: "profile",
              status: "pending",
              reviewer_note: null,
            },
            {
              change_type: "family",
              status: "rejected",
              reviewer_note: "Please include full home phone.",
            },
          ],
        };
      }

      if (sql.includes("from public.profile_ministries profile_ministry") && sql.includes("any($1::uuid[])")) {
        return { rows: [] };
      }

      return { rows: [] };
    });

    const data = await getMemberPortalData(session);

    expect(data.profileChangeStatus).toBe("pending");
    expect(data.profileChangeReviewerNote).toBeNull();
    expect(data.familyChangeStatus).toBe("rejected");
    expect(data.familyChangeReviewerNote).toBe("Please include full home phone.");
  });

  it("loads giving summary with YTD total and gift count", async () => {
    queryTenantLocalDbMock.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.profiles profile")) {
        return {
          rows: [
            {
              id: "profile-1",
              full_name: "Ada Lovelace",
              member_number: null,
              email: "ada@example.com",
              phone: null,
              address: null,
              display_title: "Member",
              role: "member_volunteer",
              is_pastoral: false,
              membership_status: "active",
              joined_date: null,
              directory_visible: true,
              contact_allowed: true,
              preferred_contact_method: "email",
              interests: [],
              emergency_contact_name: null,
              emergency_contact_phone: null,
              family_id: null,
              family_name: null,
            },
          ],
        };
      }
      if (sql.includes("coalesce(sum(amount_cents)")) {
        return { rows: [{ total_cents: "12500", gift_count: "3" }] };
      }
      return { rows: [] };
    });

    const data = await getMemberPortalData(session);

    expect(data.givingSummary).toEqual({ totalCents: 12500, giftCount: 3 });
  });

  it("returns null giving summary when no gifts found", async () => {
    queryTenantLocalDbMock.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.profiles profile")) {
        return {
          rows: [
            {
              id: "profile-1",
              full_name: "Ada Lovelace",
              member_number: null,
              email: null,
              phone: null,
              address: null,
              display_title: null,
              role: "member_volunteer",
              is_pastoral: false,
              membership_status: "active",
              joined_date: null,
              directory_visible: true,
              contact_allowed: true,
              preferred_contact_method: null,
              interests: [],
              emergency_contact_name: null,
              emergency_contact_phone: null,
              family_id: null,
              family_name: null,
            },
          ],
        };
      }
      if (sql.includes("coalesce(sum(amount_cents)")) {
        return { rows: [{ total_cents: "0", gift_count: "0" }] };
      }
      return { rows: [] };
    });

    const data = await getMemberPortalData(session);

    expect(data.givingSummary).toBeNull();
  });

  it("loads my groups with active memberships", async () => {
    queryTenantLocalDbMock.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.profiles profile")) {
        return {
          rows: [
            {
              id: "profile-1",
              full_name: "Ada Lovelace",
              member_number: null,
              email: "ada@example.com",
              phone: null,
              address: null,
              display_title: "Member",
              role: "member_volunteer",
              is_pastoral: false,
              membership_status: "active",
              joined_date: null,
              directory_visible: true,
              contact_allowed: true,
              preferred_contact_method: "email",
              interests: [],
              emergency_contact_name: null,
              emergency_contact_phone: null,
              family_id: null,
              family_name: null,
            },
          ],
        };
      }
      if (sql.includes("from public.group_members gm")) {
        return {
          rows: [
            { role: "leader", group_id: "group-1", group_name: "Men's Bible Study" },
            { role: "member", group_id: "group-2", group_name: "Sunday School" },
          ],
        };
      }
      return { rows: [] };
    });

    const data = await getMemberPortalData(session);

    expect(data.myGroups).toHaveLength(2);
    expect(data.myGroups[0]).toEqual({ id: "group-1", name: "Men's Bible Study", role: "leader" });
  });

  it("returns empty my groups when group_members table is unavailable", async () => {
    queryTenantLocalDbMock.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.profiles profile")) {
        return {
          rows: [
            {
              id: "profile-1",
              full_name: "Ada Lovelace",
              member_number: null,
              email: null,
              phone: null,
              address: null,
              display_title: null,
              role: "member_volunteer",
              is_pastoral: false,
              membership_status: "active",
              joined_date: null,
              directory_visible: true,
              contact_allowed: true,
              preferred_contact_method: null,
              interests: [],
              emergency_contact_name: null,
              emergency_contact_phone: null,
              family_id: null,
              family_name: null,
            },
          ],
        };
      }
      if (sql.includes("from public.group_members gm")) {
        throw new Error('relation "public.group_members" does not exist');
      }
      return { rows: [] };
    });

    const data = await getMemberPortalData(session);

    expect(data.myGroups).toEqual([]);
  });

  it("derives attendance trend from attendance history records", async () => {
    queryTenantLocalDbMock.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.profiles profile")) {
        return {
          rows: [
            {
              id: "profile-1",
              full_name: "Ada Lovelace",
              member_number: null,
              email: null,
              phone: null,
              address: null,
              display_title: null,
              role: "member_volunteer",
              is_pastoral: false,
              membership_status: "active",
              joined_date: null,
              directory_visible: true,
              contact_allowed: true,
              preferred_contact_method: null,
              interests: [],
              emergency_contact_name: null,
              emergency_contact_phone: null,
              family_id: null,
              family_name: null,
            },
          ],
        };
      }
      if (sql.includes("from public.attendance attendance")) {
        return {
          rows: [
            { id: "att-1", checked_in_at: "2026-07-06T10:00:00Z", status: "present", check_in_method: "staff", event_title: "Sunday Service" },
            { id: "att-2", checked_in_at: "2026-06-29T10:00:00Z", status: "present", check_in_method: "staff", event_title: "Sunday Service" },
          ],
        };
      }
      return { rows: [] };
    });

    const data = await getMemberPortalData(session);

    expect(data.attendanceTrend).toHaveLength(2);
    expect(data.attendanceTrend[0]).toEqual({ serviceDate: "2026-07-06T10:00:00Z" });
  });

  it("falls back to no review state when change-request table is unavailable", async () => {
    queryTenantLocalDbMock.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.profiles profile")) {
        return {
          rows: [
            {
              id: "profile-1",
              full_name: "Ada Lovelace",
              member_number: null,
              email: "ada@example.com",
              phone: null,
              address: null,
              display_title: "Member",
              role: "member_volunteer",
              is_pastoral: false,
              membership_status: "active",
              joined_date: null,
              directory_visible: true,
              contact_allowed: true,
              preferred_contact_method: "email",
              interests: [],
              emergency_contact_name: null,
              emergency_contact_phone: null,
              family_id: null,
              family_name: null,
            },
          ],
        };
      }

      if (sql.includes("from public.member_change_requests")) {
        throw new Error("relation \"public.member_change_requests\" does not exist");
      }

      return { rows: [] };
    });

    const data = await getMemberPortalData(session);

    expect(data.profileChangeStatus).toBe("none");
    expect(data.familyChangeStatus).toBe("none");
  });
});
