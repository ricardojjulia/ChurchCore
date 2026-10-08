import "server-only";

import { logAuditEvent } from "@/lib/actions/audit";
import { createTenantServerClient, shouldUseLocalTenantFallback } from "@/lib/supabase/tenant";

// Shared commit plumbing for the CSV importers (G4.1, Council Review 45):
// claim a batch so it commits once, safe per-row failure reasons, the
// commit-time check that staged ids belong to this church, and one audit entry.

/** A failure whose message is safe to show: it names no header and no cell value. */
export class ImportRowError extends Error {}

export const FOREIGN_REFERENCE_REASON = "Referenced record is not in this church.";
export const NOT_UPDATED_REASON = "Existing record was not updated.";
const GENERIC_ROW_REASON = "Row could not be written.";

export function failureReason(error: unknown): string {
  return error instanceof ImportRowError ? error.message : GENERIC_ROW_REASON;
}

/** Throws unless `id` is null/absent or in this church's set. */
export function assertKnownReference(id: string | null | undefined, known: Set<string> | null) {
  if (id && known && !known.has(id)) {
    throw new ImportRowError(FOREIGN_REFERENCE_REASON);
  }
}

export function assertUpdated(rows: unknown[] | null | undefined) {
  if (!rows || rows.length === 0) {
    throw new ImportRowError(NOT_UPDATED_REASON);
  }
}

/** Claims dry_run_completed -> committing; exactly one concurrent caller gets the row. */
export async function claimImportBatch(churchId: string, batchId: string): Promise<void> {
  const supabase = await createTenantServerClient();
  const { data, error } = await supabase
    .from("import_batches")
    .update({ status: "committing" })
    .eq("id", batchId)
    .eq("church_id", churchId)
    .eq("status", "dry_run_completed")
    .eq("dry_run", true)
    .select("id");

  if (error) {
    throw new Error("Unable to start the import commit.");
  }
  if (!data || data.length !== 1) {
    throw new Error("This batch is already being committed or was committed.");
  }
}

const OUTCOME_CHUNK = 500;

/** The columns of a saved donation that the reconciliation snapshot keeps. */
export const DONATION_STORED_COLUMNS = "id, amount_cents, created_at, fund_designation";
export type DonationStored = {
  id: string;
  amount_cents: number;
  created_at: string;
  fund_designation: string | null;
};

export type GivingSnapshot = {
  source?: { amount_cents?: number | null; donated_at?: string | null; fund?: string | null } | null;
  stored?: { amount_cents?: number | null; donated_at?: string | null; fund?: string | null } | null;
};

function sameInstantOrDay(source: string, stored: string): boolean {
  const sourceTime = Date.parse(source);
  const storedTime = Date.parse(stored);
  if (Number.isNaN(sourceTime) || Number.isNaN(storedTime)) return source === stored;
  // A date-only source means "that day"; a full timestamp must match exactly.
  return /^\d{4}-\d{2}-\d{2}$/.test(source.trim())
    ? new Date(storedTime).toISOString().slice(0, 10) === source.trim()
    : sourceTime === storedTime;
}

/**
 * The key fields (amount, date, fund) of a giving snapshot that differ between
 * the file and what the database holds. A null source value is not compared:
 * the file said nothing about it. Empty when the snapshot has no stored side.
 */
export function givingSnapshotMismatches(snapshot: GivingSnapshot | null | undefined): Array<"amount" | "date" | "fund"> {
  const source = snapshot?.source;
  const stored = snapshot?.stored;
  if (!source || !stored) return [];
  const fields: Array<"amount" | "date" | "fund"> = [];
  if (source.amount_cents != null && source.amount_cents !== stored.amount_cents) fields.push("amount");
  if (source.donated_at != null && (stored.donated_at == null || !sameInstantOrDay(source.donated_at, stored.donated_at))) {
    fields.push("date");
  }
  if (source.fund != null && source.fund !== stored.fund) fields.push("fund");
  return fields;
}

export function givingSnapshotMismatch(snapshot: GivingSnapshot | null | undefined): boolean {
  return givingSnapshotMismatches(snapshot).length > 0;
}

export type RowOutcome = {
  outcome: "written" | "failed";
  /** The record the row created or updated. */
  recordId?: string | null;
  /** Only a safe string from failureReason(). */
  reason?: string;
  /** Key values at commit (giving: source vs stored). Never names, emails or phones. */
  snapshot?: Record<string, unknown>;
};

