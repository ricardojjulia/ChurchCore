import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantAdminClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import { sendWithSuppression } from "@/lib/communications/send-with-suppression";
import type { QueueCommunicationResult } from "@/lib/notifications/queue-communication";

export type RetryEligibleResult = {
  selected: number;
  succeeded: number;
  failedAgain: number;
  skipped: number;
};

export type EligibleRow = {
  id: string;
  church_id: string;
  recipient_id: string | null;
  channel: "email" | "sms";
  subject: string | null;
  body_preview: string | null;
  retry_count: number;
  error_code: string | null;
};

type ContactRow = {
  email: string | null;
  phone: string | null;
};

const TRANSIENT_ERROR_CODES = [
  "timeout",
  "rate_limited",
  "provider_unavailable",
  "network_error",
  "temporary_failure",
];

export async function retryEligibleCommunications(
  options?: { churchId?: string },
): Promise<RetryEligibleResult> {
  const churchIdFilter = options?.churchId;

  let rows: EligibleRow[] = [];

  if (shouldUseLocalTenantFallback()) {
    rows = await queryEligibleRowsLocal(churchIdFilter);
  } else {
    rows = await queryEligibleRowsAdmin(churchIdFilter);
  }

  let succeeded = 0;
  let failedAgain = 0;
  let skipped = 0;

  for (const row of rows) {
    const contact = await resolveContact(row);
    // Synthetic session: profile.id = null is safe — sentBy accepts null.
    const outcome = await attemptRetry(row, contact, buildSyntheticSession(row.church_id));

    if (outcome.kind === "sent") succeeded++;
    else if (outcome.kind === "failed") failedAgain++;
    else skipped++;
  }

  return {
    selected: rows.length,
    succeeded,
    failedAgain,
    skipped,
  };
}

// ── Query helpers ─────────────────────────────────────────────────────────────

async function queryEligibleRowsLocal(churchIdFilter?: string): Promise<EligibleRow[]> {
  const codeParams = TRANSIENT_ERROR_CODES.map((_, i) =>
    `$${i + (churchIdFilter ? 2 : 1)}`,
  ).join(", ");

  const query = churchIdFilter
    ? `select id, church_id, recipient_id, channel, subject, body_preview, retry_count, error_code
       from public.communication_logs
       where status = 'failed'
         and retry_count < 3
         and error_code in (${codeParams})
         and church_id = $1`
    : `select id, church_id, recipient_id, channel, subject, body_preview, retry_count, error_code
       from public.communication_logs
       where status = 'failed'
         and retry_count < 3
         and error_code in (${codeParams})`;

  const args: unknown[] = churchIdFilter
    ? [churchIdFilter, ...TRANSIENT_ERROR_CODES]
    : TRANSIENT_ERROR_CODES;

  const result = await queryTenantLocalDb<EligibleRow>(query, args);
  return result.rows;
}

async function queryEligibleRowsAdmin(churchIdFilter?: string): Promise<EligibleRow[]> {
  const admin = createTenantAdminClient();
  let request = admin
    .from("communication_logs")
    .select(
      "id, church_id, recipient_id, channel, subject, body_preview, retry_count, error_code",
    )
    .eq("status", "failed")
    .lt("retry_count", 3)
    .in("error_code", TRANSIENT_ERROR_CODES);

  if (churchIdFilter) {
    request = request.eq("church_id", churchIdFilter);
  }

  const { data, error } = await request;
  if (error) {
    throw new Error(`Failed to query eligible retries: ${error.message}`);
  }
  return (data ?? []) as EligibleRow[];
}

// ── Contact resolution ────────────────────────────────────────────────────────

