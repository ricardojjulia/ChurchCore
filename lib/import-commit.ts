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

/** Marks a claimed batch failed. Never throws: the original error is the one to surface. */
export async function failImportBatch(churchId: string, batchId: string, reason: string): Promise<void> {
  try {
    const supabase = await createTenantServerClient();
    const { error } = await supabase
      .from("import_batches")
      .update({
        status: "failed",
        dry_run: false,
        failed_at: new Date().toISOString(),
        summary: { error: reason },
      })
      .eq("id", batchId)
      .eq("church_id", churchId)
      .eq("status", "committing");
    if (error) {
      console.error("[import-commit] could not mark batch failed", { churchId, batchId });
    }
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

/** Claims the batch (Supabase), runs the commit, and marks the batch failed if it throws. */
export async function runClaimedCommit<T>(input: ImportCommitInput, run: () => Promise<T>): Promise<T> {
  const claimed = !shouldUseLocalTenantFallback();
  if (claimed) {
    await claimImportBatch(input.churchId, input.batchId);
  }
  try {
    return await run();
  } catch (error) {
    if (claimed) {
      const message = error instanceof Error ? error.message : "Import commit failed.";
      await failImportBatch(input.churchId, input.batchId, message);
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
