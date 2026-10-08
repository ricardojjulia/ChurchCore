import "server-only";

import { givingSnapshotMismatches, type GivingSnapshot } from "@/lib/import-commit";
import { chunkArray } from "@/lib/import-normalize";
import { fetchAllPages } from "@/lib/import-profile-index";
import { createTenantServerClient } from "@/lib/supabase/tenant";

// G4.2: compare an import file with what the commit saved. Not a "use server"
// module: every export takes a trusted church id, so callers (the report page
// and the CSV route) pass the church from the signed-in session. Every query is
// church-scoped and every error is checked. The report never reads staged
// names, emails or phones: it takes outcomes and snapshots from the
// commit_* columns plus a few non-personal payload keys (source id, member
// number, group name; for giving only, the amount of a row that was never
// attempted).

const REREAD_CHUNK = 200;

/** Target table that holds the records each import type writes. */
const TARGET_TABLES: Record<string, string> = {
  people_households_csv: "profiles",
  giving_csv: "donations",
  attendance_csv: "attendance",
  events_csv: "events",
  groups_csv: "groups",
  group_memberships_csv: "group_members",
};

export const GIVING_IMPORT_TYPE = "giving_csv";
export const PEOPLE_IMPORT_TYPE = "people_households_csv";

export type ReconciliationBatch = {
  id: string;
  importType: string;
  sourceSystem: string;
  sourceFilename: string;
  status: string;
  createdAt: string;
  committedAt: string | null;
};

export type ReconciliationCounts = {
  /** Every staged row in the file. */
  sourceRows: number;
  /** Rows classified create or update. */
  expected: number;
  written: number;
  failed: number;
  notAttempted: number;
  skipped: number;
  rejected: number;
};

export type ReconciliationRowRef = {
  rowNumber: number;
  /** Source id from the file (people: member number; tags: group name). Null if the row has none. */
  sourceId: string | null;
};

export type FieldDifference = {
  field: "amount" | "date" | "fund";
  /** Amount in cents, or a date/fund string. */
  source: string | number | null;
  stored: string | number | null;
};

export type ChangeDifference = {
  field: "amount" | "date" | "fund";
  /** Value stored when the import committed. */
  atImport: string | number | null;
  /** Value in the database now. */
  now: string | number | null;
};

export type ReconciliationMismatch = ReconciliationRowRef & {
  kind: "failed" | "not_attempted" | "value_mismatch";
  /** A safe plain-words reason for failed rows. */
  reason: string | null;
  /** Value mismatches only: source versus what was stored at commit. */
  differences: FieldDifference[];
};

export type ChangedSinceImport = ReconciliationRowRef & {
  change: "edited" | "deleted" | "merged";
  /** Edited giving only: stored at commit versus now. */
  differences: ChangeDifference[];
};

export type ReasonedRow = ReconciliationRowRef & {
  classification: "skip" | "reject";
  reason: string | null;
};

/** USD, integer cents. */
export type GivingTotals = {
  sourceCents: number;
  writtenAtCommitCents: number;
  /** Sum of the saved donations as they are now (deleted gifts count as zero). */
  currentCents: number;
  /** sourceCents minus writtenAtCommitCents. */
  differenceCents: number;
};

/** One staged row as the CSV download lists it. No names, emails or phones. */
export type ReportRow = ReconciliationRowRef & {
  classification: "create" | "update" | "skip" | "reject";
  outcome: "written" | "failed" | "not_attempted" | "skipped" | "rejected";
  reason: string | null;
  /** Giving batches only: the file's values (amount in cents). */
  giving: { amountCents: number | null; donatedAt: string | null; fund: string | null } | null;
};

export type ReconciliationResult =
  | { state: "not_available"; batch: ReconciliationBatch }
  | {
      /** Committed before row outcomes were recorded: counts from the old summary only. */
      state: "legacy";
      batch: ReconciliationBatch;
      summary: { created: number | null; updated: number | null; failed: number | null };
    }
  | {
      state: "ready";
      batch: ReconciliationBatch;
      counts: ReconciliationCounts;
      /** Giving batches only. */
      giving: GivingTotals | null;
      /** failed + not attempted + value mismatches. */
      mismatchCount: number;
      mismatches: ReconciliationMismatch[];
      changedSinceImport: ChangedSinceImport[];
      skipped: ReasonedRow[];
      rejected: ReasonedRow[];
      /** Every staged row, only when computeImportReconciliation was called with includeRows. */
      rows?: ReportRow[];
    };

type StagedRow = {
  id: string;
  row_number: number;
  classification: "create" | "update" | "skip" | "reject";
  reason: string | null;
  commit_outcome: "written" | "failed" | null;
  committed_record_id: string | null;
  commit_failure_reason: string | null;
  commit_snapshot: (GivingSnapshot & { note?: string }) | null;
  source_id: string | null;
  member_number: string | null;
  group_name: string | null;
  source_amount: string | null;
};

