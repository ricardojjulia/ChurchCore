import { ShepherdAiOpsService } from "@/lib/shepherd-ai/service";

const service = new ShepherdAiOpsService();

export async function evaluateMemberEngagementSignalsJob(tenantId: string) {
  return service.evaluateTenantOps(tenantId, { useAdminClient: true });
}

export async function evaluateVolunteerFatigueSignalsJob(tenantId: string) {
  return service.evaluateTenantOps(tenantId, { useAdminClient: true });
}

export async function evaluateFirstTimeVisitorFollowUpSignalsJob(tenantId: string) {
  return service.evaluateTenantOps(tenantId, { useAdminClient: true });
}

export async function generateMinistryWorkflowSuggestionsJob(tenantId: string) {
  return service.evaluateTenantOps(tenantId, { useAdminClient: true });
}
