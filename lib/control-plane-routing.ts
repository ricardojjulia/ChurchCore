import "server-only";

import type { ChurchSummary } from "@/lib/auth";
import { extractRuntimeChurchId } from "@/lib/control-plane-registry";
import {
  createControlPlaneServerClient,
  hasControlPlaneBackendEnv,
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
  // No backend at all (preview/local mode without Docker) — return null gracefully
  if (!shouldUseLocalControlPlaneFallback() && !hasControlPlaneBackendEnv()) {
    return null;
  }

  if (shouldUseLocalControlPlaneFallback()) {
    const result = await queryControlPlaneLocalDb<{
      tenant_id: string;
      name: string;
      slug: string;
      timezone: string;
      connection_status: string | null;
      metadata: Record<string, unknown> | null;
    }>(
      `
        select
          tenant.id as tenant_id,
          tenant.name,
          tenant.slug::text as slug,
          tenant.timezone,
          connection.connection_status::text as connection_status,
          connection.metadata
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

    const runtimeChurchId = extractRuntimeChurchId(row.metadata);

    if (!runtimeChurchId) {
      return null;
    }

    return {
      tenantId: row.tenant_id,
      church: {
        id: runtimeChurchId,
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
      "id, name, slug, timezone, tenant_connections(connection_status, metadata)",
    )
    .eq("id", tenantId)
    .maybeSingle();

  if (!data) {
    return null;
  }

  const tenantConnection = Array.isArray(data.tenant_connections)
    ? data.tenant_connections[0]
    : data.tenant_connections;
  const runtimeChurchId =
    tenantConnection && typeof tenantConnection === "object"
      ? extractRuntimeChurchId(
          (tenantConnection as Record<string, unknown>).metadata,
        )
      : null;

  if (!runtimeChurchId) {
    return null;
  }

  return {
    tenantId: data.id,
    church: {
      id: runtimeChurchId,
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