const BASE_COLUMNS =
  "id, row_number, classification, reason, commit_outcome, committed_record_id, commit_failure_reason, commit_snapshot, " +
  "source_id:normalized_payload->>sourceId, member_number:normalized_payload->>memberNumber, group_name:normalized_payload->>groupName";

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toBatch(row: Record<string, unknown>): ReconciliationBatch {
  return {
    id: String(row.id),
    importType: String(row.import_type),
    sourceSystem: String(row.source_system),
    sourceFilename: String(row.source_filename),
    status: String(row.status),
    createdAt: String(row.created_at),
    committedAt: typeof row.committed_at === "string" ? row.committed_at : null,
  };
}

function refOf(row: StagedRow): ReconciliationRowRef {
  return { rowNumber: row.row_number, sourceId: row.source_id ?? row.member_number ?? row.group_name ?? null };
}

function differencesOf(snapshot: GivingSnapshot | null | undefined): FieldDifference[] {
  const source = snapshot?.source;
  const stored = snapshot?.stored;
  if (!source || !stored) return [];
  return givingSnapshotMismatches(snapshot).map((field) => {
    if (field === "amount") return { field, source: source.amount_cents ?? null, stored: stored.amount_cents ?? null };
    if (field === "date") return { field, source: source.donated_at ?? null, stored: stored.donated_at ?? null };
    return { field, source: source.fund ?? null, stored: stored.fund ?? null };
  });
}

type CurrentDonation = { id: string; amount_cents: number; created_at: string; fund_designation: string | null };

/** Re-reads the records the commit wrote, church-scoped, in chunks. Returns id -> row for those that still exist. */
async function rereadRecords(
  churchId: string,
  table: string,
  ids: string[],
  columns: string,
): Promise<Map<string, Record<string, unknown>>> {
  const supabase = await createTenantServerClient();
  const found = new Map<string, Record<string, unknown>>();
  for (const chunk of chunkArray(ids, REREAD_CHUNK)) {
    const { data, error } = await supabase.from(table).select(columns).eq("church_id", churchId).in("id", chunk);
    if (error) {
      throw new Error("Unable to read the saved records for the reconciliation report.");
    }
    for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
      found.set(String(row.id), row);
    }
  }
  return found;
}

