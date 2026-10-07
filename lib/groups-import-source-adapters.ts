import "server-only";

import { normalizeHeaderKey, pickField } from "@/lib/import-normalize";

export type GroupsImportSourceSystem = "generic_csv" | "planning_center" | "breeze";

export type NormalizedGroupImportRow = {
  sourceId: string;
  name: string;
  category: string | null;
  description: string | null;
  leaderEmail: string | null;
  isActive: boolean;
};

type GroupFieldAliases = {
  sourceId: string[];
  name: string[];
  category: string[];
  description: string[];
  leaderEmail: string[];
  status: string[];
};

const GROUP_SOURCE_ALIASES: Record<GroupsImportSourceSystem, GroupFieldAliases> = {
  generic_csv: {
    sourceId: ["id", "source_id", "group_id"],
    name: ["name", "group_name"],
    category: ["category", "type", "group_type"],
    description: ["description", "notes"],
    leaderEmail: ["leader_email", "leader_email_address"],
    status: ["status", "active"],
  },
  planning_center: {
    sourceId: ["id", "group_id"],
    name: ["name", "group_name"],
    category: ["group_type", "category"],
    description: ["description"],
    leaderEmail: ["contact_email", "leader_email"],
    status: ["status"],
  },
  breeze: {
    sourceId: ["id", "group_id"],
    name: ["name", "group_name"],
    category: ["type", "category"],
    description: ["description", "notes"],
    leaderEmail: ["email", "leader_email"],
    status: ["status", "active"],
  },
};

/** Every header alias the adapter reads for a source system; the rest are reported as ignored. */
export function groupConsumedAliases(sourceSystem: GroupsImportSourceSystem): string[] {
  const aliases = GROUP_SOURCE_ALIASES[sourceSystem] ?? GROUP_SOURCE_ALIASES.generic_csv;
  return Object.values(aliases).flat();
}

export function normalizeGroupImportSourceRow(
  row: Record<string, string>,
  sourceSystem: GroupsImportSourceSystem,
  rowIndex: number,
): NormalizedGroupImportRow {
  const aliases = GROUP_SOURCE_ALIASES[sourceSystem] ?? GROUP_SOURCE_ALIASES.generic_csv;

  const rawSourceId = pickField(row, aliases.sourceId);
  const sourceId = rawSourceId ?? `GRP-${rowIndex + 1}`;

  const rawStatus = pickField(row, aliases.status);
  let isActive = true;
  if (rawStatus != null) {
    const lower = rawStatus.toLowerCase();
    if (lower === "inactive") {
      isActive = false;
    } else if (lower === "active") {
      isActive = true;
    } else {
      // Other values: pass through as raw — validation/rejection happens in the classifier
      isActive = rawStatus as unknown as boolean;
    }
  }

  return {
    sourceId,
    name: pickField(row, aliases.name) ?? "",
    category: pickField(row, aliases.category),
    description: pickField(row, aliases.description),
    leaderEmail: pickField(row, aliases.leaderEmail),
    isActive,
  };
}

// ── Breeze tags (group memberships) ──────────────────────────

const MEMBERSHIP_ALIASES = {
  personId: ["breeze_id"],
  tagName: ["tag_name"],
};

/** Every header alias the tags (memberships) file reads; the rest are reported as ignored. */
export function groupMembershipConsumedAliases(): string[] {
  return Object.values(MEMBERSHIP_ALIASES).flat();
}

/** True when the file has a Tag Name column, i.e. it lists memberships rather than groups. */
export function isGroupMembershipFile(headers: string[]): boolean {
  const wanted = new Set(MEMBERSHIP_ALIASES.tagName.map(normalizeHeaderKey));
  return headers.some((header) => wanted.has(normalizeHeaderKey(header)));
}

const MAX_TAG_TEXT = 200;

export type NormalizedGroupMembershipRow = {
  /** The vendor's person id, matched against profiles.member_number. */
  memberNumber: string | null;
  /** The tag's own name, after the last ">>". */
  groupName: string;
  /** Folder path before the last ">>", kept in the new group's description. */
  folder: string | null;
};

/** One Breeze tags row ("Folder>>Tag"); names are truncated to 200 characters. */
export function normalizeGroupMembershipRow(row: Record<string, string>): NormalizedGroupMembershipRow {
  const rawTag = pickField(row, MEMBERSHIP_ALIASES.tagName)?.trim() ?? "";
  const split = rawTag.lastIndexOf(">>");
  const groupName = (split >= 0 ? rawTag.slice(split + 2) : rawTag).trim().slice(0, MAX_TAG_TEXT);
  const folder = split >= 0 ? rawTag.slice(0, split).trim().slice(0, MAX_TAG_TEXT) : "";

  return {
    memberNumber: pickField(row, MEMBERSHIP_ALIASES.personId)?.trim() || null,
    groupName,
    folder: folder.length > 0 ? folder : null,
  };
}
