import "server-only";

import { createTenantAdminClient } from "@/lib/supabase/tenant";

// The public giving page (/give/[slug], G3.1): a church's live page config,
// read on the server by slug. The church id never reaches the browser; the
// action looks the page up again by slug.

export type PublicGivingPageData = {
  churchId: string;
  churchName: string;
  headline: string;
  description: string | null;
  funds: string[];
  allowAnonymous: boolean;
  slug: string;
};

export async function getPublicGivingPage(slug: string): Promise<PublicGivingPageData | null> {
  const normalized = slug.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(normalized)) return null;
  const { data, error } = await createTenantAdminClient()
    .from("public_giving_pages")
    .select("church_id, slug, headline, description, funds, allow_anonymous, churches!inner(name)")
    .eq("slug", normalized)
    .eq("is_live", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as unknown as {
    church_id: string;
    slug: string;
    headline: string;
    description: string | null;
    funds: unknown;
    allow_anonymous: boolean;
    churches: { name: string } | null;
  };
  const funds = Array.isArray(row.funds) ? row.funds.filter((fund): fund is string => typeof fund === "string" && fund.trim().length > 0) : [];
  return {
    churchId: row.church_id,
    churchName: row.churches?.name ?? "",
    headline: row.headline,
    description: row.description,
    funds: funds.length ? funds : ["General Fund"],
    allowAnonymous: row.allow_anonymous,
    slug: row.slug,
  };
}
