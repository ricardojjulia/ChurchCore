import "server-only";

import { chunkArray, computeIgnoredColumns, parseImportCsv } from "@/lib/import-normalize";
import {
  fetchAllPages,
  loadGroupNameIndex,
  loadMembershipPairs,
  loadProfileLinkIndex,
  loadSourceIdIndex,
} from "@/lib/import-profile-index";
import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import {
  groupConsumedAliases,
  groupMembershipConsumedAliases,
  isGroupMembershipFile,
  normalizeGroupImportSourceRow,
  normalizeGroupMembershipRow,
  type GroupsImportSourceSystem,
  type NormalizedGroupImportRow,
} from "@/lib/groups-import-source-adapters";

export type GroupsImportDryRunResult = {
  batchId: string;
  /** "memberships" when the file has a Tag Name column (Breeze tags), otherwise "groups". */
  mode: "groups" | "memberships";
  counts: {
    create: number;
    update: number;
    skip: number;
    reject: number;
    unmatchedLeaders: number;
    /** Memberships mode: rows whose Breeze ID matched nobody in this church. */
    unmatchedMembers: number;
  };
  /** Memberships mode: groups the commit will create because no group has the tag's name. */
  groupCreates: number;
  /** Header names (never cell values) that no field mapping used. */
  ignoredColumns: string[];
  /** Groups mode: one row per group. Empty in memberships mode. */
  rows: GroupsImportDryRunRow[];
  /** Memberships mode: one row per tag assignment. Empty in groups mode. */
  membershipRows: GroupMembershipDryRunRow[];
};

export type GroupMembershipDryRunRow = {
  rowNumber: number;
  /** The Breeze ID as exported (an id, not a name). */
  memberNumber: string | null;
  groupName: string;
  folder: string | null;
  profileResolved: boolean;
  groupExists: boolean;
  action: "create" | "skip" | "reject";
  reason: string | null;
};

type GroupMembershipPayload = {
  kind: "group_membership";
  groupName: string;
  folder: string | null;
  profileId: string | null;
};

export type GroupsImportDryRunRow = {
  rowNumber: number;
  sourceId: string;
  name: string;
  category: string | null;
  leaderEmail: string | null;
  leaderResolved: boolean;
  action: "create" | "update" | "skip" | "reject";
  reason: string | null;
};

export type GroupsImportCommitResult = {
  batchId: string;
  status: "committed" | "failed";
  created: number;
  updated: number;
  failed: number;
};

const ALLOWED_CATEGORIES = new Set([
  "general",
  "life_stage",
  "geographic",
  "interest",
  "discipleship",
  "support",
  "service",
  "youth",
  "seniors",
]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type NormalizedGroupPayload = NormalizedGroupImportRow & {
  leaderProfileId: string | null;
};

async function loadExistingGroupsIndex(churchId: string): Promise<Map<string, string>> {
  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{ id: string; source_id: string }>(
      `select id, source_id from public.groups where church_id = $1 and source_id is not null`,
      [churchId],
    );

    const map = new Map<string, string>();
    for (const row of result.rows) {
      map.set(row.source_id, row.id);
    }
    return map;
  }

  return loadSourceIdIndex(churchId, "groups");
}

