import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { Pool, type QueryResultRow } from "pg";

import {
  getControlPlaneDbUrl,
  getControlPlaneServiceRoleKey,
  getControlPlaneSupabaseEnv,
  hasControlPlaneBackendConfig,
  shouldUseLocalControlPlaneDbFallback,
} from "@/lib/supabase/config";
import { supabaseFetch } from "@/lib/supabase/fetch";

declare global {
  var __churchcoreopsControlPlanePool: Pool | undefined;
}

function getControlPlanePool() {
  if (!global.__churchcoreopsControlPlanePool) {
    global.__churchcoreopsControlPlanePool = new Pool({
      connectionString: getControlPlaneDbUrl(),
    });
  }

  return global.__churchcoreopsControlPlanePool;
}

export function hasControlPlaneBackendEnv() {
  return hasControlPlaneBackendConfig();
}

export function shouldUseLocalControlPlaneFallback() {
  return shouldUseLocalControlPlaneDbFallback();
}

export async function createControlPlaneServerClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getControlPlaneSupabaseEnv();

  return createServerClient(url, publishableKey, {
    global: { fetch: supabaseFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Request-time refresh is handled elsewhere when writes are not allowed.
        }
      },
    },
  });
}

export function createControlPlaneAdminClient() {
  const { url } = getControlPlaneSupabaseEnv();

  return createClient(url, getControlPlaneServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function queryControlPlaneLocalDb<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  return getControlPlanePool().query<T>(text, values);
}
