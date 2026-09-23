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

type EligibleRow = {
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

    if (contact === null) {
      skipped++;
      // Consume the attempt so a permanently missing profile is not retried
      // indefinitely, but do not change status.
      await consumeAttemptWithoutSend(row, {
        code: "recipient_missing",
        message: "Recipient profile or contact detail not found.",
      });
      continue;
    }

    // Synthetic session: profile.id = null is safe — sentBy accepts null.
    const syntheticSession = buildSyntheticSession(row.church_id);

    let result: QueueCommunicationResult;
    try {
      // recordLog: false — the outcome is recorded on this row below. Letting
      // the dispatcher insert its own log would create a second failed,
      // retry-eligible row for the same logical message on every failure.
      result = await sendWithSuppression({
        session: syntheticSession,
        recipientProfileId: row.recipient_id,
        recipientContact: contact,
        channel: row.channel,
        subject: row.subject ?? undefined,
        body: row.body_preview ?? "",
        retryCount: row.retry_count + 1,
        recordLog: false,
      });
    } catch (err) {
      failedAgain++;
      await markFailedAgain(row, {
        code: "unknown_error",
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (result.skipped) {
      skipped++;
      await consumeAttemptWithoutSend(row, {
        code: "recipient_suppressed",
        message: result.skipReason ?? "Recipient is suppressed.",
      });
    } else if (result.sent && !result.error) {
      succeeded++;
      await markSent(row, result);
    } else {
      failedAgain++;
      await markFailedAgain(row, {
        code: result.errorCode ?? "unknown_error",
        message: result.error ?? "unknown_error",
      });
    }
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

// ── Update helpers ────────────────────────────────────────────────────────────

const MAX_RETRY_COUNT = 3;

type AttemptError = { code: string; message: string };

type LogPatch = Record<string, string | number | null>;

/**
 * Applies `patch` to the source communication_logs row, guarded on the
 * retry_count this run selected so two overlapping runs cannot both consume
 * the same attempt. Returns true only when the row was actually updated —
 * callers must not record terminal state (DLQ) unless it was. Never throws:
 * one failed bookkeeping write must not abort the rest of the run.
 */
async function updateSourceRow(row: EligibleRow, patch: LogPatch): Promise<boolean> {
  try {
    if (shouldUseLocalTenantFallback()) {
      const columns = Object.keys(patch);
      const assignments = columns.map((column, index) => `${column} = $${index + 3}`).join(", ");
      const result = await queryTenantLocalDb<{ id: string }>(
        `update public.communication_logs
         set ${assignments}
         where id = $1
           and retry_count = $2
         returning id`,
        [row.id, row.retry_count, ...columns.map((column) => patch[column])],
      );
      return result.rows.length > 0;
    }

    const admin = createTenantAdminClient();
    const { data, error } = await admin
      .from("communication_logs")
      .update(patch)
      .eq("id", row.id)
      .eq("retry_count", row.retry_count)
      .select("id");

    if (error) {
      console.error(`Failed to update communication_log ${row.id} after retry: ${error.message}`);
      return false;
    }
    return (data ?? []).length > 0;
  } catch (err) {
    console.error(`Failed to update communication_log ${row.id} after retry:`, err);
    return false;
  }
}

async function markSent(row: EligibleRow, result: QueueCommunicationResult): Promise<void> {
  const now = new Date().toISOString();
  const patch: LogPatch = {
    status: "sent",
    retry_count: row.retry_count + 1,
    last_retry_at: now,
    sent_at: now,
  };
  // Delivery webhooks match on provider_message_id / external_id, so the
  // source row must carry the id of the attempt that actually went out.
  if (result.provider) patch.provider = result.provider;
  if (result.externalId) {
    patch.provider_message_id = result.externalId;
    patch.external_id = result.externalId;
  }

  await updateSourceRow(row, patch);
}

async function markFailedAgain(row: EligibleRow, failure: AttemptError): Promise<void> {
  const newRetryCount = row.retry_count + 1;

  const updated = await updateSourceRow(row, {
    status: "failed",
    retry_count: newRetryCount,
    last_retry_at: new Date().toISOString(),
    error_code: failure.code,
    error_message: failure.message,
  });

  // A non-transient code drops the row out of the eligible query just as
  // surely as exhausting the budget does, so both are terminal.
  const terminal =
    newRetryCount >= MAX_RETRY_COUNT || !TRANSIENT_ERROR_CODES.includes(failure.code);

  if (updated && terminal) {
    await moveToDeadLetterQueue(row, failure, newRetryCount);
  }
}

/**
 * Consumes a retry attempt without a send (missing recipient, suppressed).
 * Status and error_code are left alone, so the row stays eligible until the
 * budget runs out — at which point it is dead-lettered like any other
 * exhausted retry.
 */
async function consumeAttemptWithoutSend(row: EligibleRow, reason: AttemptError): Promise<void> {
  const newRetryCount = row.retry_count + 1;

  const updated = await updateSourceRow(row, {
    retry_count: newRetryCount,
    last_retry_at: new Date().toISOString(),
  });

  if (updated && newRetryCount >= MAX_RETRY_COUNT) {
    await moveToDeadLetterQueue(row, reason, newRetryCount);
  }
}

/**
 * Records permanent retry exhaustion in communication_dlq. New code — always
 * routes through the Supabase admin client, no local-fallback branch, per the
 * repo's Supabase-only mandate (shouldUseLocalTenantFallback() is hardcoded
 * false today; the dual-path branches elsewhere in this file are legacy dead
 * code, not a pattern to extend).
 *
 * Only called after the source row update succeeded, so the primary record
 * of exhaustion (communication_logs.status/retry_count) is already durable.
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
        last_error_message: failure.message,
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
