import { describe, expect, it } from "vitest";

import { SignalAggregator } from "@/lib/shepherd-ai/signal-aggregator";

describe("SignalAggregator", () => {
  it("normalizes ministry signals into bounded structured entries", () => {
    const aggregator = new SignalAggregator();

    const signals = aggregator.normalize({
      entityType: "member",
      entityId: "member-1",
      displayName: "Alex Rivera",
      firstVisitDate: null,
      hasFollowUp: false,
      recentOutreachAt: null,
      contextPayload: {},
      attendanceDecline: 0.72,
      attendanceConsistency: 0.88,
      serviceDrop: 0.4,
      volunteerLoad: 0.1,
      volunteerStreak: 0.2,
      firstTimeVisitorGap: 0,
      groupParticipationDecline: 0.5,
      communicationAbsence: 1,
    });

    expect(signals.length).toBeGreaterThan(0);
    expect(signals.find((s) => s.signalType === "attendance_decline")?.signalValue).toBe(0.72);
    expect(signals.find((s) => s.signalType === "communication_absence")?.signalValue).toBe(1);
    expect(signals.every((s) => s.signalValue >= 0 && s.signalValue <= 1)).toBe(true);
  });
});
