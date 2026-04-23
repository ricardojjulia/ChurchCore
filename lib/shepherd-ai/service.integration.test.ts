import { describe, expect, it, vi } from "vitest";

import { ShepherdAiOpsService } from "@/lib/shepherd-ai/service";
import type { ShepherdAiSuggestion } from "@/lib/shepherd-ai/types";
import type { EntityMetrics } from "@/lib/shepherd-ai/signal-aggregator";

describe("ShepherdAiOpsService integration", () => {
  it("evaluates entity metrics and persists signals and suggestions", async () => {
    const metrics: EntityMetrics[] = [
      {
        entityType: "member",
        entityId: "member-1",
        displayName: "Jordan Cole",
        firstVisitDate: null,
        hasFollowUp: false,
        recentOutreachAt: null,
        contextPayload: {},
        attendanceDecline: 0.75,
        attendanceConsistency: 0.85,
        serviceDrop: 0.4,
        volunteerLoad: 0,
        volunteerStreak: 0,
        firstTimeVisitorGap: 0,
        groupParticipationDecline: 0.5,
        communicationAbsence: 1,
      },
    ];

    const repository = {
      listEntityMetrics: vi.fn(async () => metrics),
      persistSignals: vi.fn(async () => {}),
      persistSuggestions: vi.fn(async (_tenantId: string, suggestions: ShepherdAiSuggestion[]) =>
        suggestions.map((_, index) => `suggestion-${index}`),
      ),
    };

    const service = new ShepherdAiOpsService(repository as never);
    const result = await service.evaluateTenantOps("tenant-1");

    expect(repository.listEntityMetrics).toHaveBeenCalledWith("tenant-1");
    expect(repository.persistSignals).toHaveBeenCalled();
    expect(repository.persistSuggestions).toHaveBeenCalled();
    expect(result.generatedSuggestions).toBeGreaterThan(0);
    expect(result.createdSuggestionIds.length).toBeGreaterThan(0);
  });
});
