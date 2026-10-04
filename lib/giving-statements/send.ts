import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import { sendWithSuppression } from "@/lib/communications/send-with-suppression";
import { createTenantAdminClient } from "@/lib/supabase/tenant";

import { idempotencyKey, type DonorStatement, type StatementRange } from "./build";
import { resolveConsent, type EmailDecision } from "./consent";
import { renderStatementEmail } from "./email";
import { loadChurchHeader, loadStatementRun, type ChurchHeader } from "./load";

type AdminClient = ReturnType<typeof createTenantAdminClient>;

/** A `sending` claim older than this is a crashed run: failed, then re-claimable. */
export const STALE_CLAIM_MS = 15 * 60 * 1000;
const BATCH_CONCURRENCY = 5;
/** Stop claiming new donors after this long; a re-run (idempotent) continues. Keeps a send inside the page's maxDuration. */
export const BATCH_BUDGET_MS = 40_000;
/** Not in `retry-eligible.ts`'s transient list: the retry cron must never re-send a statement from its truncated preview. */
export const STATEMENT_SEND_FAILED = "statement_send_failed";
export const STATEMENT_CLAIM_STALE = "statement_claim_stale";
const PREVIEW = "Annual giving statement";

export type SkipReason = "no_email" | "opted_out" | "suppressed" | "already_sent";

export type StatementBatchSummary = {
  /** Donors with a statement in the range. */
  donors: number;
  sent: number;
  skipped: Record<SkipReason, number>;
  skippedTotal: number;
  failed: number;
  /** Gifts that have no donor profile or email: never emailed. */
  unstatementable: number;
  /** Donors not reached because the time budget ran out. Run Send again to continue. */
  remaining: number;
  complete: boolean;
};

type Outcome = { kind: "sent" } | { kind: "skipped"; reason: SkipReason } | { kind: "failed" };

type ClaimResult = { kind: "claimed"; id: string } | { kind: "already_sent" };

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

async function claim(
  admin: AdminClient,
  session: ChurchAppSession,
  statement: DonorStatement,
  range: StatementRange,
  key: string,
  subject: string,
  now: () => number,
): Promise<ClaimResult> {
  const churchId = session.appContext.church.id;

  const tryInsert = () =>
    admin
      .from("communication_logs")
      .insert({
        church_id: churchId,
        sent_by: session.churchProfileId,
        recipient_id: statement.profileId,
        channel: "email",
        subject,
        body_preview: PREVIEW,
        status: "sending",
        segment_criteria: { kind: "giving_statement", statementKey: key, start: range.start, end: range.end },
      })
      .select("id")
      .single();

  let { data, error } = await tryInsert();
  if (!error && data) return { kind: "claimed", id: (data as { id: string }).id };
  if (!isUniqueViolation(error)) throw new Error(`Failed to claim statement send: ${error?.message ?? "no row"}`);

  // Someone holds the claim. If it is a crashed run's stale `sending` row, fail it and take over.
  const { data: held, error: readError } = await admin
    .from("communication_logs")
    .select("id, status, created_at")
    .eq("church_id", churchId)
    .eq("segment_criteria->>statementKey", key)
    .in("status", ["sending", "queued", "sent", "delivered"]);
  if (readError) throw new Error(`Failed to read statement claim: ${readError.message}`);
  const rows = (held ?? []) as Array<{ id: string; status: string; created_at: string }>;
  const stale = rows.filter((r) => r.status === "sending" && now() - new Date(r.created_at).getTime() > STALE_CLAIM_MS);
  // A live holder (fresh sending, queued, sent, delivered) owns the send. No
  // indexed holder at all means it left the index since our insert: retry once.
  if (rows.length > 0 && stale.length !== rows.length) return { kind: "already_sent" };

  for (const row of stale) {
    const { data: updated, error: staleError } = await admin
      .from("communication_logs")
      .update({
        status: "failed",
        failed_at: new Date(now()).toISOString(),
        error_code: STATEMENT_CLAIM_STALE,
        error_message: "Statement send was interrupted before it finished.",
      })
      .eq("church_id", churchId)
      .eq("id", row.id)
      .eq("status", "sending")
      .select("id");
    if (staleError) throw new Error(`Failed to release stale statement claim: ${staleError.message}`);
    // Lost the race to another run that already took over: it owns the send.
    if (!updated || updated.length === 0) return { kind: "already_sent" };
  }

  ({ data, error } = await tryInsert());
  if (!error && data) return { kind: "claimed", id: (data as { id: string }).id };
  if (isUniqueViolation(error)) return { kind: "already_sent" };
  throw new Error(`Failed to claim statement send: ${error?.message ?? "no row"}`);
}

async function finishClaim(admin: AdminClient, churchId: string, id: string, patch: Record<string, unknown>) {
  const { error } = await admin.from("communication_logs").update(patch).eq("church_id", churchId).eq("id", id);
  // The email may already be out, so this cannot undo anything. A `sending` row
  // stays a blocking claim, which errs toward never sending twice.
  if (error) console.error("Failed to update giving statement log:", id, error.message);
}

