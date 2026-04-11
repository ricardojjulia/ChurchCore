import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Pool, type QueryResultRow } from "pg";

import {
  getControlPlaneDbUrl,
  getControlPlaneSupabaseEnv,
  hasControlPlaneSupabaseEnv,
  shouldUseLocalControlPlaneDbFallback,
} from "@/lib/supabase/config";

declare global {
  var __churchforgeControlPlanePool: Pool | undefined;
}

function getControlPlanePool() {
  if (!global.__churchforgeControlPlanePool) {
    global.__churchforgeControlPlanePool = new Pool({
      connectionString: getControlPlaneDbUrl(),
    });
  }

  return global.__churchforgeControlPlanePool;
}

export function hasControlPlaneBackendEnv() {
  return hasControlPlaneSupabaseEnv();
}

export function shouldUseLocalControlPlaneFallback() {
  return shouldUseLocalControlPlaneDbFallback();
}

export async function createControlPlaneServerClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getControlPlaneSupabaseEnv();

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

export async function queryControlPlaneLocalDb<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  return getControlPlanePool().query<T>(text, values);
}
