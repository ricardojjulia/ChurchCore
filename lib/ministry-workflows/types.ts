export type MinistryWorkflowStatus =
  | "open"
  | "assigned"
  | "deferred"
  | "dismissed"
  | "completed";

export type CreateWorkflowInput = {
  tenantId: string;
  ownerUserId: string;
  suggestionId?: string;
  assignedToUserId?: string | null;
  dueAt?: string | null;
};

export type RecordFeedbackInput = {
  workflowId: string;
  userId: string;
  feedbackType: "helpful" | "not_helpful" | "false_positive" | "completed_with_adjustment";
  notes?: string | null;
};
