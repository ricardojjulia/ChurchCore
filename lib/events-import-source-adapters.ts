import "server-only";

export type EventsImportSourceSystem = "generic_csv" | "planning_center" | "breeze";

export type NormalizedEventImportRow = {
  sourceId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  capacity: number | null;
  ministryName: string | null;
  approvalStatus: string | null;
};

type EventFieldAliases = {
  sourceId: string[];
  title: string[];
  description: string[];
  location: string[];
  startsAt: string[];
  endsAt: string[];
  capacity: string[];
  ministryName: string[];
  approvalStatus: string[];
};

export const EVENT_SOURCE_ALIASES: Record<EventsImportSourceSystem, EventFieldAliases> = {
  generic_csv: {
    sourceId: ["id", "source_id", "event_id"],
    title: ["title", "name", "event_name"],
    description: ["description", "notes"],
    location: ["location", "venue", "address"],
    startsAt: ["starts_at", "start_date", "start_time"],
    endsAt: ["ends_at", "end_date", "end_time"],
    capacity: ["capacity", "max_attendees"],
    ministryName: ["ministry", "ministry_name"],
    approvalStatus: ["status", "approval_status"],
  },
  planning_center: {
    sourceId: ["id", "event_id"],
    title: ["name", "title"],
    description: ["description"],
    location: ["location"],
    startsAt: ["starts_at", "start"],
    endsAt: ["ends_at", "end"],
    capacity: ["capacity"],
    ministryName: ["group_type", "ministry"],
    approvalStatus: ["status"],
  },
  breeze: {
    sourceId: ["id", "event_id"],
    title: ["name", "title"],
    description: ["description", "notes"],
    location: ["location", "venue"],
    startsAt: ["start_date"],
    endsAt: ["end_date"],
    capacity: ["capacity"],
    ministryName: ["category", "ministry"],
    approvalStatus: ["status"],
  },
};

export function pickEventField(row: Record<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = row[alias];
    if (value != null && value.trim().length > 0) return value;
  }
  return null;
}

function pickFirst(row: Record<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = row[alias];
    if (value != null && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

export function normalizeEventImportSourceRow(
  row: Record<string, string>,
  sourceSystem: EventsImportSourceSystem,
  rowIndex: number,
): NormalizedEventImportRow {
  const aliases = EVENT_SOURCE_ALIASES[sourceSystem] ?? EVENT_SOURCE_ALIASES.generic_csv;

  const rawSourceId = pickFirst(row, aliases.sourceId);
  const sourceId = rawSourceId ?? `EVT-${rowIndex + 1}`;

  const rawCapacity = pickFirst(row, aliases.capacity);
  let capacity: number | null = null;
  if (rawCapacity != null) {
    const parsed = parseInt(rawCapacity, 10);
    capacity = isNaN(parsed) ? null : parsed;
  }

  return {
    sourceId,
    title: pickFirst(row, aliases.title) ?? "",
    description: pickFirst(row, aliases.description),
    location: pickFirst(row, aliases.location),
    startsAt: pickFirst(row, aliases.startsAt),
    endsAt: pickFirst(row, aliases.endsAt),
    capacity,
    ministryName: pickFirst(row, aliases.ministryName),
    approvalStatus: pickFirst(row, aliases.approvalStatus),
  };
}
