import "server-only";

import { Pool, type QueryResultRow } from "pg";

import { getSupabaseDbUrl } from "@/lib/supabase/config";

declare global {
  var __churchforgeLocalSupabasePool: Pool | undefined;
}

function getPool() {
  if (!global.__churchforgeLocalSupabasePool) {
    global.__churchforgeLocalSupabasePool = new Pool({
      connectionString: getSupabaseDbUrl(),
    });
  }

  return global.__churchforgeLocalSupabasePool;
}

export async function queryLocalSupabaseDb<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  return getPool().query<T>(text, values);
}
