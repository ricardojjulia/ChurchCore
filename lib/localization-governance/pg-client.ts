import "server-only";

import { Pool } from "pg";

let _pool: Pool | null = null;

export function getLocgovPool(): Pool {
  if (!_pool) {
    const url = process.env.LOCGOV_DATABASE_URL;
    if (!url) throw new Error("LOCGOV_DATABASE_URL is not configured.");
    _pool = new Pool({ connectionString: url });
  }
  return _pool;
}
