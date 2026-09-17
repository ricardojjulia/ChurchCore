import { NextResponse } from "next/server";
import { requireControlPlaneSession } from "@/lib/auth";
import { queryControlPlaneLocalDb } from "@/lib/supabase/control-plane";

interface CachePayload {
  ok: boolean;
  activeConnections: number;
  states: Array<{ count: number; state: string }>;
}

let cachedData: CachePayload | null = null;
let cacheExpiry = 0;

// Exported helper to clear cache in testing environments
export function resetDbHealthCache() {
  cachedData = null;
  cacheExpiry = 0;
}

export async function GET() {
  try {
    await requireControlPlaneSession("/control/db-health");

    const now = Date.now();
    if (cachedData && now < cacheExpiry) {
      return NextResponse.json(cachedData);
    }

    const queryPromise = queryControlPlaneLocalDb<{ count: number; state: string }>(
      "SELECT count(*)::integer as count, state FROM pg_stat_activity GROUP BY state",
    );

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Connection timeout")), 2000);
    });

    const result = await Promise.race([queryPromise, timeoutPromise]);

    const activeConnections = result.rows.reduce((sum, row) => sum + Number(row.count), 0);

    const payload = {
      ok: true,
      activeConnections,
      states: result.rows,
    };

    cachedData = payload;
    cacheExpiry = now + 10000; // 10 seconds cache TTL

    return NextResponse.json(payload);
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof error.digest === "string" &&
      error.digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[db-health] Failed to retrieve database health:", errorMessage);
    return NextResponse.json(
      { error: "Failed to retrieve database health" },
      { status: 500 },
    );
  }
}
