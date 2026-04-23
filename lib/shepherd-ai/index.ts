import type {
  ShepherdAiEvaluationInput,
  ShepherdAiSuggestion,
} from "@/lib/shepherd-ai/types";
import { ShepherdAiOpsService } from "@/lib/shepherd-ai/service";

const service = new ShepherdAiOpsService();

export function evaluateForOps(input: ShepherdAiEvaluationInput): ShepherdAiSuggestion[] {
  return service.evaluateForOps(input);
}

export async function evaluateTenantForOps(tenantId: string) {
  return service.evaluateTenantOps(tenantId);
}