export function classifyGroupsImportRows(
  csvRows: Record<string, string>[],
  sourceSystem: GroupsImportSourceSystem,
  groupsIndex: Map<string, string>,
  profilesIndex: Map<string, string>,
): {
  counts: GroupsImportDryRunResult["counts"];
  rows: GroupsImportDryRunRow[];
  normalizedPayloads: NormalizedGroupPayload[];
} {
  const counts = { create: 0, update: 0, skip: 0, reject: 0, unmatchedLeaders: 0, unmatchedMembers: 0 };
  const rows: GroupsImportDryRunRow[] = [];
  const normalizedPayloads: NormalizedGroupPayload[] = [];
  const seenSourceIds = new Set<string>();

  for (let index = 0; index < csvRows.length; index += 1) {
    const csvRow = csvRows[index];
    const rowNumber = index + 2;
    const normalized = normalizeGroupImportSourceRow(csvRow, sourceSystem, index);

    // Missing name
    if (!normalized.name || normalized.name.trim().length === 0) {
      counts.reject += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        name: normalized.name,
        category: normalized.category,
        leaderEmail: normalized.leaderEmail,
        leaderResolved: false,
        action: "reject",
        reason: "Missing group name.",
      });
      normalizedPayloads.push({ ...normalized, leaderProfileId: null });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // Duplicate sourceId in file
    if (seenSourceIds.has(normalized.sourceId)) {
      counts.skip += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        name: normalized.name,
        category: normalized.category,
        leaderEmail: normalized.leaderEmail,
        leaderResolved: false,
        action: "skip",
        reason: "Duplicate source ID in import file.",
      });
      normalizedPayloads.push({ ...normalized, leaderProfileId: null });
      continue;
    }

    // Invalid leader email
    if (normalized.leaderEmail != null && !EMAIL_REGEX.test(normalized.leaderEmail)) {
      counts.reject += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        name: normalized.name,
        category: normalized.category,
        leaderEmail: normalized.leaderEmail,
        leaderResolved: false,
        action: "reject",
        reason: "Invalid leader email format.",
      });
      normalizedPayloads.push({ ...normalized, leaderProfileId: null });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // Invalid status — raw isActive may be a non-boolean string for invalid values
    const rawIsActive = normalized.isActive as unknown;
    if (
      typeof rawIsActive === "string" &&
      rawIsActive !== "active" &&
      rawIsActive !== "inactive"
    ) {
      counts.reject += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        name: normalized.name,
        category: normalized.category,
        leaderEmail: normalized.leaderEmail,
        leaderResolved: false,
        action: "reject",
        reason: "Invalid status value.",
      });
      normalizedPayloads.push({ ...normalized, leaderProfileId: null });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // Invalid category
    if (normalized.category != null && !ALLOWED_CATEGORIES.has(normalized.category)) {
      counts.reject += 1;
      rows.push({
        rowNumber,
        sourceId: normalized.sourceId,
        name: normalized.name,
        category: normalized.category,
        leaderEmail: normalized.leaderEmail,
        leaderResolved: false,
        action: "reject",
        reason: "Invalid category value.",
      });
      normalizedPayloads.push({ ...normalized, leaderProfileId: null });
      seenSourceIds.add(normalized.sourceId);
      continue;
    }

    // Determine action: create or update
    const existingGroupId = groupsIndex.get(normalized.sourceId);
    const action: "create" | "update" = existingGroupId ? "update" : "create";
    counts[action] += 1;

    // Resolve leader
    let leaderProfileId: string | null = null;
    let leaderResolved = false;
    let reason: string | null = null;

    if (normalized.leaderEmail != null) {
      const resolvedId = profilesIndex.get(normalized.leaderEmail.toLowerCase());
      if (resolvedId) {
        leaderProfileId = resolvedId;
        leaderResolved = true;
      } else {
        counts.unmatchedLeaders += 1;
        reason = "Leader email not matched — leader will be unset.";
      }
    }

    seenSourceIds.add(normalized.sourceId);

    rows.push({
      rowNumber,
      sourceId: normalized.sourceId,
      name: normalized.name,
      category: normalized.category,
      leaderEmail: normalized.leaderEmail,
      leaderResolved,
      action,
      reason,
    });
    normalizedPayloads.push({ ...normalized, leaderProfileId });
  }

  return { counts, rows, normalizedPayloads };
}

