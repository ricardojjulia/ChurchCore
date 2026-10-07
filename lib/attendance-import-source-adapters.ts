import "server-only";

import { contentSourceId, parseImportDate, pickField } from "@/lib/import-normalize";

export type AttendanceImportSourceSystem = "generic_csv" | "planning_center" | "breeze";

export type NormalizedAttendanceImportRow = {
  sourceId: string;
  profileEmail: string | null;
  /** The vendor's person id (Breeze ID), matched against profiles.member_number. */
  memberNumber: string | null;
  /** Breeze ID "Anonymous": a head-count line with no person attached. */
  anonymousPerson: boolean;
  eventSourceId: string | null;
  /** Event name as exported (Breeze); matched to an event by title and church-local day. */
  eventName: string | null;
  checkedInAt: string | null;
  status: string | null;
  /** sourceId was derived from the row's content, so the dry run appends an occurrence counter. */
  synthetic: boolean;
};

type AttendanceFieldAliases = {
  sourceId: string[];
  profileEmail: string[];
  memberNumber: string[];
  eventSourceId: string[];
  eventName: string[];
  checkedInAt: string[];
  status: string[];
};

export const ATTENDANCE_SOURCE_ALIASES: Record<AttendanceImportSourceSystem, AttendanceFieldAliases> = {
  generic_csv: {
    sourceId: ["id", "source_id", "attendance_id"],
    profileEmail: ["email", "profile_email", "member_email"],
    memberNumber: [],
    eventSourceId: ["event_id", "event_source_id"],
    eventName: [],
    checkedInAt: ["checked_in_at", "attended_at", "check_in_time"],
    status: ["status", "attendance_status"],
  },
  planning_center: {
    sourceId: ["id", "attendance_id"],
    profileEmail: ["email", "person_email"],
    memberNumber: [],
    eventSourceId: ["event_id"],
    eventName: [],
    checkedInAt: ["checked_in_at", "attended_at"],
    status: ["status"],
  },
  breeze: {
    sourceId: ["id", "attendance_id"],
    profileEmail: ["email", "member_email"],
    memberNumber: ["breeze_id"],
    eventSourceId: ["event_id"],
    eventName: ["event_name"],
    checkedInAt: ["date", "attended_at"],
    status: ["status"],
  },
};

/** Every header alias the adapter reads for a source system; the rest are reported as ignored. */
export function attendanceConsumedAliases(sourceSystem: AttendanceImportSourceSystem): string[] {
  const aliases = ATTENDANCE_SOURCE_ALIASES[sourceSystem] ?? ATTENDANCE_SOURCE_ALIASES.generic_csv;
  return Object.values(aliases).flat();
}

/** Kept for callers that still import the old name; same lookup, tolerant header matching. */
export const pickAttendanceField = pickField;

export function normalizeAttendanceImportSourceRow(
  row: Record<string, string>,
  sourceSystem: AttendanceImportSourceSystem,
  rowIndex: number,
  options: { timeZone?: string | null } = {},
): NormalizedAttendanceImportRow {
  const aliases = ATTENDANCE_SOURCE_ALIASES[sourceSystem] ?? ATTENDANCE_SOURCE_ALIASES.generic_csv;

  const rawMemberNumber = pickField(row, aliases.memberNumber)?.trim() ?? null;
  const anonymousPerson = rawMemberNumber?.toLowerCase() === "anonymous";
  const eventName = pickField(row, aliases.eventName)?.trim() ?? null;
  const checkedInAt = pickField(row, aliases.checkedInAt);

  const explicitSourceId = pickField(row, aliases.sourceId)?.trim() || null;
  const synthetic = explicitSourceId === null && sourceSystem === "breeze";

  let sourceId: string;
  if (explicitSourceId) {
    sourceId = explicitSourceId;
  } else if (synthetic) {
    // The same check-in hashes the same wherever it sits in the file.
    const date = parseImportDate(checkedInAt, options.timeZone);
    sourceId = contentSourceId("brz-att", [
      rawMemberNumber,
      eventName,
      date.ok ? date.instant : checkedInAt,
    ]);
  } else {
    sourceId = `ATT-${rowIndex + 1}`;
  }

  return {
    sourceId,
    profileEmail: pickField(row, aliases.profileEmail),
    memberNumber: anonymousPerson ? null : rawMemberNumber,
    anonymousPerson,
    eventSourceId: pickField(row, aliases.eventSourceId),
    eventName,
    checkedInAt,
    status: pickField(row, aliases.status),
    synthetic,
  };
}
