import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { Pool, type QueryResultRow } from "pg";

import {
  getTenantDbUrl,
  getTenantSupabaseEnv,
  getTenantServiceRoleKey,
  hasTenantSupabaseEnv,
  hasTenantServiceRoleKey,
  shouldUseLocalTenantDbFallback,
} from "@/lib/supabase/config";

declare global {
  var __churchforgeTenantPool: Pool | undefined;
}

function getTenantPool() {
  if (!global.__churchforgeTenantPool) {
    global.__churchforgeTenantPool = new Pool({
      connectionString: getTenantDbUrl(),
    });
  }

  return global.__churchforgeTenantPool;
}

export function hasTenantBackendEnv() {
  return hasTenantSupabaseEnv();
}

export function hasTenantAdminBackendEnv() {
  return hasTenantSupabaseEnv() && hasTenantServiceRoleKey();
}

export function shouldUseLocalTenantFallback() {
  return shouldUseLocalTenantDbFallback();
}

export async function createTenantServerClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getTenantSupabaseEnv();

  return createServerClient(url, publishableKey, {
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