async function sendOne(
  admin: AdminClient,
  session: ChurchAppSession,
  church: ChurchHeader,
  statement: DonorStatement,
  decision: EmailDecision,
  range: StatementRange,
  now: () => number,
): Promise<Outcome> {
  if (!decision.willEmail) return { kind: "skipped", reason: decision.reason };
  const email = statement.email;
  if (!email) return { kind: "skipped", reason: "no_email" };

  const churchId = session.appContext.church.id;
  const key = idempotencyKey(churchId, statement.donorKey, range);
  const rendered = renderStatementEmail({ church, statement, range });

  const claimed = await claim(admin, session, statement, range, key, rendered.subject, now);
  if (claimed.kind === "already_sent") return { kind: "skipped", reason: "already_sent" };

  try {
    const result = await sendWithSuppression({
      session,
      recipientProfileId: statement.profileId,
      recipientContact: email,
      channel: "email",
      subject: rendered.subject,
      body: rendered.text,
      html: rendered.html,
      recordLog: false,
    });

    if (result.skipped) {
      const suppressed = result.skipCode !== "opted_out";
      await finishClaim(admin, churchId, claimed.id, {
        status: suppressed ? "suppressed" : "unsubscribed",
        error_message: result.skipReason?.slice(0, 300) ?? null,
      });
      return { kind: "skipped", reason: suppressed ? "suppressed" : "opted_out" };
    }
    if (result.sent) {
      await finishClaim(admin, churchId, claimed.id, {
        status: "sent",
        sent_at: new Date(now()).toISOString(),
        provider: result.provider ?? null,
        external_id: result.externalId ?? null,
        provider_message_id: result.externalId ?? null,
      });
      return { kind: "sent" };
    }
    await finishClaim(admin, churchId, claimed.id, {
      status: "failed",
      failed_at: new Date(now()).toISOString(),
      error_code: STATEMENT_SEND_FAILED,
      error_message: (result.error ?? "Email provider did not accept the message.").slice(0, 300),
    });
    return { kind: "failed" };
  } catch (error) {
    await finishClaim(admin, churchId, claimed.id, {
      status: "failed",
      failed_at: new Date(now()).toISOString(),
      error_code: STATEMENT_SEND_FAILED,
      error_message: (error instanceof Error ? error.message : "Send failed").slice(0, 300),
    });
    return { kind: "failed" };
  }
}

/**
 * Emails every statementable donor who can be emailed. Claim before send: the
 * claim row's unique statement key is the idempotency lock, so a re-run, a
 * double click or a concurrent batch never emails a donor twice. One donor's
 * failure never aborts the batch. Callers must have verified the church-admin gate.
 */
export async function sendStatementBatch(
  session: ChurchAppSession,
  range: StatementRange,
  deps: { admin?: AdminClient; now?: () => number; budgetMs?: number } = {},
): Promise<StatementBatchSummary> {
  const admin = deps.admin ?? createTenantAdminClient();
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const budgetMs = deps.budgetMs ?? BATCH_BUDGET_MS;
  const churchId = session.appContext.church.id;
  const timeZone = session.appContext.church.timezone;

  const [church, run] = await Promise.all([
    loadChurchHeader(admin, churchId),
    loadStatementRun(admin, churchId, timeZone, range),
  ]);
  const consent = await resolveConsent(admin, churchId, run.statements);

  const summary: StatementBatchSummary = {
    donors: run.statements.length,
    sent: 0,
    skipped: { no_email: 0, opted_out: 0, suppressed: 0, already_sent: 0 },
    skippedTotal: 0,
    failed: 0,
    unstatementable: run.unstatementable.length,
    remaining: 0,
    complete: true,
  };

  for (let i = 0; i < run.statements.length; i += BATCH_CONCURRENCY) {
    if (now() - startedAt >= budgetMs) {
      summary.remaining = run.statements.length - i;
      summary.complete = false;
      break;
    }
    const chunk = run.statements.slice(i, i + BATCH_CONCURRENCY);
    const outcomes = await Promise.all(
      chunk.map(async (statement): Promise<Outcome> => {
        try {
          const decision = consent.get(statement.donorKey) ?? ({ willEmail: false, reason: "no_email", detail: "" } as EmailDecision);
          return await sendOne(admin, session, church, statement, decision, range, now);
        } catch (error) {
          console.error("Giving statement send failed for one donor:", error instanceof Error ? error.message : error);
          return { kind: "failed" };
        }
      }),
    );
    for (const outcome of outcomes) {
      if (outcome.kind === "sent") summary.sent += 1;
      else if (outcome.kind === "failed") summary.failed += 1;
      else {
        summary.skipped[outcome.reason] += 1;
        summary.skippedTotal += 1;
      }
    }
  }
  return summary;
}