export function classifyGroupMembershipRows(
  csvRows: Record<string, string>[],
  byMemberNumber: Map<string, string>,
  groupNameIndex: Map<string, string>,
  membershipPairs: Set<string>,
): {
  counts: GroupsImportDryRunResult["counts"];
  groupCreates: number;
  rows: GroupMembershipDryRunRow[];
  payloads: GroupMembershipPayload[];
} {
  const counts = { create: 0, update: 0, skip: 0, reject: 0, unmatchedLeaders: 0, unmatchedMembers: 0 };
  const rows: GroupMembershipDryRunRow[] = [];
  const payloads: GroupMembershipPayload[] = [];
  const seenPairs = new Set<string>();
  const plannedGroups = new Set<string>();

  for (let index = 0; index < csvRows.length; index += 1) {
    const rowNumber = index + 2;
    const normalized = normalizeGroupMembershipRow(csvRows[index]);
    const groupKey = normalized.groupName.toLowerCase();
    const existingGroupId = groupNameIndex.get(groupKey);

    const emit = (
      action: GroupMembershipDryRunRow["action"],
      reason: string | null,
      profileId: string | null,
    ) => {
      rows.push({
        rowNumber,
        memberNumber: normalized.memberNumber,
        groupName: normalized.groupName,
        folder: normalized.folder,
        profileResolved: profileId != null,
        groupExists: existingGroupId != null,
        action,
        reason,
      });
      payloads.push({
        kind: "group_membership",
        groupName: normalized.groupName,
        folder: normalized.folder,
        profileId,
      });
    };

    if (!normalized.groupName) {
      counts.reject += 1;
      emit("reject", "Missing tag name.", null);
      continue;
    }

    if (!normalized.memberNumber || normalized.memberNumber.toLowerCase() === "anonymous") {
      counts.reject += 1;
      emit("reject", "Missing Breeze ID.", null);
      continue;
    }

    const profileId = byMemberNumber.get(normalized.memberNumber) ?? null;
    if (!profileId) {
      counts.skip += 1;
      counts.unmatchedMembers += 1;
      emit("skip", "Person not matched — import people first.", null);
      continue;
    }

    const pairKey = `${groupKey}:${profileId}`;
    if (seenPairs.has(pairKey)) {
      counts.skip += 1;
      emit("skip", "Duplicate membership in import file.", profileId);
      continue;
    }
    seenPairs.add(pairKey);

    if (existingGroupId && membershipPairs.has(`${existingGroupId}:${profileId}`)) {
      counts.skip += 1;
      emit("skip", "Already a member of this group.", profileId);
      continue;
    }

    if (!existingGroupId) plannedGroups.add(groupKey);
    counts.create += 1;
    emit("create", null, profileId);
  }

  return { counts, groupCreates: plannedGroups.size, rows, payloads };
}

async function insertDryRunBatchAndRows(
  churchId: string,
  actorProfileId: string | null,
  sourceSystem: GroupsImportSourceSystem,
  sourceFilename: string,
  rows: Array<{ rowNumber: number; action: "create" | "update" | "skip" | "reject"; reason: string | null }>,
  normalizedPayloads: Array<NormalizedGroupPayload | GroupMembershipPayload>,
  rawCsvRows: Record<string, string>[],
  counts: GroupsImportDryRunResult["counts"],
  ignoredColumns: string[],
  importType: "groups_csv" | "group_memberships_csv" = "groups_csv",
): Promise<string> {
  const summary = { ...counts, ignoredColumns };
  if (shouldUseLocalTenantFallback()) {
    const batch = await queryTenantLocalDb<{ id: string }>(
      `insert into public.import_batches
         (church_id, import_type, source_system, source_filename, created_by_profile_id,
          status, dry_run, summary)
       values ($1, $6, $2, $3, $4, 'dry_run_completed', true, $5::jsonb)
       returning id`,
      [churchId, sourceSystem, sourceFilename, actorProfileId, JSON.stringify(summary), importType],
    );

    const batchId = batch.rows[0]?.id;
    if (!batchId) {
      throw new Error("Unable to create import batch.");
    }

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const normalizedPayload = normalizedPayloads[i];
      await queryTenantLocalDb(
        `insert into public.import_batch_rows
           (batch_id, church_id, row_number, raw_payload, normalized_payload, classification, reason)
         values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)`,
        [
          batchId,
          churchId,
          row.rowNumber,
          JSON.stringify(rawCsvRows[i] ?? {}),
          JSON.stringify(normalizedPayload),
          row.action,
          row.reason,
        ],
      );
    }

    return batchId;
  }

  const supabase = await createTenantServerClient();
  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      church_id: churchId,
      import_type: importType,
      source_system: sourceSystem,
      source_filename: sourceFilename,
      created_by_profile_id: actorProfileId,
      status: "dry_run_completed",
      dry_run: true,
      summary,
    })
    .select("id")
    .single();

  if (batchError || !batch?.id) {
    throw new Error(batchError?.message ?? "Unable to create import batch.");
  }

  // Chunked: a 5,000-row batch is too large for one request.
  const batchRows = rows.map((row, i) => ({
      batch_id: batch.id,
      church_id: churchId,
      row_number: row.rowNumber,
      raw_payload: rawCsvRows[i] ?? {},
      normalized_payload: normalizedPayloads[i],
      classification: row.action,
      reason: row.reason,
    }));
  for (const part of chunkArray(batchRows, 500)) {
    const { error: rowsError } = await supabase.from("import_batch_rows").insert(part);
    if (rowsError) {
      throw new Error(rowsError.message);
    }
  }

  return batch.id;
}

