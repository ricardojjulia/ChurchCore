import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShepherdAiRepository } from "@/lib/shepherd-ai/repository";
import { getShepherdAiWorkflowQueueData } from "@/lib/shepherd-ai/ops-data";

const mocks = vi.hoisted(() => ({
  hasTenantBackendEnvMock: vi.fn(() => true),
  shouldUseLocalTenantFallbackMock: vi.fn(() => true),
  queryTenantLocalDbMock: vi.fn(),
  createTenantServerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  hasTenantBackendEnv: mocks.hasTenantBackendEnvMock,
  shouldUseLocalTenantFallback: mocks.shouldUseLocalTenantFallbackMock,
  queryTenantLocalDb: mocks.queryTenantLocalDbMock,
  createTenantServerClient: mocks.createTenantServerClientMock,
}));

describe("ops workflow queue data integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(ShepherdAiRepository.prototype, "listSuggestionQueue").mockResolvedValue([
      {
        id: "s1",
        workflow_code: "reconnect_inactive_member",
        entity_type: "member",
        entity_id: "member-1",
        title: "Reconnect Inactive Member",
        summary: "Attendance trend declined.",
        confidence_score: 0.81,
        urgency: "high",
        explanation_json: { whySurfaced: ["Attendance declined."] },
        boundary_note: "Suggested workflow only.",
        suggestion_status: "suggested",
        generated_at: new Date().toISOString(),
        workflow_id: null,
        workflow_status: null,
        assigned_to_user_id: null,
        assignee_name: null,
      },
    ] as never);

    mocks.queryTenantLocalDbMock.mockResolvedValue({
      rows: [{ id: "p1", full_name: "Jordan Cole" }],
    });
  });

  it("returns queue rows and assignees for the dashboard workflow queue", async () => {
    const data = await getShepherdAiWorkflowQueueData(
      {
        source: "supabase",
        profile: { id: "profile-1" },
        appContext: {
          church: { id: "tenant-1", name: "Grace Harbor" },
          roleId: "church-admin",
        },
      } as never,
    );

    expect(data.queue).toHaveLength(1);
    expect(data.queue[0]?.workflowCode).toBe("reconnect_inactive_member");
    expect(data.assignees).toEqual([{ id: "p1", fullName: "Jordan Cole" }]);
  });
});
