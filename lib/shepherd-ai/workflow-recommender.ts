import {
  SHEPHERD_AI_OPS_BOUNDARY_NOTE,
  type ShepherdAiSuggestedAction,
  type ShepherdAiWorkflowCode,
} from "@/lib/shepherd-ai/types";

function actions(workflowCode: ShepherdAiWorkflowCode): ShepherdAiSuggestedAction[] {
  switch (workflowCode) {
    case "reconnect_inactive_member":
      return [
        { actionType: "assign_pastoral_follow_up", label: "Assign pastoral follow-up" },
        { actionType: "send_encouragement_draft", label: "Send encouragement draft" },
        { actionType: "review_connection_pathways", label: "Review group or ministry connection" },
      ];
    case "volunteer_fatigue":
      return [
        { actionType: "notify_ministry_lead", label: "Notify ministry lead" },
        { actionType: "suggest_rotation", label: "Suggest rotation or short rest" },
        { actionType: "send_appreciation_draft", label: "Send appreciation draft" },
      ];
    case "first_time_visitor_follow_up":
      return [
        { actionType: "assign_welcome_outreach", label: "Assign welcome outreach" },
        { actionType: "send_welcome_draft", label: "Send welcome message draft" },
        { actionType: "invite_next_step", label: "Invite to a next step or group" },
      ];
    case "member_disengagement_trend":
      return [
        { actionType: "pastoral_review", label: "Pastoral review" },
        { actionType: "personalized_outreach", label: "Personalized outreach" },
        { actionType: "assess_connection_pathways", label: "Assess connection pathways" },
      ];
    default:
      return [{ actionType: "review", label: "Review suggestion" }];
  }
}

export class WorkflowRecommender {
  boundaryNote(workflowCode: ShepherdAiWorkflowCode) {
    if (workflowCode === "volunteer_fatigue") {
      return `${SHEPHERD_AI_OPS_BOUNDARY_NOTE} Frame as care for sustainability, not criticism.`;
    }
    if (workflowCode === "first_time_visitor_follow_up") {
      return `${SHEPHERD_AI_OPS_BOUNDARY_NOTE} Keep messaging warm and practical without assumptions.`;
    }
    return SHEPHERD_AI_OPS_BOUNDARY_NOTE;
  }

  suggestedActions(workflowCode: ShepherdAiWorkflowCode) {
    return actions(workflowCode);
  }
}
