"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  clearAppContextSelection,
  getSession,
  setChurchAppContextSelection,
  setControlAppContextSelection,
  type ChurchRoleId,
} from "@/lib/auth";
import { resolveTenantViewTarget } from "@/lib/control-plane-routing";
import { logTenantViewAuditEvent } from "@/lib/tenant-view-audit";
import {
  shouldUseLocalControlPlaneFallback,
  queryControlPlaneLocalDb,
  createControlPlaneServerClient,
} from "@/lib/supabase/control-plane";
import { createTenantAdminClient } from "@/lib/supabase/tenant";
import { logAuditEvent } from "@/lib/actions/audit";

function isChurchRoleId(value: string): value is ChurchRoleId {
  return (
    value === "church-admin" ||
    value === "secretary" ||
    value === "pastor" ||
    value === "ministry-leader" ||
    value === "member"
  );
}

export async function launchTenantViewAction(formData: FormData) {
  const session = await getSession("/control");

  if (!session || !session.canAccessControl) {
    throw new Error("Control-plane access is required.");
  }

  const tenantId = String(formData.get("tenantId") ?? "");
  const roleId = String(formData.get("roleId") ?? "church-admin");

  if (!tenantId || !isChurchRoleId(roleId)) {
    throw new Error("A valid tenant view target is required.");
  }

  const availableTenant = session.tenantViews.find(
    (entry) => entry.tenantId === tenantId,
  );

  if (!availableTenant) {
    throw new Error("That tenant is not available for viewing.");
  }

  const resolvedTarget = await resolveTenantViewTarget(tenantId);

  if (!resolvedTarget) {
    throw new Error(
      "Tenant routing is not available in preview mode. Start Supabase locally (npx supabase start) to launch a tenant view.",
    );
  }

  if (resolvedTarget.connectionStatus !== "ready") {
    throw new Error("That tenant connection is not ready yet.");
  }

  await setChurchAppContextSelection({
    churchId: resolvedTarget.church.id,
    roleId,
    source: "impersonation",
  });
  await logTenantViewAuditEvent({
    actorUserId: session.userId,
    churchId: resolvedTarget.church.id,
    roleId,
    eventType: "enter",
  });

  revalidatePath("/control");
  revalidatePath("/app");
  redirect(`/app/${roleId}`);
}

export async function returnToControlPlaneAction() {
  const session = await getSession("/control");

  if (!session || !session.canAccessControl) {
    throw new Error("Control-plane access is required.");
  }

  if (session.appContext.kind === "church") {
    await logTenantViewAuditEvent({
      actorUserId: session.userId,
      churchId: session.appContext.church.id,
      roleId: session.appContext.roleId,
      eventType: "exit",
    });
  }

  await clearAppContextSelection();
  await setControlAppContextSelection();

  revalidatePath("/control");
  revalidatePath("/app");
  redirect("/control");
}
/**
 * Best-effort audit write for control-plane tenant CRUD. The control-plane
 * project has no generic audit_log table (only tenant_view_audit_logs, which
 * is scoped to view enter/exit), so this reuses the tenant project's
 * audit_log via logAuditEvent, scoped by the target tenant's resolved
 * church_id when resolvable. Never blocks the calling action on failure —
 * an unresolved/unwritable audit entry should surface in logs, not undo an
 * otherwise-successful admin action.
 */
async function auditTenantAction(input: {
  tenantId: string;
  operation: "UPDATE" | "DELETE" | "ERASE";
  actorId: string;
  actorRole: string | null;
  newValues?: Record<string, unknown>;
}) {
  let churchId: string | null = null;
  try {
    const target = await resolveTenantViewTarget(input.tenantId);
    churchId = target?.church.id ?? null;
  } catch (e) {
    console.warn("auditTenantAction: could not resolve tenant church_id", e);
  }

  try {
    await logAuditEvent({
      tableName: "tenants",
      recordId: input.tenantId,
      operation: input.operation,
      actorId: input.actorId,
      churchId,
      actorRole: input.actorRole,
      newValues: input.newValues,
    });
  } catch (e) {
    console.error("auditTenantAction: failed to write audit log", e);
  }
}

