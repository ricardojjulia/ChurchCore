import {
  type ShepherdAiEvaluationInput,
  type ShepherdAiSuggestion,
} from "@/lib/shepherd-ai/types";
import { ConcernScorer } from "@/lib/shepherd-ai/concern-scorer";
import { ContextBuilder } from "@/lib/shepherd-ai/context-builder";
import { FaithSupportSelector } from "@/lib/shepherd-ai/faith-support-selector";
import { MessageDraftGenerator } from "@/lib/shepherd-ai/message-draft-generator";
import { ShepherdAiRepository } from "@/lib/shepherd-ai/repository";
import { SignalAggregator } from "@/lib/shepherd-ai/signal-aggregator";
import { SuggestionExplainer } from "@/lib/shepherd-ai/suggestion-explainer";
import { WorkflowRecommender } from "@/lib/shepherd-ai/workflow-recommender";

export class ShepherdAiOpsService {
  constructor(
    private readonly repository = new ShepherdAiRepository(),
    private readonly signalAggregator = new SignalAggregator(),
    private readonly concernScorer = new ConcernScorer(),
    private readonly contextBuilder = new ContextBuilder(),
    private readonly workflowRecommender = new WorkflowRecommender(),
    private readonly suggestionExplainer = new SuggestionExplainer(),
    private readonly faithSupportSelector = new FaithSupportSelector(),
    private readonly messageDraftGenerator = new MessageDraftGenerator(),
  ) {}

  evaluateForOps(input: ShepherdAiEvaluationInput): ShepherdAiSuggestion[] {
    const concerns = this.concernScorer.score(input.entityType, input.entityId, input.signals);

    return concerns.map((concern) => {
      const title = this.suggestionExplainer.buildTitle(concern.workflowCode);
      const summary = this.suggestionExplainer.buildSummary(concern.workflowCode);
      const explanation = this.suggestionExplainer.buildExplanation(
        concern.workflowCode,
        concern.confidenceScore,
        concern.urgency,
        input.signals,
        concern.reasons,
      );

      const contextDisplayName = String(input.context.displayName ?? "");

      return {
        workflowType: "ministry",
        workflowCode: concern.workflowCode,
        entityType: concern.entityType,
        entityId: concern.entityId,
        title,
        summary,
        confidenceScore: concern.confidenceScore,
        urgency: concern.urgency,
        suggestedActions: this.workflowRecommender.suggestedActions(concern.workflowCode),
        explanation,
        spiritualSupport: this.faithSupportSelector.select(concern.workflowCode),
        messageDraft: this.messageDraftGenerator.build(concern.workflowCode, contextDisplayName),
        boundaryNote: this.workflowRecommender.boundaryNote(concern.workflowCode),
        generatedAt: new Date().toISOString(),
        status: "suggested",
      };
    });
  }

  async evaluateTenantOps(tenantId: string, options?: { useAdminClient?: boolean }) {
    const metrics = await this.repository.listEntityMetrics(tenantId, options);

    const allSuggestions: ShepherdAiSuggestion[] = [];
    for (const metric of metrics) {
      const signals = this.signalAggregator.normalize(metric);
      if (!signals.length) continue;

      await this.repository.persistSignals(tenantId, signals, options);

      const context = this.contextBuilder.build(metric, signals);
      const suggestions = this.evaluateForOps({
        tenantId,
        productArea: "ops",
        entityType: metric.entityType,
        entityId: metric.entityId,
        signals,
        context,
      });
      allSuggestions.push(...suggestions);
    }

    const createdSuggestionIds = await this.repository.persistSuggestions(
      tenantId,
      allSuggestions,
      options,
    );

    return {
      evaluatedEntities: metrics.length,
      generatedSuggestions: allSuggestions.length,
      createdSuggestionIds,
    };
  }
}
