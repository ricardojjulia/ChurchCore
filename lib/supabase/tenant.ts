import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { Pool, type QueryResultRow } from "pg";

import {
  getTenantDbUrl,
  getTenantSupabaseEnv,
  getTenantServiceRoleKey,
  hasTenantBackendConfig,
  hasTenantSupabaseEnv,
  hasTenantServiceRoleKey,
} from "@/lib/supabase/config";
import { supabaseFetch } from "@/lib/supabase/fetch";

declare global {
  var __churchcoreopsTenantPool: Pool | undefined;
}

function getTenantPool() {
  if (!global.__churchcoreopsTenantPool) {
    global.__churchcoreopsTenantPool = new Pool({
      connectionString: getTenantDbUrl(),
    });
  }

  return global.__churchcoreopsTenantPool;
}

export function hasTenantBackendEnv() {
  return hasTenantBackendConfig();
}

export function hasTenantAdminBackendEnv() {
  return hasTenantSupabaseEnv() && hasTenantServiceRoleKey();
}

export function shouldUseLocalTenantFallback() {
  // Supabase-only architecture — 2026-07-10.
  // All local SQL (queryTenantLocalDb) paths are dead code. Do not add new local paths.
  return false;
}

export async function createTenantServerClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getTenantSupabaseEnv();

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

export function createTenantAdminClient() {
  const { url } = getTenantSupabaseEnv();

  return createClient(url, getTenantServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function queryTenantLocalDb<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  return getTenantPool().query<T>(text, values);
}