async function resolveContact(row: EligibleRow): Promise<string | null> {
  if (!row.recipient_id) {
    return null;
  }

  let contactRow: ContactRow | null = null;

  if (shouldUseLocalTenantFallback()) {
    const profileResult = await queryTenantLocalDb<ContactRow>(
      `select email, phone
       from public.profiles
       where id = $1
         and church_id = $2
       limit 1`,
      [row.recipient_id, row.church_id],
    );
    contactRow = profileResult.rows[0] ?? null;
  } else {
    const admin = createTenantAdminClient();
    const { data: profileData, error: profileError } = await admin
      .from("profiles")
      .select("email, phone")
      .eq("id", row.recipient_id)
      .eq("church_id", row.church_id)
      .maybeSingle();

    if (profileError) {
      return null;
    }
    contactRow = (profileData as ContactRow | null) ?? null;
  }

  if (!contactRow) {
    return null;
  }

  const contact = row.channel === "email" ? contactRow.email : contactRow.phone;
  return contact ?? null;
}

// ── Single attempt ────────────────────────────────────────────────────────────

const MAX_RETRY_COUNT = 3;
const MAX_ERROR_MESSAGE_LENGTH = 500;

type AttemptError = { code: string; message: string };

type LogPatch = Record<string, string | number | null>;

export type RetryAttemptOutcome =
  | { kind: "sent" }
  | { kind: "failed"; error: string }
  | { kind: "skipped"; reason: string }
  | { kind: "not_claimed" };

/**
 * One retry attempt against an existing communication_logs row. Shared by the
 * cron and the operator's per-row Retry so both follow the same contract:
 *
 *  1. Claim — increment retry_count, guarded on the value the caller read.
 *     Losing the claim means another run owns this attempt: nothing is sent.
 *     Claiming before dispatch bounds sends by the retry budget even if the
 *     outcome write below fails.
 *  2. Dispatch with recordLog: false — the outcome belongs on this row; a new
 *     log row would be a second retry-eligible copy of the same message.
 *  3. Record the outcome, guarded on the claimed retry_count.
 *  4. Dead-letter when the message is terminal: budget spent, or re-failed
 *     with a non-transient code (only once that code is durably recorded —
 *     otherwise the row still carries its old transient code and is eligible).
 */
