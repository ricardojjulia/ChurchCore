import type { OpsSignal, ScoredConcern, ShepherdAiUrgency } from "@/lib/shepherd-ai/types";

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function urgencyFromScore(score: number): ShepherdAiUrgency {
  if (score >= 80) return "high";
  if (score >= 55) return "medium";
  return "low";
}

function getSignalValue(signals: OpsSignal[], signalType: OpsSignal["signalType"]) {
  return signals.find((signal) => signal.signalType === signalType)?.signalValue ?? 0;
}

export class ConcernScorer {
  score(entityType: ScoredConcern["entityType"], entityId: string, signals: OpsSignal[]) {
    const concerns: ScoredConcern[] = [];

    const attendanceDecline = getSignalValue(signals, "attendance_decline");
    const attendanceConsistency = getSignalValue(
      signals,
      "historical_attendance_consistency",
    );
    const serviceDrop = getSignalValue(signals, "service_participation_drop");
    const volunteerLoad = getSignalValue(signals, "volunteer_load");
    const volunteerStreak = getSignalValue(signals, "volunteer_streak");
    const visitorGap = getSignalValue(signals, "first_time_visit_without_follow_up");
    const groupDrop = getSignalValue(signals, "group_participation_decline");
    const communicationAbsence = getSignalValue(signals, "communication_absence");

    const reconnectScore = clampScore(
      attendanceDecline * 55 +
        attendanceConsistency * 20 +
        serviceDrop * 15 +
        communicationAbsence * 10,
    );

    if (entityType === "member" && reconnectScore >= 50 && attendanceDecline >= 0.4) {
      concerns.push({
        workflowCode: "reconnect_inactive_member",
        entityType,
        entityId,
        score: reconnectScore,
        confidenceScore: Math.max(0.5, reconnectScore / 100),
        urgency: urgencyFromScore(reconnectScore),
        reasons: [
          "Attendance has declined relative to prior consistency.",
          "No recent confirmed outreach is visible in Ops signals.",
        ],
      });
    }

    const fatigueScore = clampScore(volunteerLoad * 60 + volunteerStreak * 40);
    if (entityType === "volunteer" && fatigueScore >= 55) {
      concerns.push({
        workflowCode: "volunteer_fatigue",
        entityType,
        entityId,
        score: fatigueScore,
        confidenceScore: Math.max(0.55, fatigueScore / 100),
        urgency: urgencyFromScore(fatigueScore),
        reasons: [
          "Volunteer load is above configured baseline.",
          "Consecutive service streak suggests limited recovery time.",
        ],
      });
    }

    const firstTimeScore = clampScore(visitorGap * 100);
    if (entityType === "visitor" && firstTimeScore >= 50) {
      concerns.push({
        workflowCode: "first_time_visitor_follow_up",
        entityType,
        entityId,
        score: firstTimeScore,
        confidenceScore: Math.max(0.6, firstTimeScore / 100),
        urgency: urgencyFromScore(firstTimeScore),
        reasons: [
          "First visit was recorded, but follow-up window appears overdue.",
        ],
      });
    }

    const disengagementScore = clampScore(
      attendanceDecline * 40 +
        serviceDrop * 25 +
        groupDrop * 20 +
        communicationAbsence * 15,
    );

    if (entityType === "member" && disengagementScore >= 55) {
      concerns.push({
        workflowCode: "member_disengagement_trend",
        entityType,
        entityId,
        score: disengagementScore,
        confidenceScore: Math.max(0.55, disengagementScore / 100),
        urgency: urgencyFromScore(disengagementScore),
        reasons: [
          "Multiple participation signals moved downward in the same period.",
          "Communication response signal indicates reduced engagement.",
        ],
      });
    }

    return concerns;
  }
}
