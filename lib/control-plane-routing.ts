import "server-only";

import type { ChurchSummary } from "@/lib/auth";
import {
  createControlPlaneServerClient,
  queryControlPlaneLocalDb,
  shouldUseLocalControlPlaneFallback,
} from "@/lib/supabase/control-plane";

export type ResolvedTenantViewTarget = {
  tenantId: string;
  church: ChurchSummary;
  connectionStatus: string | null;
};

export async function resolveTenantViewTarget(
  tenantId: string,
): Promise<ResolvedTenantViewTarget | null> {
  if (shouldUseLocalControlPlaneFallback()) {
    const result = await queryControlPlaneLocalDb<{
      tenant_id: string;
      resolved_tenant_id: string;
      name: string;
      slug: string;
      timezone: string;
      connection_status: string | null;
    }>(
      `
        select
          tenant.id as tenant_id,
          coalesce(tenant.external_tenant_id, tenant.id) as resolved_tenant_id,
          tenant.name,
          tenant.slug::text as slug,
          tenant.timezone,
          connection.connection_status::text as connection_status
        from public.tenants tenant
        left join public.tenant_connections connection
          on connection.tenant_id = tenant.id
        where tenant.id = $1
        limit 1
      `,
      [tenantId],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      tenantId: row.tenant_id,
      church: {
        id: row.resolved_tenant_id,
        name: row.name,
        slug: row.slug,
        timezone: row.timezone,
      },
      connectionStatus: row.connection_status,
    };
  }

  const supabase = await createControlPlaneServerClient();
  const { data } = await supabase
    .from("tenants")
    .select(
      "id, external_tenant_id, name, slug, timezone, tenant_connections(connection_status)",
    )
    .eq("id", tenantId)
    .maybeSingle();

  if (!data) {
    return null;
  }

  const tenantConnection = Array.isArray(data.tenant_connections)
    ? data.tenant_connections[0]
    : data.tenant_connections;

  return {
    tenantId: data.id,
    church: {
      id:
        typeof data.external_tenant_id === "string"
          ? data.external_tenant_id
          : data.id,
      name: data.name,
      slug: data.slug,
      timezone: data.timezone,
    },
    connectionStatus:
      tenantConnection &&
      typeof tenantConnection === "object" &&
      "connection_status" in tenantConnection
        ? String((tenantConnection as Record<string, unknown>).connection_status)
        : null,
  };
}
