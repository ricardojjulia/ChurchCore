import "server-only";

import { hasTenantDbUrl } from "@/lib/supabase/config";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type PublicPortalChurch = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
};

export async function getPublicPortalChurches(): Promise<PublicPortalChurch[]> {
  if (!hasTenantBackendEnv() && !hasTenantDbUrl()) {
    return [];
  }

  if (shouldUseLocalTenantFallback() || !hasTenantBackendEnv()) {
    const result = await queryTenantLocalDb<{
      id: string;
      name: string;
      slug: string;
      timezone: string;
    }>(
      `
        select id, name, slug::text, timezone
        from public.churches
        order by name
      `,
    );

    return result.rows;
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase.rpc("list_portal_churches");

  if (error) {
    throw new Error(error.message);
  }

  return (
    data?.map((row: { id: unknown; name: unknown; slug: unknown; timezone: unknown }) => ({
      id: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
      timezone: String(row.timezone),
    })) ?? []
  );
}