export type OutcomeRecorder = {
  /** Buffers one row's outcome; flushes every 500. Safe to call concurrently. */
  record(rowId: string | null | undefined, outcome: RowOutcome): Promise<void>;
  /** Sends everything buffered. Throws if a write was refused. */
  flush(): Promise<void>;
  /** A written giving row whose stored values differ from the source. */
  noteValueMismatch(): void;
  readonly recordedCount: number;
  readonly valueMismatches: number;
};

/**
 * Records per-row commit outcomes (G4.2) through record_import_row_outcomes,
 * a SECURITY INVOKER function, so RLS applies. Flushes are serialized so the
 * people importer's concurrent lanes cannot interleave. Local fallback mode has
 * no outcome columns to write to: the recorder only counts.
 */
export function createOutcomeRecorder(churchId: string, batchId: string): OutcomeRecorder {
  const live = !shouldUseLocalTenantFallback();
  let buffer: Array<Record<string, unknown>> = [];
  let chain: Promise<void> = Promise.resolve();
  let recordedCount = 0;
  let valueMismatches = 0;

  const send = async (chunk: Array<Record<string, unknown>>) => {
    const supabase = await createTenantServerClient();
    const { error } = await supabase.rpc("record_import_row_outcomes", {
      p_batch_id: batchId,
      p_outcomes: chunk,
    });
    if (error) {
      console.error("[import-commit] could not record row outcomes", { churchId, batchId });
      throw new Error("Unable to record the import row outcomes.");
    }
  };

  const enqueue = () => {
    const chunk = buffer;
    buffer = [];
    if (chunk.length > 0) {
      chain = chain.then(() => send(chunk));
    }
    return chain;
  };

  return {
    async record(rowId, outcome) {
      if (!rowId) return;
      recordedCount += 1;
      if (!live) return;
      buffer.push({
        id: rowId,
        commit_outcome: outcome.outcome,
        committed_record_id: outcome.recordId ?? null,
        commit_failure_reason: outcome.outcome === "failed" ? (outcome.reason ?? GENERIC_ROW_REASON) : null,
        commit_snapshot: outcome.snapshot ?? {},
      });
      if (buffer.length >= OUTCOME_CHUNK) {
        await enqueue();
      }
    },
    flush: () => enqueue(),
    noteValueMismatch() {
      valueMismatches += 1;
    },
    get recordedCount() {
      return recordedCount;
    },
    get valueMismatches() {
      return valueMismatches;
    },
  };
}

/**
 * Merges `patch` into import_batches.summary (read, spread, write; the error is
 * checked). A single writer holds because claimImportBatch's guarded flip wins
 * once, so nothing else writes the summary while a batch is committing.
 * `set` adds other columns to the same update; `onlyStatus` guards it.
 */
export async function mergeBatchSummary(
  churchId: string,
  batchId: string,
  patch: Record<string, unknown>,
  options: { set?: Record<string, unknown>; onlyStatus?: string } = {},
): Promise<void> {
  const supabase = await createTenantServerClient();
  const { data: current, error: readError } = await supabase
    .from("import_batches")
    .select("summary")
    .eq("id", batchId)
    .eq("church_id", churchId)
    .maybeSingle();
  if (readError) {
    throw new Error("Unable to update the import summary.");
  }
  const existing =
    current?.summary && typeof current.summary === "object" && !Array.isArray(current.summary)
      ? (current.summary as Record<string, unknown>)
      : {};

  let query = supabase
    .from("import_batches")
    .update({ ...(options.set ?? {}), summary: { ...existing, ...patch } })
    .eq("id", batchId)
    .eq("church_id", churchId);
  if (options.onlyStatus) {
    query = query.eq("status", options.onlyStatus);
  }
  const { error } = await query;
  if (error) {
    throw new Error("Unable to update the import summary.");
  }
}

export type CommitTotals = {
  status: "committed" | "failed";
  created: number;
  updated: number;
  failed: number;
  failureReasons: string[];
};

/**
 * Supabase-path end of a commit: merges the commit counts, outcomesRecorded and
 * mismatchCount into the summary (the dry-run counts and ignoredColumns
 * survive) and flips the batch status. `expectedRows` is how many create/update
 * rows the commit set out to write; any without an outcome count as not attempted.
 */
