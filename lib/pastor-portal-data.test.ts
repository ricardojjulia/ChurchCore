import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  logAuditEventMock,
  queryTenantLocalDbMock,
  shouldUseLocalTenantFallbackMock,
  hasTenantBackendEnvMock,
} = vi.hoisted(() => ({
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  queryTenantLocalDbMock: vi.fn(),
  shouldUseLocalTenantFallbackMock: vi.fn(),
  hasTenantBackendEnvMock: vi.fn(),
}));

vi.mock("@/lib/actions/audit", () => ({
  logAuditEvent: logAuditEventMock,
}));

vi.mock("@/lib/supabase/tenant", () => ({
  hasTenantBackendEnv: hasTenantBackendEnvMock,
  shouldUseLocalTenantFallback: shouldUseLocalTenantFallbackMock,
  queryTenantLocalDb: queryTenantLocalDbMock,
  createTenantServerClient: vi.fn(),
}));

vi.mock("@/lib/crypto/pastoral", () => ({
  decryptPastoralField: (content: string) => content,
}));

import { getPastorPortalData } from "@/lib/pastor-portal-data";
import type { ChurchAppSession } from "@/lib/auth";

describe("getPastorPortalData read auditing", () => {
  const mockSession: ChurchAppSession = {
    userId: "user-1",
    profile: {
      id: "profile-1",
      name: "Pastor Bob",
      email: "bob@example.com",
      title: "Pastor",
      roleId: "pastor",
      defaultPath: "/app/pastor",
      focus: "Leadership",
      isPastoral: true,
    },
    appContext: {
      kind: "church",
      source: "membership",
      roleId: "pastor",
      church: { id: "church-1", name: "Church 1", slug: "church-1", timezone: "America/New_York" },
      homePath: "/app/pastor",
    },
    homePath: "/app/pastor",
    canAccessControl: false,
    memberships: [],
    tenantViews: [],
    source: "supabase",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    hasTenantBackendEnvMock.mockReturnValue(true);
    shouldUseLocalTenantFallbackMock.mockReturnValue(true);
  });

  it("should log READ_PASTORAL audit events for unique profile IDs in retrieved pastoral notes", async () => {
    // 1. Profile query mock
    queryTenantLocalDbMock.mockResolvedValueOnce({
      rows: [{ id: "profile-1", full_name: "Pastor Bob", email: "bob@example.com", phone: null, display_title: "Pastor", is_pastoral: true, membership_status: "active" }]
    });

    // 2. People query mock
    queryTenantLocalDbMock.mockResolvedValueOnce({
      rows: []
    });

    // 3. Pastoral Notes query mock: retrieve 3 notes, targeting 2 unique profiles
    queryTenantLocalDbMock.mockResolvedValueOnce({
      rows: [
        { id: "note-1", profile_id: "target-profile-A", content: "Note A1", created_at: "2026-06-20T12:00:00Z", created_by_name: "Pastor Bob" },
        { id: "note-2", profile_id: "target-profile-B", content: "Note B1", created_at: "2026-06-20T12:05:00Z", created_by_name: "Pastor Bob" },
        { id: "note-3", profile_id: "target-profile-A", content: "Note A2", created_at: "2026-06-20T12:10:00Z", created_by_name: "Pastor Bob" },
      ]
    });

    // 4. Care Assignments query mock
    queryTenantLocalDbMock.mockResolvedValueOnce({
      rows: []
    });

    // 5. Led Ministries query mock
    queryTenantLocalDbMock.mockResolvedValueOnce({
      rows: []
    });

    const data = await getPastorPortalData(mockSession);

    expect(data.pastoralNotes).toHaveLength(3);

    // Should call logAuditEvent for target-profile-A and target-profile-B (once each)
    expect(logAuditEventMock).toHaveBeenCalledTimes(2);

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: "pastoral_notes",
        recordId: "target-profile-A",
        operation: "READ_PASTORAL",
        actorId: "profile-1",
        churchId: "church-1",
        actorRole: "pastor",
      })
    );

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: "pastoral_notes",
        recordId: "target-profile-B",
        operation: "READ_PASTORAL",
        actorId: "profile-1",
        churchId: "church-1",
        actorRole: "pastor",
      })
    );
  });
});