export async function runGroupsImportDryRun(input: {
  churchId: string;
  actorProfileId: string | null;
  sourceSystem?: GroupsImportSourceSystem;
  sourceFilename: string;
  csvText: string;
}): Promise<GroupsImportDryRunResult> {
  const csv = parseImportCsv(input.csvText);
  if (csv.errors.length > 0) {
    throw new Error(csv.errors[0] ?? "Unable to parse CSV file.");
  }

  if (csv.rows.length === 0) {
    throw new Error("CSV file has no data rows.");
  }

  const sourceSystem = input.sourceSystem ?? "generic_csv";

  if (isGroupMembershipFile(csv.headers)) {
    const [profileIndex, groupNameIndex, membershipPairs] = await Promise.all([
      loadProfileLinkIndex(input.churchId),
      loadGroupNameIndex(input.churchId),
      loadMembershipPairs(input.churchId),
    ]);
    const memberships = classifyGroupMembershipRows(
      csv.rows,
      profileIndex.byMemberNumber,
      groupNameIndex,
      membershipPairs,
    );
    const ignoredColumns = computeIgnoredColumns(csv.headers, groupMembershipConsumedAliases());

    const batchId = await insertDryRunBatchAndRows(
      input.churchId,
      input.actorProfileId,
      sourceSystem,
      input.sourceFilename,
      memberships.rows,
      memberships.payloads,
      csv.rows,
      { ...memberships.counts },
      ignoredColumns,
      "group_memberships_csv",
    );

    return {
      batchId,
      mode: "memberships",
      counts: memberships.counts,
      groupCreates: memberships.groupCreates,
      ignoredColumns,
      rows: [],
      membershipRows: memberships.rows,
    };
  }

  const [groupsIndex, profileIndex] = await Promise.all([
    loadExistingGroupsIndex(input.churchId),
    loadProfileLinkIndex(input.churchId),
  ]);

  const { counts, rows, normalizedPayloads } = classifyGroupsImportRows(
    csv.rows,
    sourceSystem,
    groupsIndex,
    profileIndex.byEmail,
  );
  const ignoredColumns = computeIgnoredColumns(csv.headers, groupConsumedAliases(sourceSystem));

  const batchId = await insertDryRunBatchAndRows(
    input.churchId,
    input.actorProfileId,
    sourceSystem,
    input.sourceFilename,
    rows,
    normalizedPayloads,
    csv.rows,
    counts,
    ignoredColumns,
  );

  return {
    batchId,
    mode: "groups",
    counts,
    groupCreates: 0,
    ignoredColumns,
    rows,
    membershipRows: [],
  };
}

function normalizeBatchRowPayload(payload: unknown): NormalizedGroupPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const row = payload as Partial<NormalizedGroupPayload>;
  if (typeof row.sourceId !== "string") {
    return null;
  }

  return {
    sourceId: row.sourceId,
    name: typeof row.name === "string" ? row.name : "",
    category: typeof row.category === "string" ? row.category : null,
    description: typeof row.description === "string" ? row.description : null,
    leaderEmail: typeof row.leaderEmail === "string" ? row.leaderEmail : null,
    isActive: typeof row.isActive === "boolean" ? row.isActive : true,
    leaderProfileId: typeof row.leaderProfileId === "string" ? row.leaderProfileId : null,
  };
}

function normalizeAnyBatchPayload(
  payload: unknown,
): NormalizedGroupPayload | GroupMembershipPayload | null {
  if (payload && typeof payload === "object" && (payload as { kind?: unknown }).kind === "group_membership") {
    const row = payload as Partial<GroupMembershipPayload>;
    if (typeof row.groupName !== "string" || row.groupName.length === 0) return null;
    return {
      kind: "group_membership",
      groupName: row.groupName,
      folder: typeof row.folder === "string" ? row.folder : null,
      profileId: typeof row.profileId === "string" ? row.profileId : null,
    };
  }
  return normalizeBatchRowPayload(payload);
}

/**
 * Commit one tag assignment: find the church's group by name (case-insensitive)
 * or create it as a closed "general" group, then add the person unless they
 * are already in it. Returns "created" when a membership row was inserted.
 */