export async function attemptRetry(
  row: EligibleRow,
  contact: string | null,
  session: ChurchAppSession,
): Promise<RetryAttemptOutcome> {
  const claimedCount = row.retry_count + 1;
  const claimed = await updateSourceRow(row, row.retry_count, {
    retry_count: claimedCount,
    last_retry_at: new Date().toISOString(),
  });
  if (!claimed) {
    return { kind: "not_claimed" };
  }
  const exhausted = claimedCount >= MAX_RETRY_COUNT;

  if (contact === null) {
    const reason = { code: "recipient_missing", message: "Recipient profile or contact detail not found." };
    if (exhausted) await moveToDeadLetterQueue(row, reason, claimedCount);
    return { kind: "skipped", reason: reason.message };
  }

  let result: QueueCommunicationResult;
  try {
    result = await sendWithSuppression({
      session,
      recipientProfileId: row.recipient_id,
      recipientContact: contact,
      channel: row.channel,
      subject: row.subject ?? undefined,
      body: row.body_preview ?? "",
      retryCount: claimedCount,
      recordLog: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordFailure(row, claimedCount, { code: "unknown_error", message });
    return { kind: "failed", error: message };
  }

  if (result.skipped) {
    const reason = {
      code: result.skipCode === "opted_out" ? "recipient_opted_out" : "recipient_suppressed",
      message: result.skipReason ?? "Recipient is suppressed.",
    };
    if (exhausted) await moveToDeadLetterQueue(row, reason, claimedCount);
    return { kind: "skipped", reason: reason.message };
  }

  if (result.sent && !result.error) {
    const now = new Date().toISOString();
    const patch: LogPatch = { status: "sent", sent_at: now };
    // Delivery webhooks match on provider_message_id / external_id, so the
    // source row must carry the id of the attempt that actually went out.
    if (result.provider) patch.provider = result.provider;
    if (result.externalId) {
      patch.provider_message_id = result.externalId;
      patch.external_id = result.externalId;
    }
    await updateSourceRow(row, claimedCount, patch);
    return { kind: "sent" };
  }

  const message = result.error ?? "unknown_error";
  await recordFailure(row, claimedCount, { code: result.errorCode ?? "unknown_error", message });
  return { kind: "failed", error: message };
}

async function recordFailure(row: EligibleRow, claimedCount: number, failure: AttemptError): Promise<void> {
  const recorded = await updateSourceRow(row, claimedCount, {
    status: "failed",
    error_code: failure.code,
    error_message: failure.message.slice(0, MAX_ERROR_MESSAGE_LENGTH),
  });

  // Budget spent: the claim alone already removed the row from the eligible
  // query. Non-transient: only terminal once the new code is on the row.
  const terminal =
    claimedCount >= MAX_RETRY_COUNT ||
    (recorded && !TRANSIENT_ERROR_CODES.includes(failure.code));

  if (terminal) {
    await moveToDeadLetterQueue(row, failure, claimedCount);
  }
}

/**
 * Applies `patch` to the source communication_logs row, guarded on the
 * expected retry_count (and church) so a stale caller cannot overwrite
 * another run's attempt. Returns true only when the row was actually updated.
 * Never throws: one failed bookkeeping write must not abort the rest of a run.
 * Supabase-only — new code, per the Supabase-only mandate.
 */
async function updateSourceRow(
  row: EligibleRow,
  expectedRetryCount: number,
  patch: LogPatch,
): Promise<boolean> {
  try {
    const admin = createTenantAdminClient();
    const { data, error } = await admin
      .from("communication_logs")
      .update(patch)
      .eq("id", row.id)
      .eq("church_id", row.church_id)
      .eq("retry_count", expectedRetryCount)
      .select("id");

    if (error) {
      console.error(`Failed to update communication_log ${row.id} during retry: ${error.message}`);
      return false;
    }
    return (data ?? []).length > 0;
  } catch (err) {
    console.error(`Failed to update communication_log ${row.id} during retry:`, err);
    return false;
  }
}

/**
 * Records permanent retry exhaustion in communication_dlq. New code — always
 * routes through the Supabase admin client, no local-fallback branch, per the
 * repo's Supabase-only mandate (shouldUseLocalTenantFallback() is hardcoded
 * false today; the dual-path branches elsewhere in this file are legacy dead
 * code, not a pattern to extend).
 *
 * Only called once the source row can no longer be selected for retry, so the
 * primary record of exhaustion is already durable on communication_logs.
 * Deliberately never throws: a failed DLQ write is a lost observability
 * record, not a lost retry-cron result, so log and move on rather than abort
 * the rest of the run.
 */
async function moveToDeadLetterQueue(
  row: EligibleRow,
  failure: AttemptError,
  attemptedCount: number,
): Promise<void> {
  try {
    const admin = createTenantAdminClient();
    const { error } = await admin.from("communication_dlq").upsert(
      {
        church_id: row.church_id,
        communication_log_id: row.id,
        channel: row.channel,
        recipient_id: row.recipient_id,
        attempted_count: attemptedCount,
        last_error_code: failure.code,
        last_error_message: failure.message.slice(0, MAX_ERROR_MESSAGE_LENGTH),
        moved_to_dlq_at: new Date().toISOString(),
      },
      { onConflict: "communication_log_id" },
    );

    if (error) {
      console.error(
        `Failed to record dead-letter entry for communication_log ${row.id}: ${error.message}`,
      );
    }
  } catch (err) {
    console.error(
      `Failed to record dead-letter entry for communication_log ${row.id}:`,
      err,
    );
  }
}

// ── Session builder ───────────────────────────────────────────────────────────

function buildSyntheticSession(churchId: string): ChurchAppSession {
  return {
    appContext: {
      kind: "church",
      church: {
        id: churchId,
        name: "",
        slug: "",
        timezone: "UTC",
      },
      roleId: "church-admin",
      source: "membership",
      homePath: "/app/church-admin",
    },
    profile: { id: null } as unknown as ChurchAppSession["profile"],
    source: "supabase",
    userId: "",
    homePath: "/app/church-admin",
    canAccessControl: false,
    memberships: [],
    tenantViews: [],
  } as unknown as ChurchAppSession;
}
