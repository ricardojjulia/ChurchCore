"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import { MinistryWorkflowService } from "@/lib/ministry-workflows/service";
import { evaluateMemberEngagementSignalsJob } from "@/lib/shepherd-ai/scheduled-jobs";

const WORKFLOW_QUEUE_PATH = "/app/church-admin/workflows";
const MINISTRY_PATH = "/app/church-admin/ministry";
const PEOPLE_PATH = "/app/church-admin/people";

async function requireShepherdAdminSession() {
  const session = await requireChurchSession(WORKFLOW_QUEUE_PATH);
  const role = session.appContext.roleId;
  if (role !== "church-admin" && role !== "pastor") {
    throw new Error("Unauthorized: ShepherdAI workflows require church-admin or pastor role.");
  }
  return session;
}

const workflowService = new MinistryWorkflowService();

export async function runShepherdAiEvaluationAction() {
  const session = await requireShepherdAdminSession();
  const tenantId = session.appContext.church.id;

  const result = await evaluateMemberEngagementSignalsJob(tenantId);

  revalidatePath(WORKFLOW_QUEUE_PATH);
  revalidatePath(MINISTRY_PATH);
  revalidatePath(PEOPLE_PATH);

  return result;
}

export async function promoteSuggestionToWorkflowAction(input: {
  suggestionId: string;
  assignedToUserId?: string | null;
  dueAt?: string | null;
}) {
  const session = await requireShepherdAdminSession();
  const tenantId = session.appContext.church.id;

  const workflowId = await workflowService.createWorkflow({
    tenantId,
    suggestionId: input.suggestionId,
    ownerUserId: session.profile.id,
    assignedToUserId: input.assignedToUserId ?? null,
    dueAt: input.dueAt ?? null,
  });

  revalidatePath(WORKFLOW_QUEUE_PATH);
  revalidatePath(MINISTRY_PATH);
  revalidatePath(PEOPLE_PATH);

  return { ok: true, workflowId };
}

export async function assignWorkflowAction(input: {
  workflowId: string;
  assignedToUserId?: string | null;
}) {
  await requireShepherdAdminSession();
  await workflowService.assignWorkflow(input.workflowId, input.assignedToUserId ?? null);

  revalidatePath(WORKFLOW_QUEUE_PATH);
  revalidatePath(PEOPLE_PATH);

  return { ok: true };
}

export async function deferWorkflowAction(input: {
  workflowId: string;
  reason: string;
  dueAt?: string | null;
}) {
  await requireShepherdAdminSession();

  if (!input.reason.trim()) {
    throw new Error("A defer reason is required.");
  }

  await workflowService.deferWorkflow(input.workflowId, input.reason.trim(), input.dueAt ?? null);

  revalidatePath(WORKFLOW_QUEUE_PATH);

  return { ok: true };
}

export async function dismissWorkflowAction(input: {
  workflowId: string;
  reason: string;
  suggestionId?: string | null;
}) {
  await requireShepherdAdminSession();

  if (!input.reason.trim()) {
    throw new Error("A dismissal reason is required.");
  }

  await workflowService.dismissWorkflow(
    input.workflowId,
    input.reason.trim(),
    input.suggestionId ?? null,
  );

  revalidatePath(WORKFLOW_QUEUE_PATH);
  revalidatePath(PEOPLE_PATH);

  return { ok: true };
}

export async function completeWorkflowAction(input: {
  workflowId: string;
  notes?: string | null;
  suggestionId?: string | null;
}) {
  await requireShepherdAdminSession();
  await workflowService.completeWorkflow(
    input.workflowId,
    input.notes?.trim() || null,
    input.suggestionId ?? null,
  );

  revalidatePath(WORKFLOW_QUEUE_PATH);
  revalidatePath(PEOPLE_PATH);

  return { ok: true };
}

export async function recordWorkflowFeedbackAction(input: {
  workflowId: string;
  feedbackType: "helpful" | "not_helpful" | "false_positive" | "completed_with_adjustment";
  notes?: string | null;
}) {
  const session = await requireShepherdAdminSession();

  await workflowService.recordWorkflowFeedback({
    workflowId: input.workflowId,
    userId: session.profile.id,
    feedbackType: input.feedbackType,
    notes: input.notes?.trim() || null,
  });

  revalidatePath(WORKFLOW_QUEUE_PATH);
  return { ok: true };
}
