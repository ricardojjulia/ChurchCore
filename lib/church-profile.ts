import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export async function resolveActiveChurchProfileId(
  session: ChurchAppSession,
): Promise<string | null> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return session.userId;
  }

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string }>(
      `
        select id
        from public.profiles
        where user_id = $1
          and church_id = $2
          and merged_at is null
        limit 1
      `,
      [session.userId, session.appContext.church.id],
    );

    return result.rows[0]?.id ?? null;
  }

  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", session.userId)
    .eq("church_id", session.appContext.church.id)
    .is("merged_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}
