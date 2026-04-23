import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  shouldUseLocalTenantFallbackMock: vi.fn(() => true),
  queryTenantLocalDbMock: vi.fn(),
  createTenantServerClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/tenant", () => ({
  shouldUseLocalTenantFallback: mocks.shouldUseLocalTenantFallbackMock,
  queryTenantLocalDb: mocks.queryTenantLocalDbMock,
  createTenantServerClient: mocks.createTenantServerClientMock,
}));

import { MinistryWorkflowService } from "@/lib/ministry-workflows/service";

describe("MinistryWorkflowService integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("promotes a suggestion into a workflow and logs action", async () => {
    mocks.queryTenantLocalDbMock
      .mockResolvedValueOnce({ rows: [{ id: "workflow-1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const service = new MinistryWorkflowService();
    const workflowId = await service.createWorkflow({
      tenantId: "tenant-1",
      ownerUserId: "owner-1",
      suggestionId: "suggestion-1",
      assignedToUserId: null,
      dueAt: null,
    });

    expect(workflowId).toBe("workflow-1");
    expect(mocks.queryTenantLocalDbMock).toHaveBeenCalledTimes(3);
    expect(String(mocks.queryTenantLocalDbMock.mock.calls[1]?.[0])).toContain(
      "update public.ai_suggestions",
    );
  });
});
