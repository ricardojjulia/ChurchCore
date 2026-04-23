import { describe, expect, it } from "vitest";

import { MessageDraftGenerator } from "@/lib/shepherd-ai/message-draft-generator";
import { WorkflowRecommender } from "@/lib/shepherd-ai/workflow-recommender";

describe("workflow recommendation guardrails", () => {
  it("provides suggested actions and boundary note for reconnect workflow", () => {
    const recommender = new WorkflowRecommender();

    const actions = recommender.suggestedActions("reconnect_inactive_member");
    const boundaryNote = recommender.boundaryNote("reconnect_inactive_member");

    expect(actions.map((a) => a.actionType)).toContain("assign_pastoral_follow_up");
    expect(boundaryNote.toLowerCase()).toContain("ops");
    expect(boundaryNote.toLowerCase()).toContain("not a diagnosis");
  });

  it("generates editable message draft without manipulative language", () => {
    const generator = new MessageDraftGenerator();
    const draft = generator.build("member_disengagement_trend", "Taylor");

    expect(draft).toContain("Taylor");
    expect(draft.toLowerCase()).toContain("check in");
    expect(draft.toLowerCase()).not.toContain("sin");
    expect(draft.toLowerCase()).not.toContain("rebellious");
  });
});
