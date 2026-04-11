import "server-only";

import type { AuthSession, ChurchSummary } from "@/lib/auth";
import {
  billingQueue,
  launchPipeline,
  supportQueue,
  type ControlPlaneDashboardData,
  type ControlPlaneTenantItem,
} from "@/lib/control-plane";
import {
  hasSupabaseEnv,
  shouldUseLocalSupabaseDbFallback,
} from "@/lib/supabase/config";
import { queryLocalSupabaseDb } from "@/lib/supabase/local-db";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

function formatRelativeTime(isoTimestamp: string) {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)));

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function buildPreviewDashboardData(session: AuthSession): ControlPlaneDashboardData {
  const auditItems =
    session.appContext.kind === "church"
      ? [
          {
            id: "preview-tenant-view",
            church: session.appContext.church.name,
            detail: `Preview tenant view opened as ${session.appContext.roleId}.`,
            when: "just now",
            eventType: "enter" as const,
          },
        ]
      : [];

  return {
    metrics: [
      {
        label: "Active tenants",
        value: "18",
        detail: "2 churches are still moving through onboarding approval.",
      },
      {
        label: "Billing exceptions",
        value: "3",
        detail: "One urgent recovery item and two payment retries need follow-up.",
      },
      {
        label: "Support load",
        value: "11 open",
        detail: "Most active requests are access or provisioning-related.",
      },
    ],
    tenantItems: launchPipeline,
    auditItems,
  };
}

function buildTenantItemsFromLiveData({
  churches,
  membershipCounts,
}: {
  churches: ChurchSummary[];
  membershipCounts: Map<string, number>;
}) {
  return churches.map((church) => {
    const activeMemberships = membershipCounts.get(church.id) ?? 0;

    return {
      church: church.name,
      stage:
        activeMemberships === 0
          ? "Needs membership setup"
          : activeMemberships < 3
            ? "Provisioning review"
            : "Tenant live",
      detail:
        activeMemberships === 0
          ? "No active memberships are attached to this church yet."
          : `${activeMemberships} active membership${
              activeMemberships === 1 ? "" : "s"
            } currently resolve into the church app.`,
      priority:
        activeMemberships === 0
          ? "critical"
          : activeMemberships < 3
            ? "warning"
            : "healthy",
    } satisfies ControlPlaneTenantItem;
  });
}

async function getControlPlaneDashboardDataFromLocalDb() {
  const [churchesResult, membershipsResult, auditResult] = await Promise.all([
    queryLocalSupabaseDb<{
      id: string;
      name: string;
      slug: string;
      timezone: string;
    }>(
      `
        select id, name, slug::text as slug, timezone
        from public.churches
        order by name
      `,
    ),
    queryLocalSupabaseDb<{ church_id: string }>(
      `
        select church_id
        from public.church_memberships
        where is_active = true
      `,
    ),
    queryLocalSupabaseDb<{
      id: string;
      church_id: string;
      viewed_role: string;
      event_type: "enter" | "exit";
      created_at: string;
    }>(
      `
        select id, church_id, viewed_role::text as viewed_role, event_type::text as event_type, created_at
        from public.tenant_view_audit_logs
        order by created_at desc
        limit 8
      `,
    ),
  ]);

  const churches = churchesResult.rows.map((church) => ({
    id: church.id,
    name: church.name,
    slug: church.slug,
    timezone: church.timezone,
  }));
  const membershipCounts = new Map<string, number>();

  for (const row of membershipsResult.rows) {
    membershipCounts.set(
      row.church_id,
      (membershipCounts.get(row.church_id) ?? 0) + 1,
    );
  }

  const tenantItems = buildTenantItemsFromLiveData({
    churches,
    membershipCounts,
  });
  const churchLookup = new Map(churches.map((church) => [church.id, church.name]));
  const auditItems = auditResult.rows.map((row) => ({
    id: row.id,
    church: churchLookup.get(row.church_id) ?? "Unknown church",
    detail: `${
      row.event_type === "enter" ? "Entered" : "Exited"
    } tenant view as ${row.viewed_role.replaceAll("_", " ")}.`,
    when: formatRelativeTime(row.created_at),
    eventType: row.event_type,
  }));

  return {
    metrics: [
      {
        label: "Active tenants",
        value: String(churches.length),
        detail: "Live church records.",
      },
      {
        label: "Active memberships",
        value: String(membershipsResult.rows.length),
        detail: "Resolved from memberships.",
      },
      {
        label: "Tenant-view events",
        value: String(auditItems.length),
        detail: "Recent audit events.",
      },
    ],
    tenantItems,
    auditItems,
  } satisfies ControlPlaneDashboardData;
}

export async function getControlPlaneDashboardData(
  session: AuthSession,
): Promise<ControlPlaneDashboardData> {
  if (!hasSupabaseEnv() || session.source !== "supabase") {
    return buildPreviewDashboardData(session);
  }

  if (shouldUseLocalSupabaseDbFallback()) {
    return getControlPlaneDashboardDataFromLocalDb();
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: churchRows }, { data: membershipRows }, { data: auditRows }] =
    await Promise.all([
      supabase.from("churches").select("id, name, slug, timezone").order("name"),
      supabase
        .from("church_memberships")
        .select("church_id")
        .eq("is_active", true),
      supabase
        .from("tenant_view_audit_logs")
        .select("id, church_id, viewed_role, event_type, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  const churches =
    churchRows?.map((church) => ({
      id: church.id,
      name: church.name,
      slug: church.slug,
      timezone: church.timezone,
    })) ?? session.tenantViews;
  const membershipCounts = new Map<string, number>();

  for (const row of membershipRows ?? []) {
    membershipCounts.set(
      row.church_id,
      (membershipCounts.get(row.church_id) ?? 0) + 1,
    );
  }

  const tenantItems = buildTenantItemsFromLiveData({
    churches,
    membershipCounts,
  });
  const churchLookup = new Map(churches.map((church) => [church.id, church.name]));
  const auditItems =
    auditRows?.map((row) => ({
      id: row.id,
      church: churchLookup.get(row.church_id) ?? "Unknown church",
      detail: `${
        row.event_type === "enter" ? "Entered" : "Exited"
      } tenant view as ${row.viewed_role.replaceAll("_", " ")}.`,
      when: formatRelativeTime(row.created_at),
      eventType: row.event_type,
    })) ?? [];

  return {
    metrics: [
      {
        label: "Active tenants",
        value: String(churches.length),
        detail: "Live church records from Supabase churches.",
      },
      {
        label: "Active memberships",
        value: String(membershipRows?.length ?? 0),
        detail: "Resolved from live church_memberships rows.",
      },
      {
        label: "Tenant-view events",
        value: String(auditItems.length),
        detail: "Recent tenant-view audit events available to platform admins.",
      },
    ],
    tenantItems,
    auditItems,
  };
}

export const fallbackBillingQueue = billingQueue;
export const fallbackSupportQueue = supportQueue;
