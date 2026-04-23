import type { ShepherdAiSpiritualSupport, ShepherdAiWorkflowCode } from "@/lib/shepherd-ai/types";

const SUPPORT_MAP: Record<ShepherdAiWorkflowCode, ShepherdAiSpiritualSupport> = {
  reconnect_inactive_member: {
    themes: ["encouragement", "community", "care"],
    scripture: ["Hebrews 10:24-25", "Galatians 6:2"],
  },
  volunteer_fatigue: {
    themes: ["rest", "sustainability", "service"],
    scripture: ["Matthew 11:28-30", "Mark 6:31"],
  },
  first_time_visitor_follow_up: {
    themes: ["welcome", "hospitality", "connection"],
    scripture: ["Romans 12:13", "1 Peter 4:9"],
  },
  member_disengagement_trend: {
    themes: ["care", "perseverance", "belonging"],
    scripture: ["Ecclesiastes 4:9-10", "Hebrews 3:13"],
  },
};

export class FaithSupportSelector {
  select(workflowCode: ShepherdAiWorkflowCode) {
    return SUPPORT_MAP[workflowCode];
  }
}
