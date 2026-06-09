import "server-only";

// @ts-expect-error — no .d.ts; types in ./types.ts
import { createGovernanceService } from "@localization-governance/core";
// @ts-expect-error — no .d.ts; types in ./types.ts
import { createPostgresStorage } from "@localization-governance/storage-postgres";
// @ts-expect-error — no .d.ts; types in ./types.ts
import { createGoogleTranslationProvider } from "@localization-governance/provider-google";

import { createTenantAdminClient } from "@/lib/supabase/tenant";
import { getLocgovPool } from "@/lib/localization-governance/pg-client";
import type {
  ChurchGovernanceAdapter,
  GovernanceActor,
  GovernanceService,
  LocaleRecord,
  LocaleStatus,
  CatalogVersion,
  ValidationReport,
  ReviewDecision,
  ReviewAssignment,
  CiPolicyResult,
} from "@/lib/localization-governance/types";

// ── Factory ──────────────────────────────────────────────────────────────────

export function createChurchAdapter(churchId: string): ChurchGovernanceAdapter {
  const pool = getLocgovPool();
  const storage = createPostgresStorage({ client: pool, tenantId: churchId });

  const providers: Record<string, unknown> = {};
  if (process.env.GOOGLE_TRANSLATE_API_KEY) {
    providers.google = createGoogleTranslationProvider({
      apiKey: process.env.GOOGLE_TRANSLATE_API_KEY,
    });
  }

  const service: GovernanceService = createGovernanceService({
    storage,
    providers,
    // Override default prefix-based IDs (e.g. "locale-{uuid}") so all IDs are
    // bare UUIDs, compatible with the `uuid` column type in the migration.
    idGenerator: () => crypto.randomUUID(),
  });

  // ── Review assignments (managed directly — not via storage adapter) ────────

  async function assignReviewer(params: {
    localeId: string;
    reviewerId: string;
    reviewerRole: string;
    assignedBy: string;
  }): Promise<ReviewAssignment> {
    const supabase = createTenantAdminClient();
    const { data, error } = await supabase
      .from("localization_review_assignments")
      .upsert(
        {
          tenant_id: churchId,
          locale_id: params.localeId,
          reviewer_id: params.reviewerId,
          reviewer_role: params.reviewerRole,
          assigned_by: params.assignedBy,
        },
        { onConflict: "tenant_id,locale_id,reviewer_role,reviewer_id" },
      )
      .select()
      .single();

    if (error) {
      throw new Error(`assignReviewer failed: ${error.message}`);
    }

    return {
      id: data.id,
      tenantId: data.tenant_id,
      localeId: data.locale_id,
      reviewerId: data.reviewer_id,
      reviewerRole: data.reviewer_role,
      assignedBy: data.assigned_by,
      createdAt: data.created_at,
    };
  }

  async function getReviewerAssignments(localeId: string): Promise<ReviewAssignment[]> {
    const supabase = createTenantAdminClient();
    const { data, error } = await supabase
      .from("localization_review_assignments")
      .select("*")
      .eq("tenant_id", churchId)
      .eq("locale_id", localeId);

    if (error) {
      throw new Error(`getReviewerAssignments failed: ${error.message}`);
    }

    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      tenantId: row.tenant_id as string,
      localeId: row.locale_id as string,
      reviewerId: row.reviewer_id as string,
      reviewerRole: row.reviewer_role as string,
      assignedBy: row.assigned_by as string,
      createdAt: row.created_at as string,
    }));
  }

  // ── Adapter public surface ────────────────────────────────────────────────

  const adapter: ChurchGovernanceAdapter = {
    churchId,
    service,

    async getLocaleStatus(code: string): Promise<LocaleStatus> {
      return service.getLocaleStatus(code);
    },

    async listLocales(): Promise<LocaleRecord[]> {
      return storage.listLocales();
    },

    async createLocale(params: {
      code: string;
      sourceLocale: string;
      actor: GovernanceActor;
    }): Promise<LocaleRecord> {
      return service.createLocale(params);
    },

    async createCatalogVersion(params: {
      locale: string;
      messages: Record<string, string>;
      actor: GovernanceActor;
      provenance?: Record<string, unknown>;
    }): Promise<CatalogVersion> {
      return service.createCatalogVersion(params);
    },

    async translateVersion(params: {
      versionId: string;
      provider?: string;
      actor: GovernanceActor;
      scope?: "missing" | "full";
      glossary?: Record<string, string>;
    }): Promise<CatalogVersion> {
      return service.translateVersion({
        versionId: params.versionId,
        provider: params.provider ?? "google",
        actor: params.actor,
        scope: params.scope ?? "full",
        glossary: params.glossary ?? {},
      });
    },

    async validateVersion(params: {
      versionId: string;
      actor: GovernanceActor;
      glossary?: Record<string, string>;
      untranslatedAllowlist?: string[];
    }): Promise<{ version: CatalogVersion; report: ValidationReport }> {
      return service.validateVersion(params);
    },

    async requestReview(params: {
      versionId: string;
      actor: GovernanceActor;
    }): Promise<CatalogVersion> {
      return service.requestReview(params);
    },

    async submitReview(params: {
      versionId: string;
      reviewer: GovernanceActor;
      decision: "approved" | "changes_requested";
      comment?: string;
    }): Promise<ReviewDecision> {
      // Verify reviewer has an assignment record before delegating to service.
      // The version belongs to a locale; retrieve the version to get localeId.
      const version: CatalogVersion = await service.getVersion(params.versionId);
      const assignments = await getReviewerAssignments(version.localeId);
      const hasAssignment = assignments.some(
        (a) =>
          a.reviewerId === params.reviewer.id &&
          a.reviewerRole === params.reviewer.role,
      );
      if (!hasAssignment) {
        throw Object.assign(
          new Error("Reviewer is not assigned to this locale."),
          { code: "reviewer_not_assigned" },
        );
      }
      return service.submitReview(params);
    },

    async approveVersion(params: {
      versionId: string;
      actor: GovernanceActor;
    }): Promise<CatalogVersion> {
      return service.approveVersion(params);
    },

    async activateVersion(params: {
      versionId: string;
      actor: GovernanceActor;
    }): Promise<CatalogVersion> {
      return service.activateVersion(params);
    },

    async rollbackVersion(params: {
      locale: string;
      toVersionId: string;
      actor: GovernanceActor;
    }): Promise<CatalogVersion> {
      return service.rollbackLocale({
        locale: params.locale,
        toVersionId: params.toVersionId,
        actor: params.actor,
      });
    },

    async evaluateCiPolicy(params?: {
      requiredLocales?: string[];
    }): Promise<CiPolicyResult> {
      return service.evaluateCiPolicy(params);
    },

    assignReviewer,
    getReviewerAssignments,
  };

  return adapter;
}
