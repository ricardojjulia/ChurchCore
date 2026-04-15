"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import {
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
  createTenantServerClient,
} from "@/lib/supabase/tenant";

/**
 * Data Rights — GDPR/CCPA aligned self-service actions.
 *
 * requestDataExportAction  — member requests a JSON export of their data.
 * requestAccountDeletionAction — member initiates soft-delete (30-day grace).
 * cancelDeletionRequestAction  — member withdraws deletion request within grace.
 * generateDataExportAction     — builds the JSON export payload.
 *
 * Church admins can view pending export/delete requests in the admin panel.
 * Actual deletion is approved by a church admin (or auto-approved after 30 days).
 */

export async function requestDataExportAction(): Promise<void> {
  const session = await requireChurchSession("/app/member");
  const profileId = session.profile.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.profiles
       set data_export_requested_at = now(), updated_at = now()
       where id = $1`,
      [profileId],
    );
  } else {
    const supabase = await createTenantServerClient();
    await supabase
      .from("profiles")
      .update({
        data_export_requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId);
  }

  revalidatePath("/app/member/data-rights");
}

export async function requestAccountDeletionAction(): Promise<void> {
  const session = await requireChurchSession("/app/member");
  const profileId = session.profile.id;

  // Disallow deletion for pastor/admin accounts via self-service
  const role = session.appContext.roleId;
  if (role === "pastor" || role === "church-admin") {
    throw new Error(
      "Staff accounts cannot be deleted via self-service. Contact your platform administrator.",
    );
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.profiles
       set data_delete_requested_at = now(), updated_at = now()
       where id = $1`,
      [profileId],
    );
  } else {
    const supabase = await createTenantServerClient();
    await supabase
      .from("profiles")
      .update({
        data_delete_requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId);
  }

  revalidatePath("/app/member/data-rights");
}

export async function cancelDeletionRequestAction(): Promise<void> {
  const session = await requireChurchSession("/app/member");
  const profileId = session.profile.id;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.profiles
       set data_delete_requested_at = null, updated_at = now()
       where id = $1`,
      [profileId],
    );
  } else {
    const supabase = await createTenantServerClient();
    await supabase
      .from("profiles")
      .update({
        data_delete_requested_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId);
  }

  revalidatePath("/app/member/data-rights");
}

export interface DataExportPayload {
  exportedAt: string;
  profile: Record<string, unknown>;
  memberships: unknown[];
  donations: unknown[];
  consentLogs: unknown[];
  notificationPreferences: unknown[];
}

/**
 * generateDataExportAction
 *
 * Produces a JSON export of the member's personal data.
 * Excludes fields marked [Erased] and sensitive church-admin records.
 * Called from the DataRightsPanel — the JSON is downloaded client-side.
 */
export async function generateDataExportAction(): Promise<DataExportPayload> {
  const session = await requireChurchSession("/app/member");
  const churchId = session.appContext.church.id;
  const profileId = session.profile.id;

  if (shouldUseLocalTenantFallback()) {
    const [profile, memberships, donations, consents, prefs] = await Promise.all([
      queryTenantLocalDb<Record<string, unknown>>(
        `select id, full_name, email, phone, address, preferred_contact_method,
                directory_visible, contact_allowed, role, created_at, updated_at,
                data_export_requested_at, data_delete_requested_at
         from public.profiles where id = $1`,
        [profileId],
      ),
      queryTenantLocalDb<Record<string, unknown>>(
        `select cm.role, cm.is_active, cm.created_at, c.name as church_name
         from public.church_memberships cm
         join public.churches c on c.id = cm.church_id
         where cm.profile_id = $1`,
        [profileId],
      ),
      queryTenantLocalDb<Record<string, unknown>>(
        `select id, amount_cents, currency, fund_designation, is_recurring,
                is_anonymous, status, created_at
         from public.donations
         where profile_id = $1 and is_anonymous = false`,
        [profileId],
      ),
      queryTenantLocalDb<Record<string, unknown>>(
        `select consent_type, communication_type, consented, consented_at
         from public.consent_logs where profile_id = $1 and church_id = $2`,
        [profileId, churchId],
      ),
      queryTenantLocalDb<Record<string, unknown>>(
        `select email_opt_in, sms_opt_in, push_opt_in, in_app_opt_in, updated_at
         from public.notification_preferences where profile_id = $1 and church_id = $2`,
        [profileId, churchId],
      ),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      profile: profile.rows[0] ?? {},
      memberships: memberships.rows,
      donations: donations.rows,
      consentLogs: consents.rows,
      notificationPreferences: prefs.rows,
    };
  }

  const supabase = await createTenantServerClient();

  const [{ data: profile }, { data: memberships }, { data: donations }, { data: consents }, { data: prefs }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, full_name, email, phone, address, preferred_contact_method, directory_visible, contact_allowed, role, created_at, updated_at, data_export_requested_at, data_delete_requested_at",
        )
        .eq("id", profileId)
        .single(),
      supabase
        .from("church_memberships")
        .select("role, is_active, created_at, churches(name)")
        .eq("profile_id", profileId),
      supabase
        .from("donations")
        .select("id, amount_cents, currency, fund_designation, is_recurring, is_anonymous, status, created_at")
        .eq("profile_id", profileId)
        .eq("is_anonymous", false),
      supabase
        .from("consent_logs")
        .select("consent_type, communication_type, consented, consented_at")
        .eq("profile_id", profileId)
        .eq("church_id", churchId),
      supabase
        .from("notification_preferences")
        .select("email_opt_in, sms_opt_in, push_opt_in, in_app_opt_in, updated_at")
        .eq("profile_id", profileId)
        .eq("church_id", churchId),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: (profile ?? {}) as Record<string, unknown>,
    memberships: memberships ?? [],
    donations: donations ?? [],
    consentLogs: consents ?? [],
    notificationPreferences: prefs ?? [],
  };
}
