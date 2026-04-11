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
  createControlPlaneServerClient,
  hasControlPlaneBackendEnv,
  queryControlPlaneLocalDb,
  shouldUseLocalControlPlaneFallback,
} from "@/lib/supabase/control-plane";

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
  statuses,
}: {
  churches: ChurchSummary[];
  statuses: Map<
    string,
    {
      tenantStatus: string;
      billingStatus: string;
      connectionStatus: string | null;
    }
  >;
}) {
  return churches.map((church) => {
    const status = statuses.get(church.id);
    const tenantStatus = status?.tenantStatus ?? "provisioning";
    const billingStatus = status?.billingStatus ?? "trialing";
    const connectionStatus = status?.connectionStatus ?? "pending";

    const priority =
      tenantStatus === "suspended" ||
      billingStatus === "past_due" ||
      connectionStatus === "error"
        ? "critical"
        : tenantStatus !== "active" || connectionStatus !== "ready"
          ? "warning"
          : "healthy";

    const stage =
      priority === "critical"
        ? "Needs intervention"
        : priority === "warning"
          ? "Provisioning review"
          : "Tenant live";

    const detail =
      priority === "critical"
        ? `Tenant status ${tenantStatus}, billing ${billingStatus}, connection ${connectionStatus}.`
        : priority === "warning"
          ? `Tenant status ${tenantStatus}, connection ${connectionStatus}.`
          : "Tenant registry and connection are ready.";

    return {
      church: church.name,
      stage,
      detail,
      priority,
    } satisfies ControlPlaneTenantItem;
  });
}

async function getControlPlaneDashboardDataFromLocalDb() {
  const [tenantsResult, auditResult] = await Promise.all([
    queryControlPlaneLocalDb<{
      resolved_tenant_id: string;
      name: string;
      slug: string;
      timezone: string;
      tenant_status: string;
      billing_status: string;
      connection_status: string | null;
    }>(
      `
        select
          coalesce(tenant.external_tenant_id, tenant.id) as resolved_tenant_id,
          tenant.name,
          tenant.slug::text as slug,
          tenant.timezone,
          tenant.tenant_status::text as tenant_status,
          tenant.billing_status::text as billing_status,
          connection.connection_status::text as connection_status
        from public.tenants tenant
        left join public.tenant_connections connection
          on connection.tenant_id = tenant.id
        order by tenant.name
      `,
    ),
    queryControlPlaneLocalDb<{
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

  const churches = tenantsResult.rows.map((tenant) => ({
    id: tenant.resolved_tenant_id,
    name: tenant.name,
    slug: tenant.slug,
    timezone: tenant.timezone,
  }));
  const statuses = new Map(
    tenantsResult.rows.map((tenant) => [
      tenant.resolved_tenant_id,
      {
        tenantStatus: tenant.tenant_status,
        billingStatus: tenant.billing_status,
        connectionStatus: tenant.connection_status,
      },
    ]),
  );
  const tenantItems = buildTenantItemsFromLiveData({ churches, statuses });
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
        detail: "Tenant registry records.",
      },
      {
        label: "Ready connections",
        value: String(
          tenantsResult.rows.filter((row) => row.connection_status === "ready").length,
        ),
        detail: "Tenant data-plane connections ready for routing.",
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
  if (!hasControlPlaneBackendEnv() || session.source !== "supabase") {
    return buildPreviewDashboardData(session);
  }

  if (shouldUseLocalControlPlaneFallback()) {
    return getControlPlaneDashboardDataFromLocalDb();
  }

  const supabase = await createControlPlaneServerClient();
  const [{ data: tenantRows }, { data: auditRows }] =
    await Promise.all([
      supabase
        .from("tenants")
        .select(
          "id, external_tenant_id, name, slug, timezone, tenant_status, billing_status, tenant_connections(connection_status)",
        )
        .order("name"),
      supabase
        .from("tenant_view_audit_logs")
        .select("id, church_id, viewed_role, event_type, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  const normalizedTenantRows =
    tenantRows?.flatMap((tenant) => {
      const tenantConnection = Array.isArray(tenant.tenant_connections)
        ? tenant.tenant_connections[0]
        : tenant.tenant_connections;

      const resolvedTenantId =
        typeof tenant.external_tenant_id === "string"
          ? tenant.external_tenant_id
          : tenant.id;

      return [
        {
          id: resolvedTenantId,
          name: tenant.name,
          slug: tenant.slug,
          timezone: tenant.timezone,
          tenantStatus: tenant.tenant_status,
          billingStatus: tenant.billing_status,
          connectionStatus:
            tenantConnection &&
            typeof tenantConnection === "object" &&
            "connection_status" in tenantConnection
              ? String(
                  (tenantConnection as Record<string, unknown>).connection_status,
                )
              : null,
        },
      ];
    }) ?? [];

  const churches =
    normalizedTenantRows.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      timezone: tenant.timezone,
    })) ?? session.tenantViews;
  const statuses = new Map(
    normalizedTenantRows.map((tenant) => [
      tenant.id,
      {
        tenantStatus: tenant.tenantStatus,
        billingStatus: tenant.billingStatus,
        connectionStatus: tenant.connectionStatus,
      },
    ]),
  );
  const tenantItems = buildTenantItemsFromLiveData({ churches, statuses });
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
        detail: "Control-plane tenant registry records.",
      },
      {
        label: "Ready connections",
        value: String(
          normalizedTenantRows.filter((row) => row.connectionStatus === "ready").length,
        ),
        detail: "Tenant data-plane connections ready for routing.",
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
