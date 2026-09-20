import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantAdminClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import { sendWithSuppression } from "@/lib/communications/send-with-suppression";

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
      // Increment retry_count so this row is not retried indefinitely if the
      // profile is permanently missing, but do not change status.
      await incrementRetryCountOnly(row);
      continue;
    }

    // Synthetic session: profile.id = null is safe — sentBy accepts null.
    const syntheticSession = buildSyntheticSession(row.church_id);

    try {
      const result = await sendWithSuppression({
        session: syntheticSession,
        recipientProfileId: row.recipient_id,
        recipientContact: contact,
        channel: row.channel,
        subject: row.subject ?? undefined,
        body: row.body_preview ?? "",
        retryCount: row.retry_count + 1,
      });

      if (result.skipped) {
        skipped++;
        await incrementRetryCountOnly(row);
      } else if (result.sent && !result.error) {
        succeeded++;
        await markSent(row);
      } else {
        failedAgain++;
        await markFailedAgain(row, result.error ?? "unknown_error");
      }
    } catch (err) {
      failedAgain++;
      const code = err instanceof Error ? err.message.slice(0, 64) : "unknown_error";
      await markFailedAgain(row, code);
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

async function markSent(row: EligibleRow): Promise<void> {
  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.communication_logs
       set status = 'sent',
           retry_count = retry_count + 1,
           last_retry_at = now()
       where id = $1
         and retry_count < 3`,
      [row.id],
    );
    return;
  }

  const admin = createTenantAdminClient();
  await admin
    .from("communication_logs")
    .update({
      status: "sent",
      retry_count: row.retry_count + 1,
      last_retry_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .lt("retry_count", 3);
}

const MAX_RETRY_COUNT = 3;

async function markFailedAgain(row: EligibleRow, errorCode: string): Promise<void> {
  const newRetryCount = row.retry_count + 1;

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.communication_logs
       set status = 'failed',
           retry_count = retry_count + 1,
           last_retry_at = now(),
           error_code = $2
       where id = $1
         and retry_count < 3`,
      [row.id, errorCode],
    );
  } else {
    const admin = createTenantAdminClient();
    await admin
      .from("communication_logs")
      .update({
        status: "failed",
        retry_count: newRetryCount,
        last_retry_at: new Date().toISOString(),
        error_code: errorCode,
      })
      .eq("id", row.id)
      .lt("retry_count", 3);
  }

  if (newRetryCount >= MAX_RETRY_COUNT) {
    await moveToDeadLetterQueue(row, errorCode, newRetryCount);
  }
}

/**
 * Records permanent retry exhaustion in communication_dlq. New code — always
 * routes through the Supabase admin client, no local-fallback branch, per the
 * repo's Supabase-only mandate (shouldUseLocalTenantFallback() is hardcoded
 * false today; the dual-path branches elsewhere in this file are legacy dead
 * code, not a pattern to extend).
 *
 * Deliberately never throws: it's called from inside markFailedAgain's own
 * try block in the caller's loop, and a throw here would be caught by that
 * same loop's catch clause, which calls markFailedAgain a second time —
 * double-counting failedAgain and double-writing communication_logs. The
 * primary record of exhaustion (communication_logs.status/retry_count) is
 * already durable by the time this runs; a failed DLQ write is a lost
 * observability record, not a lost retry-cron result, so log and move on.
 */
async function moveToDeadLetterQueue(
  row: EligibleRow,
  errorCode: string,
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
        last_error_code: errorCode,
        last_error_message: errorCode,
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

async function incrementRetryCountOnly(row: EligibleRow): Promise<void> {
  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `update public.communication_logs
       set retry_count = retry_count + 1,
           last_retry_at = now()
       where id = $1
         and retry_count < 3`,
      [row.id],
    );
    return;
  }

  const admin = createTenantAdminClient();
  await admin
    .from("communication_logs")
    .update({
      retry_count: row.retry_count + 1,
      last_retry_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .lt("retry_count", 3);
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