export async function computeImportReconciliation(
  churchId: string,
  batchId: string,
  options: { includeRows?: boolean } = {},
): Promise<ReconciliationResult | null> {
  const supabase = await createTenantServerClient();
  const { data: batchRow, error: batchError } = await supabase
    .from("import_batches")
    .select("id, import_type, source_system, source_filename, status, dry_run, summary, created_at, committed_at")
    .eq("id", batchId)
    .eq("church_id", churchId)
    .maybeSingle();
  if (batchError) {
    throw new Error("Unable to load the import batch.");
  }
  if (!batchRow) return null;

  const batch = toBatch(batchRow);
  if ((batch.status !== "committed" && batch.status !== "failed") || batchRow.dry_run === true) {
    return { state: "not_available", batch };
  }

  const summary = asRecord(batchRow.summary);
  if (summary.outcomesRecorded !== true) {
    return {
      state: "legacy",
      batch,
      summary: {
        created: numberOrNull(summary.created),
        updated: numberOrNull(summary.updated),
        failed: numberOrNull(summary.failed),
      },
    };
  }

  const isGiving = batch.importType === GIVING_IMPORT_TYPE;
  const columns = isGiving ? `${BASE_COLUMNS}, source_amount:normalized_payload->>amountCents` : BASE_COLUMNS;
  const rows = await fetchAllPages<StagedRow>((from, to) =>
    supabase
      .from("import_batch_rows")
      .select(columns)
      .eq("batch_id", batchId)
      .eq("church_id", churchId)
      .order("row_number", { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: StagedRow[] | null; error: { message: string } | null }>,
  );

  const counts: ReconciliationCounts = {
    sourceRows: rows.length,
    expected: 0,
    written: 0,
    failed: 0,
    notAttempted: 0,
    skipped: 0,
    rejected: 0,
  };
  const reportRows: ReportRow[] = [];
  const mismatches: ReconciliationMismatch[] = [];
  const skipped: ReasonedRow[] = [];
  const rejected: ReasonedRow[] = [];
  const written: StagedRow[] = [];
  let sourceCents = 0;
  let writtenAtCommitCents = 0;

  for (const row of rows) {
    if (options.includeRows) {
      const source = row.commit_snapshot?.source;
      const stagedAmount = row.source_amount !== null ? Number(row.source_amount) : NaN;
      reportRows.push({
        ...refOf(row),
        classification: row.classification,
        outcome:
          row.classification === "skip"
            ? "skipped"
            : row.classification === "reject"
              ? "rejected"
              : (row.commit_outcome ?? "not_attempted"),
        reason:
          row.commit_outcome === "failed"
            ? row.commit_failure_reason
            : row.commit_outcome === null && (row.classification === "create" || row.classification === "update")
              ? "The import stopped before this row was written."
              : row.reason,
        giving: isGiving
          ? {
              amountCents: numberOrNull(source?.amount_cents) ?? (Number.isFinite(stagedAmount) ? stagedAmount : null),
              donatedAt: source?.donated_at ?? null,
              fund: source?.fund ?? null,
            }
          : null,
      });
    }
    if (row.classification === "skip" || row.classification === "reject") {
      const entry: ReasonedRow = { ...refOf(row), classification: row.classification, reason: row.reason };
      if (row.classification === "skip") {
        counts.skipped += 1;
        skipped.push(entry);
      } else {
        counts.rejected += 1;
        rejected.push(entry);
      }
      continue;
    }

    counts.expected += 1;
    const snapshot = row.commit_snapshot;
    if (isGiving) {
      // Source side: the commit's own snapshot; a row never reached has none, so use the staged amount.
      const snapshotSource = numberOrNull(snapshot?.source?.amount_cents);
      const stagedAmount = row.source_amount !== null ? Number(row.source_amount) : NaN;
      sourceCents += snapshotSource ?? (Number.isFinite(stagedAmount) ? stagedAmount : 0);
    }

    if (row.commit_outcome === "written") {
      counts.written += 1;
      written.push(row);
      if (isGiving) {
        writtenAtCommitCents += numberOrNull(snapshot?.stored?.amount_cents) ?? 0;
        const differences = differencesOf(snapshot);
        if (differences.length > 0) {
          mismatches.push({ ...refOf(row), kind: "value_mismatch", reason: null, differences });
        }
      }
    } else if (row.commit_outcome === "failed") {
      counts.failed += 1;
      mismatches.push({ ...refOf(row), kind: "failed", reason: row.commit_failure_reason, differences: [] });
    } else {
      counts.notAttempted += 1;
      mismatches.push({
        ...refOf(row),
        kind: "not_attempted",
        reason: "The import stopped before this row was written.",
        differences: [],
      });
    }
  }
  mismatches.sort((a, b) => a.rowNumber - b.rowNumber);

  // Changed since import: not mismatches, because the import itself did nothing wrong.
  const changedSinceImport: ChangedSinceImport[] = [];
  let currentCents = 0;
  const table = TARGET_TABLES[batch.importType];
  const recordIds = [...new Set(written.map((row) => row.committed_record_id).filter((id): id is string => Boolean(id)))];
  if (table && recordIds.length > 0) {
    const reread = await rereadRecords(
      churchId,
      table,
      recordIds,
      isGiving
        ? "id, amount_cents, created_at, fund_designation"
        : table === "profiles"
          ? "id, merged_into_profile_id"
          : "id",
    );
    for (const row of written) {
      const current = row.committed_record_id ? reread.get(row.committed_record_id) : undefined;
      if (!row.committed_record_id) continue;
      if (!current) {
        changedSinceImport.push({ ...refOf(row), change: "deleted", differences: [] });
        continue;
      }
      if (isGiving) {
        const now = current as unknown as CurrentDonation;
        currentCents += now.amount_cents;
        const stored = row.commit_snapshot?.stored;
        if (stored) {
          const differences = differencesOf({
            source: { amount_cents: stored.amount_cents, donated_at: stored.donated_at, fund: stored.fund },
            stored: { amount_cents: now.amount_cents, donated_at: now.created_at, fund: now.fund_designation },
          }).map((difference) => ({ field: difference.field, atImport: difference.source, now: difference.stored }));
          if (differences.length > 0) {
            changedSinceImport.push({ ...refOf(row), change: "edited", differences });
          }
        }
      } else if (table === "profiles" && current.merged_into_profile_id) {
        changedSinceImport.push({ ...refOf(row), change: "merged", differences: [] });
      }
    }
    changedSinceImport.sort((a, b) => a.rowNumber - b.rowNumber);
  }

  return {
    state: "ready",
    batch,
    counts,
    giving: isGiving
      ? { sourceCents, writtenAtCommitCents, currentCents, differenceCents: sourceCents - writtenAtCommitCents }
      : null,
    mismatchCount: mismatches.length,
    mismatches,
    changedSinceImport,
    skipped,
    rejected,
    ...(options.includeRows ? { rows: reportRows } : {}),
  };
}

export type RecentImportBatch = {
  id: string;
  createdAt: string;
  sourceFilename: string;
  status: string;
  /** Null when the batch has no report yet or was committed before outcomes were recorded ("not recorded"). */
  mismatchCount: number | null;
  /** True for a committed/failed batch from before row outcomes were recorded. */
  legacy: boolean;
};

export async function listRecentImportBatches(
  churchId: string,
  importTypes: string[],
  limit = 20,
): Promise<RecentImportBatch[]> {
  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("id, created_at, source_filename, status, summary")
    .eq("church_id", churchId)
    .in("import_type", importTypes)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error("Unable to load recent imports.");
  }
  return (data ?? []).map((row) => {
    const summary = asRecord(row.summary);
    const finished = row.status === "committed" || row.status === "failed";
    const recorded = summary.outcomesRecorded === true;
    return {
      id: row.id as string,
      createdAt: row.created_at as string,
      sourceFilename: row.source_filename as string,
      status: row.status as string,
      mismatchCount: finished && recorded ? numberOrNull(summary.mismatchCount) : null,
      legacy: finished && !recorded,
    };
  });
}
