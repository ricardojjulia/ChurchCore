/**
 * TypeScript type declarations for @localization-governance packages.
 * These packages ship no .d.ts files; this module provides types for
 * the ChurchCore integration.
 */

// ── Core domain types ─────────────────────────────────────────────────────────

export interface GovernanceActor {
  id: string;
  role: string;
}

export interface LocaleRecord {
  id: string;
  code: string;
  sourceLocale: string;
  policyId: string;
  activeVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogVersion {
  id: string;
  localeId: string;
  locale: string;
  version: number;
  sourceCatalogVersion: number;
  sourceContentHash: string;
  contentHash: string;
  state: VersionState;
  messages: Record<string, string>;
  provenance: Record<string, unknown>;
  createdBy: string;
  approvedBy?: string;
  activatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type VersionState =
  | "draft"
  | "translated"
  | "validated"
  | "in_linguistic_review"
  | "in_domain_review"
  | "approved"
  | "active"
  | "stale";

export interface ValidationReport {
  id: string;
  catalogVersionId: string;
  validatorVersion: string;
  contentHash: string;
  sourceContentHash: string;
  passed: boolean;
  coverage: number;
  checks: Record<string, unknown>;
  createdAt: string;
}

export interface ReviewDecision {
  id: string;
  catalogVersionId: string;
  contentHash: string;
  reviewerId: string;
  reviewerRole: string;
  decision: "approved" | "changes_requested";
  comment: string;
  createdAt: string;
}

export interface ReviewAssignment {
  id: string;
  tenantId: string;
  localeId: string;
  reviewerId: string;
  reviewerRole: string;
  assignedBy: string;
  createdAt: string;
}

export interface ActivationHistoryRecord {
  id: string;
  localeId: string;
  catalogVersionId: string;
  previousCatalogVersionId: string | null;
  action: "activate" | "rollback";
  actorId: string;
  createdAt: string;
}

export interface LocaleStatus {
  code: string;
  sourceLocale: string;
  activeVersionId: string | null;
  activeState: VersionState | null;
  versions: Omit<CatalogVersion, "messages">[];
}

export interface CiPolicyResult {
  passed: boolean;
  failures: Array<{
    code: string;
    locale: string;
  }>;
}

// ── Storage interface ─────────────────────────────────────────────────────────

export interface LocgovStorage {
  tenantId: string;
  transaction<T>(callback: (api: LocgovStorage) => Promise<T>): Promise<T>;
  getLocale(code: string): Promise<LocaleRecord | null>;
  saveLocale(locale: LocaleRecord): Promise<LocaleRecord>;
  listLocales(): Promise<LocaleRecord[]>;
  getVersion(id: string): Promise<CatalogVersion | null>;
  saveVersion(version: CatalogVersion): Promise<CatalogVersion>;
  updateVersion(version: CatalogVersion): Promise<CatalogVersion>;
  listVersions(localeId: string): Promise<CatalogVersion[]>;
  saveValidationReport(report: ValidationReport): Promise<ValidationReport>;
  getCurrentValidation(versionId: string): Promise<ValidationReport | null>;
  saveReview(review: ReviewDecision): Promise<ReviewDecision>;
  listReviews(versionId: string): Promise<ReviewDecision[]>;
  setActiveVersion(
    localeId: string,
    versionId: string,
    activationRecord: {
      id: string;
      localeId: string;
      catalogVersionId: string;
      previousCatalogVersionId: string | null;
      action: string;
      actorId: string;
      createdAt: string;
    },
  ): Promise<void>;
  listActivationHistory(localeId: string): Promise<ActivationHistoryRecord[]>;
}

// ── Governance service interface ──────────────────────────────────────────────

export interface GovernanceService {
  policy: Record<string, unknown>;
  createLocale(params: {
    code: string;
    sourceLocale: string;
    actor: GovernanceActor;
    policyId?: string;
  }): Promise<LocaleRecord>;
  createCatalogVersion(params: {
    locale: string;
    messages: Record<string, string>;
    actor: GovernanceActor;
    source?: boolean;
    provenance?: Record<string, unknown>;
  }): Promise<CatalogVersion>;
  translateVersion(params: {
    versionId: string;
    provider: string;
    actor: GovernanceActor;
    scope?: "missing" | "full";
    glossary?: Record<string, string>;
  }): Promise<CatalogVersion>;
  validateVersion(params: {
    versionId: string;
    actor: GovernanceActor;
    glossary?: Record<string, string>;
    untranslatedAllowlist?: string[];
  }): Promise<{ version: CatalogVersion; report: ValidationReport }>;
  requestReview(params: {
    versionId: string;
    actor: GovernanceActor;
  }): Promise<CatalogVersion>;
  submitReview(params: {
    versionId: string;
    reviewer: GovernanceActor;
    decision: "approved" | "changes_requested";
    comment?: string;
  }): Promise<ReviewDecision>;
  approveVersion(params: {
    versionId: string;
    actor: GovernanceActor;
  }): Promise<CatalogVersion>;
  activateVersion(params: {
    versionId: string;
    actor: GovernanceActor;
  }): Promise<CatalogVersion>;
  rollbackLocale(params: {
    locale: string;
    toVersionId: string;
    actor: GovernanceActor;
  }): Promise<CatalogVersion>;
  getLocaleStatus(code: string): Promise<LocaleStatus>;
  evaluateCiPolicy(params?: {
    requiredLocales?: string[];
  }): Promise<CiPolicyResult>;
  getVersion(id: string): Promise<CatalogVersion>;
}

// ── ChurchCore-specific adapter interface ─────────────────────────────────────

export interface ChurchGovernanceAdapter {
  churchId: string;
  service: GovernanceService;
  getLocaleStatus(code: string): Promise<LocaleStatus>;
  listLocales(): Promise<LocaleRecord[]>;
  createLocale(params: {
    code: string;
    sourceLocale: string;
    actor: GovernanceActor;
  }): Promise<LocaleRecord>;
  createCatalogVersion(params: {
    locale: string;
    messages: Record<string, string>;
    actor: GovernanceActor;
    provenance?: Record<string, unknown>;
  }): Promise<CatalogVersion>;
  translateVersion(params: {
    versionId: string;
    provider?: string;
    actor: GovernanceActor;
    scope?: "missing" | "full";
    glossary?: Record<string, string>;
  }): Promise<CatalogVersion>;
  validateVersion(params: {
    versionId: string;
    actor: GovernanceActor;
    glossary?: Record<string, string>;
    untranslatedAllowlist?: string[];
  }): Promise<{ version: CatalogVersion; report: ValidationReport }>;
  requestReview(params: {
    versionId: string;
    actor: GovernanceActor;
  }): Promise<CatalogVersion>;
  submitReview(params: {
    versionId: string;
    reviewer: GovernanceActor;
    decision: "approved" | "changes_requested";
    comment?: string;
  }): Promise<ReviewDecision>;
  approveVersion(params: {
    versionId: string;
    actor: GovernanceActor;
  }): Promise<CatalogVersion>;
  activateVersion(params: {
    versionId: string;
    actor: GovernanceActor;
  }): Promise<CatalogVersion>;
  rollbackVersion(params: {
    locale: string;
    toVersionId: string;
    actor: GovernanceActor;
  }): Promise<CatalogVersion>;
  evaluateCiPolicy(params?: {
    requiredLocales?: string[];
  }): Promise<CiPolicyResult>;
  assignReviewer(params: {
    localeId: string;
    reviewerId: string;
    reviewerRole: string;
    assignedBy: string;
  }): Promise<ReviewAssignment>;
  getReviewerAssignments(localeId: string): Promise<ReviewAssignment[]>;
}
