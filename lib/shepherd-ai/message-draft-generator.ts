import type { ShepherdAiWorkflowCode } from "@/lib/shepherd-ai/types";

function greeting(displayName: string) {
  return displayName ? `Hi ${displayName},` : "Hi there,";
}

export class MessageDraftGenerator {
  build(workflowCode: ShepherdAiWorkflowCode, displayName: string) {
    switch (workflowCode) {
      case "reconnect_inactive_member":
        return `${greeting(displayName)}\n\nOur team wanted to check in and let you know you are valued. If this season has been busy, we would still love to stay connected and support you however we can.\n\nWould you be open to a quick conversation this week?`;
      case "volunteer_fatigue":
        return `${greeting(displayName)}\n\nThank you for serving so faithfully. We noticed you have carried a full schedule recently and wanted to check whether a lighter rotation or short rest period would be helpful.\n\nWe appreciate you and want your serving rhythm to remain sustainable.`;
      case "first_time_visitor_follow_up":
        return `${greeting(displayName)}\n\nThank you for joining us recently. We are glad you visited and would love to help you find your next step in community.\n\nIf helpful, we can point you to a group or upcoming event that fits your interests.`;
      case "member_disengagement_trend":
        return `${greeting(displayName)}\n\nJust reaching out with care. We have missed seeing you and wanted to check in to see how you are doing.\n\nIf there is any way our church can support you in this season, we are here.`;
      default:
        return `${greeting(displayName)}\n\nWe wanted to check in with care and encouragement.`;
    }
  }
}
