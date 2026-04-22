import "server-only";

import { cookies, headers } from "next/headers";

import { extractPublicChurchSlugFromHost, publicChurchSlugCookieName } from "@/lib/public-host-routing";
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

export async function getRequestedPublicChurchSlug(): Promise<string | null> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const cookieSlug = cookieStore.get(publicChurchSlugCookieName)?.value?.trim() || null;

  if (cookieSlug) {
    return cookieSlug;
  }

  return extractPublicChurchSlugFromHost(headerStore.get("host"));
}

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

export async function getPublicPortalChurchBySlug(
  slug: string,
): Promise<PublicPortalChurch | null> {
  const normalizedSlug = slug.trim().toLowerCase();

  if (!normalizedSlug) {
    return null;
  }

  if (!hasTenantBackendEnv() && !hasTenantDbUrl()) {
    return null;
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
        where lower(slug::text) = $1
        limit 1
      `,
      [normalizedSlug],
    );

    return result.rows[0] ?? null;
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase.rpc("list_portal_churches");

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.find((entry: { slug: unknown }) =>
    String(entry.slug).toLowerCase() === normalizedSlug,
  );

  return row
    ? {
        id: String(row.id),
        name: String(row.name),
        slug: String(row.slug),
        timezone: String(row.timezone),
      }
    : null;
}

export async function getRequestedPublicChurch(): Promise<PublicPortalChurch | null> {
  const slug = await getRequestedPublicChurchSlug();

  if (!slug) {
    return null;
  }

  return getPublicPortalChurchBySlug(slug);
}