async function commitMembershipPayload(
  churchId: string,
  payload: GroupMembershipPayload,
  groupIds: Map<string, string>,
  validProfileIds: Set<string>,
  now: string,
): Promise<"created" | "existing"> {
  if (!payload.profileId || !validProfileIds.has(payload.profileId)) {
    throw new Error("Membership person is not in this church.");
  }
  const supabase = await createTenantServerClient();

  const groupKey = payload.groupName.toLowerCase();
  let groupId = groupIds.get(groupKey);
  if (!groupId) {
    // Imported tags can name pastoral or sensitive lists, so a new group stays
    // closed (admin-visible, no self-join) until an admin opens it.
    const { data, error } = await supabase
      .from("groups")
      .insert({
        church_id: churchId,
        name: payload.groupName,
        category: "general",
        description: payload.folder ? `Imported from Breeze tag folder: ${payload.folder}` : null,
        is_open: false,
        is_active: true,
      })
      .select("id")
      .single();
    if (error || !data?.id) {
      throw new Error("Unable to create the group for a tag.");
    }
    groupId = data.id as string;
    groupIds.set(groupKey, groupId);
  }

  const { data: existing, error: lookupError } = await supabase
    .from("group_members")
    .select("id")
    .eq("church_id", churchId)
    .eq("group_id", groupId)
    .eq("profile_id", payload.profileId)
    .maybeSingle();
  if (lookupError) {
    throw new Error("Unable to check existing group membership.");
  }
  if (existing?.id) return "existing";

  const { error } = await supabase.from("group_members").insert({
    church_id: churchId,
    group_id: groupId,
    profile_id: payload.profileId,
    role: "member",
    status: "active",
    joined_at: now,
  });
  if (error) {
    throw new Error("Unable to add a group member.");
  }
  return "created";
}

