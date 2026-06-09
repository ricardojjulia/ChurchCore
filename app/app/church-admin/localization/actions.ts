"use server";

import { requireChurchSession } from "@/lib/auth";
import { logAuditEvent } from "@/lib/actions/audit";
import { createChurchAdapter } from "@/lib/localization-governance/adapter";
import type {
  LocaleStatus,
  LocaleRecord,
  CatalogVersion,
  CiPolicyResult,
  ReviewDecision,
  ReviewAssignment,
} from "@/lib/localization-governance/types";

// ── RBAC role helpers ─────────────────────────────────────────────────────────

type ChurchRole = string;

const ROLES_CAN_READ = new Set<ChurchRole>([
  "church-admin",
  "pastor",
  "ministry-leader",
  "secretary",
  "member",
]);

const ROLES_CAN_WRITE = new Set<ChurchRole>(["church-admin", "pastor"]);

const ROLES_ADMIN_ONLY = new Set<ChurchRole>(["church-admin"]);

function canRead(role: ChurchRole) {
  return ROLES_CAN_READ.has(role);
}

function canWrite(role: ChurchRole) {
  return ROLES_CAN_WRITE.has(role);
}

function isAdmin(role: ChurchRole) {
  return ROLES_ADMIN_ONLY.has(role);
}

// ── Response type ─────────────────────────────────────────────────────────────

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

function fail(error: string, code: string): ActionResult<never> {
  return { ok: false, error, code };
}