export async function finishImportBatch(
  input: ImportCommitInput,
  totals: CommitTotals,
  recorder: OutcomeRecorder,
  expectedRows: number,
): Promise<void> {
  await recorder.flush();
  const notAttempted = Math.max(0, expectedRows - recorder.recordedCount);
  const now = new Date().toISOString();
  await mergeBatchSummary(
    input.churchId,
    input.batchId,
    {
      committedByProfileId: input.actorProfileId,
      committedAt: now,
      created: totals.created,
      updated: totals.updated,
      failed: totals.failed,
      outcomesRecorded: true,
      mismatchCount: totals.failed + notAttempted + recorder.valueMismatches,
      ...(totals.failureReasons.length > 0 ? { failureReasons: totals.failureReasons.slice(0, 10) } : {}),
    },
    {
      set: {
        status: totals.status,
        dry_run: false,
        committed_at: totals.status === "committed" ? now : null,
        failed_at: totals.status === "failed" ? now : null,
      },
    },
  );
}

/** Marks a claimed batch failed. Never throws: the original error is the one to surface. */
export async function failImportBatch(
  churchId: string,
  batchId: string,
  reason: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    await mergeBatchSummary(
      churchId,
      batchId,
      { error: reason, ...extra },
      { set: { status: "failed", dry_run: false, failed_at: new Date().toISOString() }, onlyStatus: "committing" },
    );
  } catch {
    console.error("[import-commit] could not mark batch failed", { churchId, batchId });
  }
}

export type ImportCommitInput = {
  churchId: string;
  actorProfileId: string | null;
  batchId: string;
  /** The login id (auth user), used as audit_log.actor_id. */
  actorUserId?: string | null;
  actorRole?: string | null;
};

/** Rows of a crashed batch that would be mismatches: failed, or never reached. Null if it cannot be counted. */
async function countUnwrittenRows(churchId: string, batchId: string): Promise<number | null> {
  try {
    const supabase = await createTenantServerClient();
    const { count, error } = await supabase
      .from("import_batch_rows")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", batchId)
      .eq("church_id", churchId)
      .in("classification", ["create", "update"])
      .or("commit_outcome.is.null,commit_outcome.eq.failed");
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

/**
 * Claims the batch (Supabase), runs the commit with an outcome recorder, and
 * marks the batch failed if it throws. Outcomes already buffered are flushed
 * first so a mid-batch crash keeps what was written.
 */
export async function runClaimedCommit<T>(
  input: ImportCommitInput,
  run: (recorder: OutcomeRecorder) => Promise<T>,
): Promise<T> {
  const claimed = !shouldUseLocalTenantFallback();
  if (claimed) {
    await claimImportBatch(input.churchId, input.batchId);
  }
  const recorder = createOutcomeRecorder(input.churchId, input.batchId);
  try {
    const result = await run(recorder);
    await recorder.flush();
    return result;
  } catch (error) {
    if (claimed) {
      let flushed = true;
      try {
        await recorder.flush();
      } catch {
        flushed = false;
      }
      const message = error instanceof Error ? error.message : "Import commit failed.";
      const unwritten = flushed ? await countUnwrittenRows(input.churchId, input.batchId) : null;
      await failImportBatch(input.churchId, input.batchId, message, {
        outcomesRecorded: true,
        ...(unwritten !== null ? { mismatchCount: unwritten + recorder.valueMismatches } : {}),
      });
    }
    throw error;
  }
}

/** One audit entry per successful commit: batch id, type, source and counts. No names, emails or cell values. */
export async function auditImportCommit(
  input: ImportCommitInput,
  counts: { status: string; created: number; updated: number; failed: number },
): Promise<void> {
  if (shouldUseLocalTenantFallback()) return;
  try {
    const supabase = await createTenantServerClient();
    const { data } = await supabase
      .from("import_batches")
      .select("import_type, source_system")
      .eq("id", input.batchId)
      .eq("church_id", input.churchId)
      .maybeSingle();

    await logAuditEvent({
      tableName: "import_batches",
      recordId: input.batchId,
      operation: "UPDATE",
      actorId: input.actorUserId ?? null,
      churchId: input.churchId,
      actorRole: input.actorRole ?? null,
      newValues: {
        event: "import_commit",
        import_type: data?.import_type ?? null,
        source_system: data?.source_system ?? null,
        ...counts,
      },
    });
  } catch {
    // The data is already committed; a lost audit entry is logged, not fatal.
    console.error("[import-commit] audit entry failed", { churchId: input.churchId, batchId: input.batchId });
  }
}