export async function updateTenantAction(input: {
  tenantId: string;
  name: string;
  slug: string;
  status: string;
  billingStatus: string;
}) {
  const session = await getSession("/control");
  if (!session || !session.canAccessControl) {
    throw new Error("Control-plane access is required.");
  }

  if (shouldUseLocalControlPlaneFallback()) {
    await queryControlPlaneLocalDb(
      `update public.tenants
       set name = $1, slug = $2, tenant_status = $3::public.tenant_status, billing_status = $4::public.tenant_billing_status
       where id = $5`,
      [input.name, input.slug, input.status, input.billingStatus, input.tenantId],
    );
  } else {
    const supabase = await createControlPlaneServerClient();
    const { error } = await supabase
      .from("tenants")
      .update({
        name: input.name,
        slug: input.slug,
        tenant_status: input.status,
        billing_status: input.billingStatus,
      })
      .eq("id", input.tenantId);
    if (error) throw new Error(error.message);
  }

  await auditTenantAction({
    tenantId: input.tenantId,
    operation: "UPDATE",
    actorId: session.userId,
    actorRole: "platform_admin",
    newValues: {
      name: input.name,
      slug: input.slug,
      status: input.status,
      billingStatus: input.billingStatus,
    },
  });

  revalidatePath("/control");
  revalidatePath("/control/tenants");
  return { ok: true };
}