function handleError(err: unknown): ActionResult<never> {
  if (err && typeof err === "object" && "code" in err) {
    const e = err as { code: string; message?: string };
    return fail(e.message ?? String(e.code), e.code);
  }
  return fail(String(err), "unknown_error");
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function getLocalizationStatus(
  locale: string,
): Promise<ActionResult<LocaleStatus>> {
  try {
    const session = await requireChurchSession("/app/sign-in");
    const role = session.appContext.roleId;

    if (!canRead(role)) {
      return fail("Insufficient role.", "insufficient_role");
    }

    const churchId = session.appContext.church.id;
    const adapter = createChurchAdapter(churchId);
    const status = await adapter.getLocaleStatus(locale);

    return ok(status);
  } catch (err) {
    return handleError(err);
  }
}

export async function listLocales(): Promise<ActionResult<LocaleRecord[]>> {
  try {
    const session = await requireChurchSession("/app/sign-in");
    const role = session.appContext.roleId;

    if (!canRead(role)) {
      return fail("Insufficient role.", "insufficient_role");
    }

    const churchId = session.appContext.church.id;
    const adapter = createChurchAdapter(churchId);
    const locales = await adapter.listLocales();

    return ok(locales);
  } catch (err) {
    return handleError(err);
  }
}

export async function createLocale(input: {
  code: string;
  sourceLocale: string;
}): Promise<ActionResult<LocaleRecord>> {
  try {
    const session = await requireChurchSession("/app/sign-in");
    const role = session.appContext.roleId;

    if (!canWrite(role)) {
      return fail("Insufficient role.", "insufficient_role");
    }

    const churchId = session.appContext.church.id;
    const actorId = session.userId;
    const adapter = createChurchAdapter(churchId);

    const locale = await adapter.createLocale({
      code: input.code,
      sourceLocale: input.sourceLocale,
      actor: { id: actorId, role },
    });

    await logAuditEvent({
      tableName: "localization_locales",
      recordId: locale.id,
      operation: "INSERT",
      actorId,
      churchId,
      actorRole: role,
      newValues: { code: locale.code, sourceLocale: locale.sourceLocale },
    });

    return ok(locale);
  } catch (err) {
    return handleError(err);
  }
}

export async function createCatalogVersion(input: {
  locale: string;
  messages: Record<string, string>;
  provenance?: object;
}): Promise<ActionResult<CatalogVersion>> {
  try {
    const session = await requireChurchSession("/app/sign-in");
    const role = session.appContext.roleId;

    if (!canWrite(role)) {
      return fail("Insufficient role.", "insufficient_role");
    }

    const churchId = session.appContext.church.id;
    const actorId = session.userId;
    const adapter = createChurchAdapter(churchId);

    const version = await adapter.createCatalogVersion({
      locale: input.locale,
      messages: input.messages,
      actor: { id: actorId, role },
      provenance: input.provenance as Record<string, unknown> | undefined,
    });

    await logAuditEvent({
      tableName: "localization_catalog_versions",
      recordId: version.id,
      operation: "INSERT",
      actorId,
      churchId,
      actorRole: role,
      newValues: {
        locale: version.locale,
        version: version.version,
        state: version.state,
        contentHash: version.contentHash,
      },
    });

    return ok(version);
  } catch (err) {
    return handleError(err);
  }
}

export async function translateVersion(input: {
  versionId: string;
  provider?: string;
  scope?: string;
}): Promise<ActionResult<CatalogVersion>> {
  try {
    const session = await requireChurchSession("/app/sign-in");
    const role = session.appContext.roleId;

    if (!canWrite(role)) {
      return fail("Insufficient role.", "insufficient_role");
    }

    if (!process.env.GOOGLE_TRANSLATE_API_KEY && input.provider === "google") {
      return fail(
        "Google Translate is not configured. Set GOOGLE_TRANSLATE_API_KEY.",
        "provider_not_configured",
      );
    }

    const churchId = session.appContext.church.id;
    const actorId = session.userId;
    const adapter = createChurchAdapter(churchId);

    const version = await adapter.translateVersion({
      versionId: input.versionId,
      provider: input.provider,
      actor: { id: actorId, role },
      scope: input.scope as "missing" | "full" | undefined,
    });

    await logAuditEvent({
      tableName: "localization_catalog_versions",
      recordId: version.id,
      operation: "UPDATE",
      actorId,
      churchId,
      actorRole: role,
      newValues: { state: version.state, contentHash: version.contentHash },
    });

    return ok(version);
  } catch (err) {
    return handleError(err);
  }
}

export async function validateVersion(input: {
  versionId: string;
  glossary?: Record<string, string>;
  untranslatedAllowlist?: string[];
}): Promise<ActionResult<{ version: CatalogVersion; reportId: string }>> {
  try {
    const session = await requireChurchSession("/app/sign-in");
    const role = session.appContext.roleId;

    if (!canWrite(role)) {
      return fail("Insufficient role.", "insufficient_role");
    }

    const churchId = session.appContext.church.id;
    const actorId = session.userId;
    const adapter = createChurchAdapter(churchId);

    const { version, report } = await adapter.validateVersion({
      versionId: input.versionId,
      actor: { id: actorId, role },
      glossary: input.glossary,
      untranslatedAllowlist: input.untranslatedAllowlist,
    });

    await logAuditEvent({
      tableName: "localization_catalog_versions",
      recordId: version.id,
      operation: "UPDATE",
      actorId,
      churchId,
      actorRole: role,
      newValues: { state: version.state, contentHash: version.contentHash },
    });

    return ok({ version, reportId: report.id });
  } catch (err) {
    return handleError(err);
  }
}

export async function requestReview(input: {
  versionId: string;
}): Promise<ActionResult<CatalogVersion>> {
  try {
    const session = await requireChurchSession("/app/sign-in");
    const role = session.appContext.roleId;

    if (!canWrite(role)) {
      return fail("Insufficient role.", "insufficient_role");
    }

    const churchId = session.appContext.church.id;
    const actorId = session.userId;
    const adapter = createChurchAdapter(churchId);

    const version = await adapter.requestReview({
      versionId: input.versionId,
      actor: { id: actorId, role },
    });

    await logAuditEvent({
      tableName: "localization_catalog_versions",
      recordId: version.id,
      operation: "UPDATE",
      actorId,
      churchId,
      actorRole: role,
      newValues: { state: version.state },
    });

    return ok(version);
  } catch (err) {
    return handleError(err);
  }
}

export async function assignReviewer(input: {
  localeId: string;
  reviewerId: string;
  reviewerRole: string;
}): Promise<ActionResult<ReviewAssignment>> {
  try {
    const session = await requireChurchSession("/app/sign-in");
    const role = session.appContext.roleId;

    if (!isAdmin(role)) {
      return fail("Insufficient role. church_admin required.", "insufficient_role");
    }

    const churchId = session.appContext.church.id;
    const actorId = session.userId;
    const adapter = createChurchAdapter(churchId);

    const assignment = await adapter.assignReviewer({
      localeId: input.localeId,
      reviewerId: input.reviewerId,
      reviewerRole: input.reviewerRole,
      assignedBy: actorId,
    });

    await logAuditEvent({
      tableName: "localization_review_assignments",
      recordId: assignment.id,
      operation: "INSERT",
      actorId,
      churchId,
      actorRole: role,
      newValues: {
        localeId: input.localeId,
        reviewerRole: input.reviewerRole,
      },
    });

    return ok(assignment);
  } catch (err) {
    return handleError(err);
  }
}

export async function submitReview(input: {
  versionId: string;
  reviewerRole: string;
  decision: "approved" | "changes_requested";
  comment?: string;
}): Promise<ActionResult<ReviewDecision>> {
  try {
    const session = await requireChurchSession("/app/sign-in");
    const role = session.appContext.roleId;
    const actorId = session.userId;
    const churchId = session.appContext.church.id;
    const adapter = createChurchAdapter(churchId);

    const review = await adapter.submitReview({
      versionId: input.versionId,
      reviewer: { id: actorId, role: input.reviewerRole },
      decision: input.decision,
      comment: input.comment,
    });

    await logAuditEvent({
      tableName: "localization_review_decisions",
      recordId: review.id,
      operation: "INSERT",
      actorId,
      churchId,
      actorRole: role,
      newValues: {
        catalogVersionId: review.catalogVersionId,
        decision: review.decision,
        reviewerRole: review.reviewerRole,
      },
    });

    return ok(review);
  } catch (err) {
    return handleError(err);
  }
}

export async function approveVersion(input: {
  versionId: string;
}): Promise<ActionResult<CatalogVersion>> {
  try {
    const session = await requireChurchSession("/app/sign-in");
    const role = session.appContext.roleId;

    if (!isAdmin(role)) {
      return fail("Insufficient role. church_admin required.", "insufficient_role");
    }

    const churchId = session.appContext.church.id;
    const actorId = session.userId;
    const adapter = createChurchAdapter(churchId);

    const version = await adapter.approveVersion({
      versionId: input.versionId,
      actor: { id: actorId, role },
    });

    await logAuditEvent({
      tableName: "localization_catalog_versions",
      recordId: version.id,
      operation: "UPDATE",
      actorId,
      churchId,
      actorRole: role,
      newValues: { state: version.state, approvedBy: actorId },
    });

    return ok(version);
  } catch (err) {
    return handleError(err);
  }
}

export async function activateVersion(input: {
  versionId: string;
}): Promise<ActionResult<CatalogVersion>> {
  try {
    const session = await requireChurchSession("/app/sign-in");
    const role = session.appContext.roleId;

    if (!isAdmin(role)) {
      return fail("Insufficient role. church_admin required.", "insufficient_role");
    }

    const churchId = session.appContext.church.id;
    const actorId = session.userId;
    const adapter = createChurchAdapter(churchId);

    const version = await adapter.activateVersion({
      versionId: input.versionId,
      actor: { id: actorId, role },
    });

    await logAuditEvent({
      tableName: "localization_catalog_versions",
      recordId: version.id,
      operation: "UPDATE",
      actorId,
      churchId,
      actorRole: role,
      newValues: { state: version.state },
    });

    return ok(version);
  } catch (err) {
    return handleError(err);
  }
}

export async function rollbackVersion(input: {
  locale: string;
  toVersionId: string;
}): Promise<ActionResult<CatalogVersion>> {
  try {
    const session = await requireChurchSession("/app/sign-in");
    const role = session.appContext.roleId;

    if (!isAdmin(role)) {
      return fail("Insufficient role. church_admin required.", "insufficient_role");
    }

    const churchId = session.appContext.church.id;
    const actorId = session.userId;
    const adapter = createChurchAdapter(churchId);

    const version = await adapter.rollbackVersion({
      locale: input.locale,
      toVersionId: input.toVersionId,
      actor: { id: actorId, role },
    });

    await logAuditEvent({
      tableName: "localization_activation_history",
      recordId: input.toVersionId,
      operation: "INSERT",
      actorId,
      churchId,
      actorRole: role,
      newValues: { locale: input.locale, action: "rollback", toVersionId: input.toVersionId },
    });

    return ok(version);
  } catch (err) {
    return handleError(err);
  }
}

export async function evaluateCiPolicy(input?: {
  requiredLocales?: string[];
}): Promise<ActionResult<CiPolicyResult>> {
  try {
    const session = await requireChurchSession("/app/sign-in");
    const role = session.appContext.roleId;

    if (!canRead(role)) {
      return fail("Insufficient role.", "insufficient_role");
    }

    const churchId = session.appContext.church.id;
    const adapter = createChurchAdapter(churchId);
    const result = await adapter.evaluateCiPolicy(input);

    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
