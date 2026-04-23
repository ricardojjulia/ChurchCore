import type {
  OpsSignal,
  ShepherdAiExplanation,
  ShepherdAiWorkflowCode,
} from "@/lib/shepherd-ai/types";

const TITLES: Record<ShepherdAiWorkflowCode, string> = {
  reconnect_inactive_member: "Reconnect Inactive Member",
  volunteer_fatigue: "Volunteer Fatigue Care Check",
  first_time_visitor_follow_up: "First-Time Visitor Follow-Up",
  member_disengagement_trend: "Member Disengagement Trend",
};

const SUMMARY_TEMPLATES: Record<ShepherdAiWorkflowCode, string> = {
  reconnect_inactive_member:
    "Attendance and participation patterns suggest this member may benefit from a gentle reconnect workflow.",
  volunteer_fatigue:
    "Service cadence and load suggest this volunteer may benefit from a sustainability check and possible rotation.",
  first_time_visitor_follow_up:
    "A first-time visitor follow-up appears pending beyond the target outreach window.",
  member_disengagement_trend:
    "Multiple involvement indicators have declined relative to prior patterns and may benefit from pastoral review.",
};

function humanizeSignalType(signalType: OpsSignal["signalType"]) {
  switch (signalType) {
    case "attendance_decline":
      return "Attendance has declined compared with prior weeks.";
    case "historical_attendance_consistency":
      return "Past attendance history shows this pattern is a change from prior consistency.";
    case "service_participation_drop":
      return "Serving activity has declined in the recent window.";
    case "volunteer_load":
      return "Current volunteer load is elevated relative to baseline.";
    case "volunteer_streak":
      return "Consecutive serving streak has exceeded normal rotation patterns.";
    case "first_time_visit_without_follow_up":
      return "First-time visit follow-up window appears overdue.";
    case "group_participation_decline":
      return "Group participation has declined in recent meetings.";
    case "communication_absence":
      return "No recent communication response is visible in Ops records.";
    default:
      return "A structured Ops signal triggered this workflow suggestion.";
  }
}

export class SuggestionExplainer {
  buildTitle(workflowCode: ShepherdAiWorkflowCode) {
    return TITLES[workflowCode];
  }

  buildSummary(workflowCode: ShepherdAiWorkflowCode) {
    return SUMMARY_TEMPLATES[workflowCode];
  }

  buildExplanation(
    workflowCode: ShepherdAiWorkflowCode,
    confidenceScore: number,
    urgency: "low" | "medium" | "high",
    signals: OpsSignal[],
    reasons: string[],
  ): ShepherdAiExplanation {
    const detected = signals
      .filter((signal) => signal.signalValue > 0)
      .map((signal) => humanizeSignalType(signal.signalType));

    const confidenceReason =
      confidenceScore >= 0.75
        ? "Confidence is higher because multiple aligned Ops signals were detected."
        : "Confidence is moderate because the suggestion is based on a limited signal set.";

    const urgencyReason =
      urgency === "high"
        ? "Urgency is high because the signal pattern is sustained and significant."
        : urgency === "medium"
          ? "Urgency is medium because the pattern is notable but may be early-stage."
          : "Urgency is low because the signal pattern is emerging and should be monitored.";

    return {
      detected,
      whySurfaced: reasons,
      confidenceReason,
      urgencyReason,
    };
  }
}
