import { describe, expect, it } from "vitest";

import { ConcernScorer } from "@/lib/shepherd-ai/concern-scorer";
import type { OpsSignal } from "@/lib/shepherd-ai/types";

function signal(signalType: OpsSignal["signalType"], value: number): OpsSignal {
  return {
    entityType: "member",
    entityId: "member-1",
    signalType,
    signalValue: value,
    signalWindow: "test",
    signalPayload: {},
    detectedAt: new Date().toISOString(),
  };
}

describe("ConcernScorer", () => {
  it("creates reconnect and disengagement concerns from deterministic signals", () => {
    const scorer = new ConcernScorer();
    const concerns = scorer.score("member", "member-1", [
      signal("attendance_decline", 0.8),
      signal("historical_attendance_consistency", 0.9),
      signal("service_participation_drop", 0.5),
      signal("group_participation_decline", 0.7),
      signal("communication_absence", 1),
    ]);

    expect(concerns.some((c) => c.workflowCode === "reconnect_inactive_member")).toBe(true);
    expect(concerns.some((c) => c.workflowCode === "member_disengagement_trend")).toBe(true);
  });

  it("creates volunteer fatigue concern when load and streak are elevated", () => {
    const scorer = new ConcernScorer();
    const concerns = scorer.score("volunteer", "volunteer-1", [
      {
        ...signal("volunteer_load", 0.9),
        entityType: "volunteer",
        entityId: "volunteer-1",
      },
      {
        ...signal("volunteer_streak", 0.8),
        entityType: "volunteer",
        entityId: "volunteer-1",
      },
    ]);

    expect(concerns).toHaveLength(1);
    expect(concerns[0]?.workflowCode).toBe("volunteer_fatigue");
    expect(concerns[0]?.urgency).toBe("high");
  });
});