export async function deleteTenantAction(tenantId: string) {
  const session = await getSession("/control");
  if (!session || !session.canAccessControl) {
    throw new Error("Control-plane access is required.");
  }

  await auditTenantAction({
    tenantId,
    operation: "DELETE",
    actorId: session.userId,
    actorRole: "platform_admin",
  });

  if (shouldUseLocalControlPlaneFallback()) {
    await queryControlPlaneLocalDb(`delete from public.tenants where id = $1`, [tenantId]);
  } else {
    const supabase = await createControlPlaneServerClient();
    const { error } = await supabase.from("tenants").delete().eq("id", tenantId);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/control");
  revalidatePath("/control/tenants");
  return { ok: true };
}

/**
 * Tables erased by eraseTenantDataAction, in dependency-aware tiers
 * (children/detail tables first, shared parents last). This list was built
 * from a scan of supabase/migrations/*.sql for `church_id`-scoped tables —
 * it is a substantial expansion over the previous 5-table list but is not
 * guaranteed exhaustive as the schema grows. If a table fails to delete
 * because another still references it, re-running the action is safe
 * (deletes are idempotent) once the blocking table is fixed or added here.
 *
 * Deliberately excluded:
 * - consent_logs: append-only by DB trigger (Council Review 2 / ADR 0011);
 *   must never be deleted, including here.
 * - audit_log / tenant_view_audit_logs: the erasure event itself must be
 *   auditable, so the audit trail must survive the erasure it records.
 *
 * Follow-up: a Postgres RPC that derives this list dynamically from
 * information_schema (mirroring the erase_profile_pii() pattern in
 * supabase/migrations for per-profile erasure) would stay correct as the
 * schema grows and give real cross-table atomicity, which per-table
 * `.delete()` calls from the JS client cannot. Tracked as a follow-up ADR,
 * not blocking this hardening pass.
 */
const TENANT_ERASURE_TABLES_ORDERED = [
  // Tier 1 — leaf / detail tables
  "account_requests", "ai_interactions", "burnout_alerts",
  "ccm_authorized_pickups", "ccm_badge_print_jobs", "ccm_checkin_sessions",
  "ccm_custody_restrictions", "ccm_incidents", "ccm_public_session_attempts",
  "ccm_session_enablement_overrides", "ccm_volunteer_assignments",
  "children_checkins", "children_sensitive_data",
  "communication_delivery_events", "communication_logs",
  "communication_suppressions", "communication_templates", "council_notes",
  "daily_work_items", "discernment_sessions", "donation_gl_posts",
  "elder_notes", "event_registration_form_fields",
  "event_registration_payments", "event_registration_settings",
  "event_registrations", "event_rosters", "finance_budget_lines",
  "finance_imports", "finance_journal_lines", "first_time_visitors",
  "group_attendance", "group_meetings", "group_members", "group_resources",
  "import_batch_rows", "kingdom_impacts", "marriage_pulse_entries",
  "member_change_requests", "mentor_couples", "mentorship_pairs",
  "ministry_health_history", "notification_preferences",
  "onboarding_instance_steps", "onboarding_template_steps",
  "pastoral_notes", "care_assignments", "prayer_acknowledgements",
  "prayer_requests", "profile_sensitive_fields", "push_subscriptions",
  "service_attendance", "service_plan_items", "service_plan_positions",
  "stripe_customers", "support_pairings", "track_health_metrics",
  "volunteer_blocked_dates", "volunteer_hours_log",
  "volunteer_match_suggestions", "volunteer_shift_reminders",
  "worship_rehearsals", "youth_graduation_tracking", "youth_milestones",
  "donations",
  // Tier 2 — mid-level entities
  "ccm_services", "children_rooms", "church_documents",
  "discipleship_groups", "education_enrollments", "education_courses",
  "finance_journals", "finance_budgets", "finance_accounts",
  "giving_fund_accounts", "groups", "import_batches", "life_stage_circles",
  "marriage_cohorts", "ministry_tracks", "mission_trips", "mission_partners",
  "outreach_events", "outreach_zones", "public_giving_pages",
  "service_plan_templates", "service_plans", "worship_songs",
  "young_adult_career_mentorships", "volunteer_profiles",
  // Tier 3 — top-level entities
  "church_memberships", "events", "families", "ministries",
  // Tier 4 — root (last: many tables above reference profiles)
  "profiles",
] as const;

export interface EraseTenantDataResult {
  ok: boolean;
  churchId: string;
  erasedTables: string[];
  failedTables: { table: string; error: string }[];
}

export async function eraseTenantDataAction(
  tenantId: string,
): Promise<EraseTenantDataResult> {
  const session = await getSession("/control");
  if (!session || !session.canAccessControl) {
    throw new Error("Control-plane access is required.");
  }

  const target = await resolveTenantViewTarget(tenantId);
  if (!target) {
    throw new Error("Tenant view target could not be resolved.");
  }

  const churchId = target.church.id;
  const supabase = createTenantAdminClient();

  const erasedTables: string[] = [];
  const failedTables: { table: string; error: string }[] = [];

  for (const table of TENANT_ERASURE_TABLES_ORDERED) {
    const { error } = await supabase.from(table).delete().eq("church_id", churchId);
    if (error) {
      failedTables.push({ table, error: error.message });
    } else {
      erasedTables.push(table);
    }
  }

  const adminEmail = `admin@${target.church.slug}.org`;
  const { error: reseedError } = await supabase.from("profiles").insert({
    full_name: "System Admin",
    email: adminEmail,
    church_id: churchId,
    role: "church_admin",
    membership_status: "active",
    directory_visible: false,
    contact_allowed: false,
  });
  if (reseedError) {
    failedTables.push({ table: "profiles (re-seed)", error: reseedError.message });
  }

  await logAuditEvent({
    tableName: "tenants",
    recordId: tenantId,
    operation: "ERASE",
    actorId: session.userId,
    churchId,
    actorRole: "platform_admin",
    newValues: {
      erasedTables: erasedTables.length,
      failedTables: failedTables.map((f) => f.table),
    },
  });

  revalidatePath("/control");
  revalidatePath("/control/tenants");

  return { ok: failedTables.length === 0, churchId, erasedTables, failedTables };
}
