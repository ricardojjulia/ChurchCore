import { NextRequest, NextResponse } from "next/server";

import {
  hasTenantAdminBackendEnv,
  hasTenantBackendEnv,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import { runShepherdAiScheduledEvaluation } from "@/lib/shepherd-ai/scheduler";

export const dynamic = "force-dynamic";

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const providedBearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const providedHeader = request.headers.get("x-cron-secret") ?? "";

  return providedBearer === cronSecret || providedHeader === cronSecret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasTenantBackendEnv()) {
    return NextResponse.json(
      {
        error:
          "Tenant backend is not configured. Set tenant Supabase env vars or local tenant DB fallback.",
      },
      { status: 503 },
    );
  }

  if (!shouldUseLocalTenantFallback() && !hasTenantAdminBackendEnv()) {
    return NextResponse.json(
      {
        error:
          "Scheduler requires TENANT_SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY) when local tenant DB fallback is disabled.",
      },
      { status: 503 },
    );
  }

  const tenantId = request.nextUrl.searchParams.get("tenantId") ?? undefined;
  const maxTenantsRaw = request.nextUrl.searchParams.get("maxTenants");
  const maxTenants = maxTenantsRaw ? Number(maxTenantsRaw) : undefined;

  try {
    const result = await runShepherdAiScheduledEvaluation({ tenantId, maxTenants });
    const status = result.failedTenantCount > 0 ? 207 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to run scheduled ShepherdAI job.",
      },
      { status: 500 },
    );
  }
}
