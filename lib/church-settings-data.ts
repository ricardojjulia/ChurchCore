import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type ChurchSettingsData = {
  source: "preview" | "live";
  id: string;
  name: string;
  legalName: string | null;
  slug: string;
  timezone: string;
  websiteUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  mailingAddress: string | null;
  publicSummary: string | null;
};

function buildPreviewChurchSettingsData(session: ChurchAppSession): ChurchSettingsData {
  return {
    source: "preview",
    id: session.appContext.church.id,
    name: session.appContext.church.name,
    legalName: null,
    slug: session.appContext.church.slug,
    timezone: session.appContext.church.timezone,
    websiteUrl: null,
    contactEmail: null,
    contactPhone: null,
    mailingAddress: null,
    publicSummary: null,
  };
}

function mapChurchSettingsRow(row: {
  id: string;
  name: string;
  legal_name: string | null;
  slug: string;
  timezone: string;
  website_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  mailing_address: string | null;
  public_summary: string | null;
}): ChurchSettingsData {
  return {
    source: "live",
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    slug: row.slug,
    timezone: row.timezone,
    websiteUrl: row.website_url,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    mailingAddress: row.mailing_address,
    publicSummary: row.public_summary,
  };
}

export async function getChurchSettingsData(
  session: ChurchAppSession,
): Promise<ChurchSettingsData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return buildPreviewChurchSettingsData(session);
  }

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string;
      name: string;
      legal_name: string | null;
      slug: string;
      timezone: string;
      website_url: string | null;
      contact_email: string | null;
      contact_phone: string | null;
      mailing_address: string | null;
      public_summary: string | null;
    }>(
      `
        select id, name, legal_name, slug, timezone, website_url,
               contact_email, contact_phone, mailing_address, public_summary
        from public.churches
        where id = $1
        limit 1
      `,
      [session.appContext.church.id],
    );

    const row = result.rows[0];
    return row ? mapChurchSettingsRow(row) : buildPreviewChurchSettingsData(session);
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("churches")
    .select(
      "id, name, legal_name, slug, timezone, website_url, contact_email, contact_phone, mailing_address, public_summary",
    )
    .eq("id", session.appContext.church.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapChurchSettingsRow(data) : buildPreviewChurchSettingsData(session);
}
