import type { MemberSignalContext, OpsSignal } from "@/lib/shepherd-ai/types";

export type EntityMetrics = MemberSignalContext & {
  attendanceDecline: number;
  attendanceConsistency: number;
  serviceDrop: number;
  volunteerLoad: number;
  volunteerStreak: number;
  firstTimeVisitorGap: number;
  groupParticipationDecline: number;
  communicationAbsence: number;
};

function nowIso() {
  return new Date().toISOString();
}

function signal(
  entityType: OpsSignal["entityType"],
  entityId: string,
  signalType: OpsSignal["signalType"],
  signalValue: number,
  signalWindow: string,
  signalPayload: Record<string, unknown>,
): OpsSignal {
  return {
    entityType,
    entityId,
    signalType,
    signalValue: Math.max(0, Math.min(1, signalValue)),
    signalWindow,
    signalPayload,
    detectedAt: nowIso(),
  };
}

export class SignalAggregator {
  normalize(entity: EntityMetrics) {
    const basePayload = {
      displayName: entity.displayName,
      context: entity.contextPayload,
    };

    const signals: OpsSignal[] = [
      signal(
        entity.entityType,
        entity.entityId,
        "attendance_decline",
        entity.attendanceDecline,
        "last_8_weeks",
        basePayload,
      ),
      signal(
        entity.entityType,
        entity.entityId,
        "historical_attendance_consistency",
        entity.attendanceConsistency,
        "baseline_8_weeks",
        basePayload,
      ),
      signal(
        entity.entityType,
        entity.entityId,
        "service_participation_drop",
        entity.serviceDrop,
        "last_8_weeks",
        basePayload,
      ),
      signal(
        entity.entityType,
        entity.entityId,
        "volunteer_load",
        entity.volunteerLoad,
        "last_6_weeks",
        basePayload,
      ),
      signal(
        entity.entityType,
        entity.entityId,
        "volunteer_streak",
        entity.volunteerStreak,
        "last_6_weeks",
        basePayload,
      ),
      signal(
        entity.entityType,
        entity.entityId,
        "first_time_visit_without_follow_up",
        entity.firstTimeVisitorGap,
        "72_hours",
        basePayload,
      ),
      signal(
        entity.entityType,
        entity.entityId,
        "group_participation_decline",
        entity.groupParticipationDecline,
        "last_8_weeks",
        basePayload,
      ),
      signal(
        entity.entityType,
        entity.entityId,
        "communication_absence",
        entity.communicationAbsence,
        "last_21_days",
        basePayload,
      ),
    ];

    return signals.filter((entry) => entry.signalValue > 0);
  }
}
