import "server-only";

export type AttendanceImportSourceSystem = "generic_csv" | "planning_center" | "breeze";

export type NormalizedAttendanceImportRow = {
  sourceId: string;
  profileEmail: string | null;
  eventSourceId: string | null;
  checkedInAt: string | null;
  status: string | null;
};

type AttendanceFieldAliases = {
  sourceId: string[];
  profileEmail: string[];
  eventSourceId: string[];
  checkedInAt: string[];
  status: string[];
};

export const ATTENDANCE_SOURCE_ALIASES: Record<AttendanceImportSourceSystem, AttendanceFieldAliases> = {
  generic_csv: {
    sourceId: ["id", "source_id", "attendance_id"],
    profileEmail: ["email", "profile_email", "member_email"],
    eventSourceId: ["event_id", "event_source_id"],
    checkedInAt: ["checked_in_at", "attended_at", "check_in_time"],
    status: ["status", "attendance_status"],
  },
  planning_center: {
    sourceId: ["id", "attendance_id"],
    profileEmail: ["email", "person_email"],
    eventSourceId: ["event_id"],
    checkedInAt: ["checked_in_at", "attended_at"],
    status: ["status"],
  },
  breeze: {
    sourceId: ["id", "attendance_id"],
    profileEmail: ["email", "member_email"],
    eventSourceId: ["event_id"],
    checkedInAt: ["attended_at"],
    status: ["status"],
  },
};

export function pickAttendanceField(row: Record<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = row[alias];
    if (value != null && value.trim().length > 0) return value;
  }
  return null;
}

export function normalizeAttendanceImportSourceRow(
  row: Record<string, string>,
  sourceSystem: AttendanceImportSourceSystem,
  rowIndex: number,
): NormalizedAttendanceImportRow {
  const aliases = ATTENDANCE_SOURCE_ALIASES[sourceSystem] ?? ATTENDANCE_SOURCE_ALIASES.generic_csv;

  const rawSourceId = pickAttendanceField(row, aliases.sourceId);
  const sourceId = rawSourceId ?? `ATT-${rowIndex + 1}`;

  return {
    sourceId,
    profileEmail: pickAttendanceField(row, aliases.profileEmail),
    eventSourceId: pickAttendanceField(row, aliases.eventSourceId),
    checkedInAt: pickAttendanceField(row, aliases.checkedInAt),
    status: pickAttendanceField(row, aliases.status),
  };
}