export async function commitGroupsImportBatch(input: {
  churchId: string;
  actorProfileId: string | null;
  batchId: string;
}): Promise<GroupsImportCommitResult> {
  let batchStatus: string | null = null;
  let dryRun = true;
  let normalizedPayloads: Array<NormalizedGroupPayload | GroupMembershipPayload> = [];

  if (shouldUseLocalTenantFallback()) {
    const batchResult = await queryTenantLocalDb<{ status: string; dry_run: boolean }>(
      `select status, dry_run
       from public.import_batches
       where id = $1 and church_id = $2
       limit 1`,
      [input.batchId, input.churchId],
    );

    const batch = batchResult.rows[0];
    if (!batch) {
      throw new Error("Import batch not found.");
    }

    batchStatus = batch.status;
    dryRun = batch.dry_run;

    const rowsResult = await queryTenantLocalDb<{ normalized_payload: unknown }>(
      `select normalized_payload
       from public.import_batch_rows
       where batch_id = $1 and church_id = $2 and classification in ('create', 'update')
       order by row_number asc`,
      [input.batchId, input.churchId],
    );

    normalizedPayloads = rowsResult.rows
      .map((row) => normalizeAnyBatchPayload(row.normalized_payload))
      .filter((row): row is NormalizedGroupPayload | GroupMembershipPayload => Boolean(row));
  } else {
    const supabase = await createTenantServerClient();

    const { data: batch } = await supabase
      .from("import_batches")
      .select("status, dry_run")
      .eq("id", input.batchId)
      .eq("church_id", input.churchId)
      .maybeSingle();

    if (!batch) {
      throw new Error("Import batch not found.");
    }

    batchStatus = batch.status;
    dryRun = batch.dry_run;

    const rows = await fetchAllPages<{ normalized_payload: unknown }>((from, to) =>
      supabase
        .from("import_batch_rows")
        .select("normalized_payload")
        .eq("batch_id", input.batchId)
        .eq("church_id", input.churchId)
        .in("classification", ["create", "update"])
        .order("row_number", { ascending: true })
        .range(from, to),
    );

    normalizedPayloads = (rows ?? [])
      .map((row) =>
        normalizeAnyBatchPayload((row as { normalized_payload: unknown }).normalized_payload),
      )
      .filter((row): row is NormalizedGroupPayload | GroupMembershipPayload => Boolean(row));
  }

  if (batchStatus !== "dry_run_completed" || !dryRun) {
    throw new Error("Only dry-run-completed batches can be committed.");
  }

  let created = 0;
  let updated = 0;
  let failed = 0;

  // Tag assignments (Breeze) resolve groups by name and people by this church's own profiles.
  const hasMemberships = normalizedPayloads.some((payload) => "kind" in payload);
  const groupIds = hasMemberships ? await loadGroupNameIndex(input.churchId) : new Map<string, string>();
  const validProfileIds = hasMemberships
    ? new Set((await loadProfileLinkIndex(input.churchId)).byMemberNumber.values())
    : new Set<string>();
  const membershipNow = new Date().toISOString();

  for (const payload of normalizedPayloads) {
    try {
      if ("kind" in payload) {
        const outcome = await commitMembershipPayload(
          input.churchId,
          payload,
          groupIds,
          validProfileIds,
          membershipNow,
        );
        if (outcome === "created") created += 1;
        continue;
      }

      if (shouldUseLocalTenantFallback()) {
        // Check if group with this source_id exists
        const existing = await queryTenantLocalDb<{ id: string }>(
          `select id from public.groups where church_id = $1 and source_id = $2 limit 1`,
          [input.churchId, payload.sourceId],
        );

        if (existing.rows[0]?.id) {
          await queryTenantLocalDb(
            `update public.groups
             set name = $1,
                 category = coalesce($2, category),
                 description = coalesce($3, description),
                 leader_profile_id = coalesce($4, leader_profile_id),
                 is_active = $5,
                 updated_at = now()
             where church_id = $6 and source_id = $7`,
            [
              payload.name,
              payload.category,
              payload.description,
              payload.leaderProfileId,
              typeof payload.isActive === "boolean" ? payload.isActive : true,
              input.churchId,
              payload.sourceId,
            ],
          );
          updated += 1;
        } else {
          await queryTenantLocalDb(
            `insert into public.groups
               (church_id, source_id, name, category, description, leader_profile_id, is_active, is_open)
             values ($1, $2, $3, $4, $5, $6, $7, true)`,
            [
              input.churchId,
              payload.sourceId,
              payload.name,
              payload.category,
              payload.description,
              payload.leaderProfileId,
              typeof payload.isActive === "boolean" ? payload.isActive : true,
            ],
          );
          created += 1;
        }
      } else {
        const supabase = await createTenantServerClient();

        // Check if group with this source_id exists
        const { data: existing } = await supabase
          .from("groups")
          .select("id")
          .eq("church_id", input.churchId)
          .eq("source_id", payload.sourceId)
          .maybeSingle();

        if (existing?.id) {
          const { error } = await supabase
            .from("groups")
            .update({
              name: payload.name,
              // A blank cell never erases what the church already has (category is NOT NULL).
              ...(payload.category ? { category: payload.category } : {}),
              ...(payload.description ? { description: payload.description } : {}),
              ...(payload.leaderProfileId ? { leader_profile_id: payload.leaderProfileId } : {}),
              is_active: typeof payload.isActive === "boolean" ? payload.isActive : true,
              updated_at: new Date().toISOString(),
            })
            .eq("church_id", input.churchId)
            .eq("source_id", payload.sourceId);

          if (error) {
            throw new Error(error.message);
          }
          updated += 1;
        } else {
          const { error } = await supabase.from("groups").insert({
            church_id: input.churchId,
            source_id: payload.sourceId,
            name: payload.name,
            category: payload.category,
            description: payload.description,
            leader_profile_id: payload.leaderProfileId,
            is_active: typeof payload.isActive === "boolean" ? payload.isActive : true,
            is_open: true,
          });

          if (error) {
            throw new Error(error.message);
          }
          created += 1;
        }
      }
    } catch {
      failed += 1;
    }
  }

  const status: GroupsImportCommitResult["status"] =
    failed > 0 && created + updated === 0 ? "failed" : "committed";

  const summary = {
    committedByProfileId: input.actorProfileId,
    committedAt: new Date().toISOString(),
    created,
    updated,
    failed,
  };

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.import_batches
       set status = $3,
           dry_run = false,
           summary = coalesce(summary, '{}'::jsonb) || $4::jsonb,
           committed_at = case when $3 = 'committed' then now() else committed_at end,
           failed_at = case when $3 = 'failed' then now() else failed_at end
       where id = $1 and church_id = $2`,
      [input.batchId, input.churchId, status, JSON.stringify(summary)],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error } = await supabase
      .from("import_batches")
      .update({
        status,
        dry_run: false,
        summary,
        committed_at: status === "committed" ? new Date().toISOString() : null,
        failed_at: status === "failed" ? new Date().toISOString() : null,
      })
      .eq("id", input.batchId)
      .eq("church_id", input.churchId);

    if (error) {
      throw new Error(error.message);
    }
  }

  return {
    batchId: input.batchId,
    status,
    created,
    updated,
    failed,
  };
}
