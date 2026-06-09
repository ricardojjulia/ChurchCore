import { describe, it, expect, vi, beforeEach } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";

// ── Mock server-only and Next.js ──────────────────────────────────────────────
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// ── Hoist all mocks that need to be referenced in vi.mock factories ───────────
const { requireChurchSessionMock, logAuditEventMock } = vi.hoisted(() => ({
  requireChurchSessionMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock audit logging ────────────────────────────────────────────────────────
vi.mock("@/lib/actions/audit", () => ({
  logAuditEvent: logAuditEventMock,
}));

// ── Mock Supabase tenant ──────────────────────────────────────────────────────
vi.mock("@/lib/supabase/tenant", () => ({
  createTenantAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "assignment-1",
              tenant_id: "church-1",
              locale_id: "locale-en-1",
              reviewer_id: "reviewer-1",
              reviewer_role: "linguistic",
              assigned_by: "admin-1",
              created_at: new Date().toISOString(),
            },
            error: null,
          }),
        }),
      }),
    }),
  }),
  createTenantServerClient: vi.fn(),
  hasTenantBackendEnv: vi.fn().mockReturnValue(false),
  shouldUseLocalTenantFallback: vi.fn().mockReturnValue(false),
}));

// ── Mock requireChurchSession ─────────────────────────────────────────────────
vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
  isChurchAppContext: vi.fn().mockReturnValue(true),
}));

import type { ChurchAppSession } from "@/lib/auth";

function makeSession(roleId: string, churchId = "church-1"): ChurchAppSession {
  return {
    userId: `user-${roleId}`,
    source: "supabase",
    appContext: {
      kind: "church",
      roleId: roleId as never,
      church: {
        id: churchId,
        name: "Test Church",
        slug: "test",
        timezone: "UTC",
      },
      source: "membership",
      homePath: `/app/${roleId}`,
    },
    profile: {
      id: `user-${roleId}`,
      name: "Test",
      email: "test@test.com",
      title: roleId,
      roleId: roleId as never,
      defaultPath: `/app/${roleId}`,
      focus: "",
      isPastoral: false,
    },
    homePath: `/app/${roleId}`,
    canAccessControl: false,
    memberships: [],
    tenantViews: [],
  };
}

// ── Build a test service using filesystem storage ─────────────────────────────
// @ts-expect-error — ESM package
import { createGovernanceService } from "@localization-governance/core";
// @ts-expect-error — ESM package
import { createFilesystemStorage } from "@localization-governance/storage-filesystem";

const ACTOR = { id: "admin-1", role: "church-admin" };

async function makeTestService(dir: string) {
  const storage = await createFilesystemStorage({ directory: dir });
  return createGovernanceService({ storage });
}

// ── These need to be closures; the adapter mock references testService ────────
let testTmpDir = "";
let testService: ReturnType<typeof createGovernanceService>;

vi.mock("@/lib/localization-governance/adapter", () => ({
  createChurchAdapter: () => ({
    churchId: "church-1",
    get service() {
      return testService;
    },
    getLocaleStatus: (code: string) => testService.getLocaleStatus(code),
    listLocales: () => Promise.resolve([]),
    createLocale: (params: Record<string, unknown>) =>
      testService.createLocale(params as never),
    createCatalogVersion: (params: Record<string, unknown>) =>
      testService.createCatalogVersion(params as never),
    translateVersion: (params: Record<string, unknown>) =>
      testService.translateVersion(params as never),
    validateVersion: (params: Record<string, unknown>) =>
      testService.validateVersion(params as never),
    requestReview: (params: Record<string, unknown>) =>
      testService.requestReview(params as never),
    submitReview: (params: Record<string, unknown>) =>
      testService.submitReview(params as never),
    approveVersion: (params: Record<string, unknown>) =>
      testService.approveVersion(params as never),
    activateVersion: (params: Record<string, unknown>) =>
      testService.activateVersion(params as never),
    rollbackVersion: (params: { locale: string; toVersionId: string; actor: typeof ACTOR }) =>
      testService.rollbackLocale({
        locale: params.locale,
        toVersionId: params.toVersionId,
        actor: params.actor,
      }),
    evaluateCiPolicy: (params?: { requiredLocales?: string[] }) =>
      testService.evaluateCiPolicy(params),
    assignReviewer: (params: {
      localeId: string;
      reviewerId: string;
      reviewerRole: string;
      assignedBy: string;
    }) =>
      Promise.resolve({
        id: "assignment-1",
        tenantId: "church-1",
        localeId: params.localeId,
        reviewerId: params.reviewerId,
        reviewerRole: params.reviewerRole,
        assignedBy: params.assignedBy,
        createdAt: new Date().toISOString(),
      }),
    getReviewerAssignments: () => Promise.resolve([]),
  }),
}));

// ── Import actions after all mocks are set up ─────────────────────────────────
import {
  getLocalizationStatus,
  createLocale,
  activateVersion,
  approveVersion,
  translateVersion,
} from "@/app/app/church-admin/localization/actions";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("localization server actions", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    logAuditEventMock.mockResolvedValue(undefined);
    testTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "locgov-actions-"));
    testService = await makeTestService(testTmpDir);

    // Pre-seed en locale for most tests
    await testService.createLocale({
      code: "en",
      sourceLocale: "en",
      actor: ACTOR,
    });
    await testService.createCatalogVersion({
      locale: "en",
      messages: { hello: "Hello", world: "World" },
      actor: ACTOR,
      source: true,
    });
  });

  it("getLocalizationStatus returns status for a known locale", async () => {
    requireChurchSessionMock.mockResolvedValueOnce(makeSession("church-admin"));

    const result = await getLocalizationStatus("en");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.code).toBe("en");
      expect(result.data.versions.length).toBeGreaterThan(0);
    }
  });

  it("createLocale creates a locale and calls logAuditEvent", async () => {
    requireChurchSessionMock.mockResolvedValueOnce(makeSession("church-admin"));

    const result = await createLocale({ code: "es", sourceLocale: "en" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.code).toBe("es");
    }
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: "localization_locales",
        operation: "INSERT",
        churchId: "church-1",
        newValues: expect.objectContaining({ code: "es" }),
      }),
    );
  });

  it("translateVersion with no GOOGLE_TRANSLATE_API_KEY returns graceful error", async () => {
    const savedKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    delete process.env.GOOGLE_TRANSLATE_API_KEY;

    requireChurchSessionMock.mockResolvedValueOnce(makeSession("church-admin"));

    const result = await translateVersion({
      versionId: "some-version-id",
      provider: "google",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("provider_not_configured");
    }

    if (savedKey !== undefined) {
      process.env.GOOGLE_TRANSLATE_API_KEY = savedKey;
    }
  });

  it("approveVersion by non-admin returns insufficient_role error", async () => {
    requireChurchSessionMock.mockResolvedValueOnce(makeSession("pastor"));

    const result = await approveVersion({ versionId: "some-version-id" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("insufficient_role");
    }
  });

  it("activateVersion by non-admin returns insufficient_role", async () => {
    requireChurchSessionMock.mockResolvedValueOnce(makeSession("ministry-leader"));

    const result = await activateVersion({ versionId: "fake-id" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("insufficient_role");
    }
  });

  it("getLocalizationStatus by member-role succeeds (read access)", async () => {
    requireChurchSessionMock.mockResolvedValueOnce(makeSession("member"));

    const result = await getLocalizationStatus("en");

    expect(result.ok).toBe(true);
  });
});
