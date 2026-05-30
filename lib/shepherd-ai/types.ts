export const SHEPHERD_AI_OPS_BOUNDARY_NOTE =
  "Suggested workflow only. ChurchCore ShepherdAI uses ChurchCore data and Ops ministry patterns only. It may indicate a pattern, not a diagnosis or certainty about personal causes.";

export type ShepherdAiWorkflowCode =
  | "reconnect_inactive_member"
  | "volunteer_fatigue"
  | "first_time_visitor_follow_up"
  | "member_disengagement_trend";

export type ShepherdAiUrgency = "low" | "medium" | "high";
export type ShepherdAiStatus =
  | "suggested"
  | "promoted"
  | "deferred"
  | "dismissed"
  | "completed";

export type ShepherdAiEntityType = "member" | "visitor" | "volunteer";

export type OpsSignalType =
  | "attendance_decline"
  | "historical_attendance_consistency"
  | "service_participation_drop"
  | "volunteer_load"
  | "volunteer_streak"
  | "first_time_visit_without_follow_up"
  | "group_participation_decline"
  | "communication_absence";

export type OpsSignal = {
  entityType: ShepherdAiEntityType;
  entityId: string;
  signalType: OpsSignalType;
  signalValue: number;
  signalWindow: string;
  signalPayload: Record<string, unknown>;
  detectedAt: string;
};

export type ShepherdAiSuggestedAction = {
  actionType: string;
  label: string;
  payload?: Record<string, unknown>;
};

export type ShepherdAiExplanation = {
  detected: string[];
  whySurfaced: string[];
  confidenceReason: string;
  urgencyReason: string;
};

export type ShepherdAiSpiritualSupport = {
  themes: string[];
  scripture?: string[];
};

export type ShepherdAiSuggestion = {
  workflowType: "ministry";
  workflowCode: ShepherdAiWorkflowCode;
  entityType: ShepherdAiEntityType;
  entityId: string;
  title: string;
  summary: string;
  confidenceScore: number;
  urgency: ShepherdAiUrgency;
  suggestedActions: ShepherdAiSuggestedAction[];
  explanation: ShepherdAiExplanation;
  spiritualSupport?: ShepherdAiSpiritualSupport;
  messageDraft?: string;
  boundaryNote: string;
  generatedAt: string;
  status: ShepherdAiStatus;
};

export type ShepherdAiEvaluationInput = {
  tenantId: string;
  productArea: "ops";
  entityType: ShepherdAiEntityType;
  entityId: string;
  signals: OpsSignal[];
  context: Record<string, unknown>;
};

export type ScoredConcern = {
  workflowCode: ShepherdAiWorkflowCode;
  entityType: ShepherdAiEntityType;
  entityId: string;
  score: number;
  confidenceScore: number;
  urgency: ShepherdAiUrgency;
  reasons: string[];
};

export type MemberSignalContext = {
  entityType: ShepherdAiEntityType;
  entityId: string;
  displayName: string;
  firstVisitDate?: string | null;
  hasFollowUp?: boolean;
  recentOutreachAt?: string | null;
  contextPayload: Record<string, unknown>;
};
