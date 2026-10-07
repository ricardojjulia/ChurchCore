import "server-only";

import { pickField } from "@/lib/import-normalize";

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
    startsAt: ["start_date", "start_datetime"],
    endsAt: ["end_date", "end_datetime"],
    capacity: ["capacity"],
    ministryName: ["category", "ministry"],
    approvalStatus: ["status"],
  },
};

/** Every header alias the adapter reads for a source system; the rest are reported as ignored. */
export function eventConsumedAliases(sourceSystem: EventsImportSourceSystem): string[] {
  const aliases = EVENT_SOURCE_ALIASES[sourceSystem] ?? EVENT_SOURCE_ALIASES.generic_csv;
  return Object.values(aliases).flat();
}

/** Kept for callers that still import the old name; same lookup, tolerant header matching. */
export const pickEventField = pickField;

export function normalizeEventImportSourceRow(
  row: Record<string, string>,
  sourceSystem: EventsImportSourceSystem,
  rowIndex: number,
): NormalizedEventImportRow {
  const aliases = EVENT_SOURCE_ALIASES[sourceSystem] ?? EVENT_SOURCE_ALIASES.generic_csv;

  const rawSourceId = pickField(row, aliases.sourceId);
  const sourceId = rawSourceId ?? `EVT-${rowIndex + 1}`;

  const rawCapacity = pickField(row, aliases.capacity);
  let capacity: number | null = null;
  if (rawCapacity != null) {
    const parsed = parseInt(rawCapacity, 10);
    capacity = isNaN(parsed) ? null : parsed;
  }

  return {
    sourceId,
    title: pickField(row, aliases.title) ?? "",
    description: pickField(row, aliases.description),
    location: pickField(row, aliases.location),
    startsAt: pickField(row, aliases.startsAt),
    endsAt: pickField(row, aliases.endsAt),
    capacity,
    ministryName: pickField(row, aliases.ministryName),
    approvalStatus: pickField(row, aliases.approvalStatus),
  };
}
