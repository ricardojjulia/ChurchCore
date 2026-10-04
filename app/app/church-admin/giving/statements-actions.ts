"use server";

import { logAuditEvent } from "@/lib/actions/audit";
import { requireChurchSession, type ChurchAppSession } from "@/lib/auth";
import { anonymousAggregate, maskForStaff, resolveStatementRange, type AnonymousAggregate, type StaffStatementRow, type StatementRange, type UnstatementableGift } from "@/lib/giving-statements/build";
import { resolveConsent, type EmailDecision } from "@/lib/giving-statements/consent";
import { loadStatementRun } from "@/lib/giving-statements/load";
import { sendStatementBatch, type StatementBatchSummary } from "@/lib/giving-statements/send";
import { createTenantAdminClient } from "@/lib/supabase/tenant";

// Each export authenticates its own caller: only church admins (the giving
// page's own gate) may preview or send statements.

export type StatementPreviewRow = StaffStatementRow & {
  willEmail: boolean;
  /** Why not, in words, when `willEmail` is false. */
  reason: "no_email" | "opted_out" | "suppressed" | null;
  reasonDetail: string | null;
};

export type StatementPreview = {
  range: StatementRange;
  /** All donors with a statement, including donors of only anonymous gifts (who have no row). */
  donorCount: number;
  /** Across all donors, anonymous-only donors included, in aggregate. */
  emailCount: number;
  skipCount: number;
  /** NAMED gifts only. */
  totalCents: number;
  totalsByCurrency: Array<{ currency: string; cents: number }>;
  /** One row per donor with at least one named gift; named gifts only. */
  rows: StatementPreviewRow[];
  /** Every anonymous gift in range as one unattributed line, plus counts (no reasons, no names) for donors who gave only anonymously. */
  anonymous: AnonymousAggregate & { onlyDonors: number; onlyWillEmail: number; onlySkipped: number };
  unstatementable: UnstatementableGift[];
};

export type PreviewStatementsResult = { ok: true; preview: StatementPreview } | { ok: false; error: string };
export type SendStatementsResult = { ok: true; range: StatementRange; summary: StatementBatchSummary } | { ok: false; error: string };

async function requireGivingAdmin(): Promise<ChurchAppSession | null> {
  const session = await requireChurchSession("/app/church-admin/giving");
  return session.appContext.roleId === "church-admin" ? session : null;
}

const DENIED = { ok: false, error: "Only church admins can manage giving statements." } as const;

export async function previewStatementsAction(input: { start?: string; end?: string } = {}): Promise<PreviewStatementsResult> {
  const session = await requireGivingAdmin();
  if (!session) return DENIED;

  const churchId = session.appContext.church.id;
  const timeZone = session.appContext.church.timezone;
  const resolved = resolveStatementRange(input ?? {}, timeZone);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  try {
    const admin = createTenantAdminClient();
    const run = await loadStatementRun(admin, churchId, timeZone, resolved.range);
    const consent = await resolveConsent(admin, churchId, run.statements);

    const rows: StatementPreviewRow[] = [];
    let onlyDonors = 0;
    let onlyWillEmail = 0;
    let emailCount = 0;
    for (const statement of run.statements) {
      const decision: EmailDecision = consent.get(statement.donorKey) ?? { willEmail: false, reason: "no_email", detail: "No email on file" };
      if (decision.willEmail) emailCount += 1;
      const staffRow = maskForStaff(statement);
      if (!staffRow) {
        // Anonymous-only donor: no row, no name, no reason. Counted in aggregate.
        onlyDonors += 1;
        if (decision.willEmail) onlyWillEmail += 1;
        continue;
      }
      rows.push({
        ...staffRow,
        willEmail: decision.willEmail,
        reason: decision.willEmail ? null : decision.reason,
        reasonDetail: decision.willEmail ? null : decision.detail,
      });
    }

    const totals = new Map<string, number>();
    for (const row of rows) {
      for (const total of row.grandTotals) totals.set(total.currency, (totals.get(total.currency) ?? 0) + total.cents);
    }

    return {
      ok: true,
      preview: {
        range: resolved.range,
        donorCount: run.statements.length,
        emailCount,
        skipCount: run.statements.length - emailCount,
        totalCents: rows.reduce((sum, r) => sum + r.totalCents, 0),
        totalsByCurrency: [...totals.entries()].map(([currency, cents]) => ({ currency, cents })),
        rows,
        anonymous: {
          ...anonymousAggregate(run.statements, run.unstatementable),
          onlyDonors,
          onlyWillEmail,
          onlySkipped: onlyDonors - onlyWillEmail,
        },
        unstatementable: run.unstatementable,
      },
    };
  } catch (error) {
    console.error("previewStatementsAction failed:", error instanceof Error ? error.message : error);
    return { ok: false, error: "Could not build the statement preview. Try again." };
  }
}

export async function sendStatementsAction(input: { start: string; end: string; confirm: boolean }): Promise<SendStatementsResult> {
  const session = await requireGivingAdmin();
  if (!session) return DENIED;

  if (input?.confirm !== true) {
    return { ok: false, error: "Confirm the send before emailing statements." };
  }
  const resolved = resolveStatementRange({ start: input.start, end: input.end }, session.appContext.church.timezone);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const churchId = session.appContext.church.id;
  let summary: StatementBatchSummary;
  try {
    summary = await sendStatementBatch(session, resolved.range);
  } catch (error) {
    console.error("sendStatementsAction failed:", error instanceof Error ? error.message : error);
    return { ok: false, error: "Could not send statements. Nothing further was sent; try again." };
  }

  try {
    await logAuditEvent({
      tableName: "giving_statements",
      recordId: churchId,
      operation: "INSERT",
      actorId: session.userId,
      churchId,
      actorRole: session.appContext.roleId,
      newValues: {
        action: "batch_send",
        start: resolved.range.start,
        end: resolved.range.end,
        sent: summary.sent,
        skipped: summary.skipped,
        failed: summary.failed,
      },
    });
  } catch (error) {
    console.error("giving statement audit failed:", error instanceof Error ? error.message : error);
  }

  return { ok: true, range: resolved.range, summary };
}
