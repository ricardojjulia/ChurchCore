import "server-only";

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

function pickFirst(row: Record<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = row[alias];
    if (value != null && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

export function normalizeGroupImportSourceRow(
  row: Record<string, string>,
  sourceSystem: GroupsImportSourceSystem,
  rowIndex: number,
): NormalizedGroupImportRow {
  const aliases = GROUP_SOURCE_ALIASES[sourceSystem] ?? GROUP_SOURCE_ALIASES.generic_csv;

  const rawSourceId = pickFirst(row, aliases.sourceId);
  const sourceId = rawSourceId ?? `GRP-${rowIndex + 1}`;

  const rawStatus = pickFirst(row, aliases.status);
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
    name: pickFirst(row, aliases.name) ?? "",
    category: pickFirst(row, aliases.category),
    description: pickFirst(row, aliases.description),
    leaderEmail: pickFirst(row, aliases.leaderEmail),
    isActive,
  };
}
