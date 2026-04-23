import {
  createTenantAdminClient,
  hasTenantAdminBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import { evaluateMemberEngagementSignalsJob } from "@/lib/shepherd-ai/scheduled-jobs";

type RunShepherdAiScheduleInput = {
  tenantId?: string;
  maxTenants?: number;
};

type TenantRunResult = {
  tenantId: string;
  evaluatedEntities: number;
  generatedSuggestions: number;
  createdSuggestionIds: string[];
};

export type ShepherdAiScheduleResult = {
  processedAt: string;
  tenantCount: number;
  processedTenantCount: number;
  failedTenantCount: number;
  totals: {
    evaluatedEntities: number;
    generatedSuggestions: number;
  };
  tenantResults: TenantRunResult[];
  failures: Array<{ tenantId: string; error: string }>;
};

function normalizeMaxTenants(rawValue: number | undefined) {
  if (!rawValue || Number.isNaN(rawValue) || rawValue <= 0) return undefined;
  return Math.min(Math.floor(rawValue), 500);
}

async function listTenantIds(maxTenants?: number): Promise<string[]> {
  const normalizedMax = normalizeMaxTenants(maxTenants);

  if (shouldUseLocalTenantFallback()) {
    const query =
      normalizedMax != null
        ? `select id from public.churches order by created_at asc limit $1`
        : `select id from public.churches order by created_at asc`;
    const args = normalizedMax != null ? [normalizedMax] : [];

    const rows = await queryTenantLocalDb<{ id: string }>(query, args);
    return rows.rows.map((row) => row.id);
  }

  if (!hasTenantAdminBackendEnv()) {
    throw new Error(
      "Scheduled ShepherdAI evaluation requires TENANT_SUPABASE_SERVICE_ROLE_KEY (or shared SUPABASE_SERVICE_ROLE_KEY) when local DB fallback is disabled.",
    );
  }

  const admin = createTenantAdminClient();
  let request = admin.from("churches").select("id").order("created_at", { ascending: true });

  if (normalizedMax != null) {
    request = request.limit(normalizedMax);
  }

  const { data, error } = await request;
  if (error) {
    throw new Error(`Failed to list churches for scheduler: ${error.message}`);
  }

  return (data ?? []).map((row) => row.id);
}

export async function runShepherdAiScheduledEvaluation(
  input: RunShepherdAiScheduleInput = {},
): Promise<ShepherdAiScheduleResult> {
  const tenantIds = input.tenantId ? [input.tenantId] : await listTenantIds(input.maxTenants);

  const tenantResults: TenantRunResult[] = [];
  const failures: Array<{ tenantId: string; error: string }> = [];

  for (const tenantId of tenantIds) {
    try {
      const result = await evaluateMemberEngagementSignalsJob(tenantId);
      tenantResults.push({ tenantId, ...result });
    } catch (error) {
      failures.push({
        tenantId,
        error: error instanceof Error ? error.message : "Unknown scheduler failure",
      });
    }
  }

  const totals = tenantResults.reduce(
    (acc, tenantResult) => {
      acc.evaluatedEntities += tenantResult.evaluatedEntities;
      acc.generatedSuggestions += tenantResult.generatedSuggestions;
      return acc;
    },
    { evaluatedEntities: 0, generatedSuggestions: 0 },
  );

  return {
    processedAt: new Date().toISOString(),
    tenantCount: tenantIds.length,
    processedTenantCount: tenantResults.length,
    failedTenantCount: failures.length,
    totals,
    tenantResults,
    failures,
  };
}
