import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  requireChurchSessionMock,
  evaluateMemberEngagementSignalsJobMock,
  createWorkflowMock,
  assignWorkflowMock,
  deferWorkflowMock,
  dismissWorkflowMock,
  completeWorkflowMock,
  recordWorkflowFeedbackMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  requireChurchSessionMock: vi.fn(),
  evaluateMemberEngagementSignalsJobMock: vi.fn(),
  createWorkflowMock: vi.fn(),
  assignWorkflowMock: vi.fn(),
  deferWorkflowMock: vi.fn(),
  dismissWorkflowMock: vi.fn(),
  completeWorkflowMock: vi.fn(),
  recordWorkflowFeedbackMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth", () => ({
  requireChurchSession: requireChurchSessionMock,
}));

vi.mock("@/lib/shepherd-ai/scheduled-jobs", () => ({
  evaluateMemberEngagementSignalsJob: evaluateMemberEngagementSignalsJobMock,
}));

vi.mock("@/lib/ministry-workflows/service", () => ({
  MinistryWorkflowService: vi.fn().mockImplementation(function MockMinistryWorkflowService(this: Record<string, unknown>) {
    this.createWorkflow = createWorkflowMock;
    this.assignWorkflow = assignWorkflowMock;
    this.deferWorkflow = deferWorkflowMock;
    this.dismissWorkflow = dismissWorkflowMock;
    this.completeWorkflow = completeWorkflowMock;
    this.recordWorkflowFeedback = recordWorkflowFeedbackMock;
  }),
}));

import {
  assignWorkflowAction,
  completeWorkflowAction,
  deferWorkflowAction,
  dismissWorkflowAction,
  promoteSuggestionToWorkflowAction,
  recordWorkflowFeedbackAction,
  runShepherdAiEvaluationAction,
} from "@/app/app/shepherd-ai-actions";

const WORKFLOW_QUEUE_PATH = "/app/church-admin/workflows";
const MINISTRY_PATH = "/app/church-admin/ministry";
const PEOPLE_PATH = "/app/church-admin/people";

describe("shepherd-ai actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireChurchSessionMock.mockResolvedValue({
      appContext: { roleId: "church-admin", church: { id: "church-1" } },
      profile: { id: "profile-1" },
    });
  });

  it("rejects roles outside church-admin and pastor", async () => {
    requireChurchSessionMock.mockResolvedValueOnce({
      appContext: { roleId: "member", church: { id: "church-1" } },
      profile: { id: "profile-1" },
    });

    await expect(runShepherdAiEvaluationAction()).rejects.toThrow(
      "Unauthorized: ShepherdAI workflows require church-admin or pastor role.",
    );
    expect(evaluateMemberEngagementSignalsJobMock).not.toHaveBeenCalled();
  });

  it("runs the evaluation job and revalidates the workflow, ministry, and people paths", async () => {
    evaluateMemberEngagementSignalsJobMock.mockResolvedValueOnce({ evaluated: 3 });

    const result = await runShepherdAiEvaluationAction();

    expect(evaluateMemberEngagementSignalsJobMock).toHaveBeenCalledWith("church-1");
    expect(result).toEqual({ evaluated: 3 });
    expect(revalidatePathMock).toHaveBeenCalledWith(WORKFLOW_QUEUE_PATH);
    expect(revalidatePathMock).toHaveBeenCalledWith(MINISTRY_PATH);
    expect(revalidatePathMock).toHaveBeenCalledWith(PEOPLE_PATH);
  });

  it("promotes a suggestion to a workflow", async () => {
    createWorkflowMock.mockResolvedValueOnce("workflow-1");

    const result = await promoteSuggestionToWorkflowAction({ suggestionId: "suggestion-1" });

    expect(createWorkflowMock).toHaveBeenCalledWith({
      tenantId: "church-1",
      suggestionId: "suggestion-1",
      ownerUserId: "profile-1",
      assignedToUserId: null,
      dueAt: null,
    });
    expect(result).toEqual({ ok: true, workflowId: "workflow-1" });
  });

  it("assigns a workflow", async () => {
    const result = await assignWorkflowAction({ workflowId: "workflow-1", assignedToUserId: "user-2" });

    expect(assignWorkflowMock).toHaveBeenCalledWith("workflow-1", "user-2");
    expect(result).toEqual({ ok: true });
  });

  it("requires a defer reason", async () => {
    await expect(
      deferWorkflowAction({ workflowId: "workflow-1", reason: "  " }),
    ).rejects.toThrow("A defer reason is required.");
    expect(deferWorkflowMock).not.toHaveBeenCalled();
  });

  it("defers a workflow with a trimmed reason", async () => {
    const result = await deferWorkflowAction({ workflowId: "workflow-1", reason: " busy week " });

    expect(deferWorkflowMock).toHaveBeenCalledWith("workflow-1", "busy week", null);
    expect(result).toEqual({ ok: true });
  });

  it("requires a dismissal reason", async () => {
    await expect(
      dismissWorkflowAction({ workflowId: "workflow-1", reason: "" }),
    ).rejects.toThrow("A dismissal reason is required.");
    expect(dismissWorkflowMock).not.toHaveBeenCalled();
  });

  it("dismisses a workflow", async () => {
    const result = await dismissWorkflowAction({ workflowId: "workflow-1", reason: "duplicate" });

    expect(dismissWorkflowMock).toHaveBeenCalledWith("workflow-1", "duplicate", null);
    expect(result).toEqual({ ok: true });
  });

  it("completes a workflow", async () => {
    const result = await completeWorkflowAction({ workflowId: "workflow-1", notes: " done " });

    expect(completeWorkflowMock).toHaveBeenCalledWith("workflow-1", "done", null);
    expect(result).toEqual({ ok: true });
  });

  it("records workflow feedback", async () => {
    const result = await recordWorkflowFeedbackAction({
      workflowId: "workflow-1",
      feedbackType: "helpful",
      notes: " great ",
    });

    expect(recordWorkflowFeedbackMock).toHaveBeenCalledWith({
      workflowId: "workflow-1",
      userId: "profile-1",
      feedbackType: "helpful",
      notes: "great",
    });
    expect(result).toEqual({ ok: true });
  });
});
