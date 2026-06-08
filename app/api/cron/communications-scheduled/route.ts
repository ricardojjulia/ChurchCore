import { NextRequest, NextResponse } from "next/server";

import {
  hasTenantAdminBackendEnv,
  hasTenantBackendEnv,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import type { SegmentFilter } from "@/lib/communications-types";
import { resolveRecipients } from "@/lib/communications/recipient-resolver";
import { sendWithSuppression } from "@/lib/communications/send-with-suppression";

export const dynamic = "force-dynamic";

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const providedBearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const providedHeader = request.headers.get("x-cron-secret") ?? "";

  return providedBearer === cronSecret || providedHeader === cronSecret;
}

type ScheduledLogRow = {
  id: string;
  church_id: string;
  channel: "email" | "sms";
  subject: string | null;
  body_preview: string | null;
  segment_criteria: unknown;
  scheduled_for: string;
};

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasTenantBackendEnv()) {
    return NextResponse.json(
      {
        error:
          "Tenant backend is not configured. Set tenant Supabase env vars or local tenant DB fallback.",
      },
      { status: 503 },
    );
  }

  if (!shouldUseLocalTenantFallback() && !hasTenantAdminBackendEnv()) {
    return NextResponse.json(
      {
        error:
          "Scheduled communications cron requires TENANT_SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY) when local tenant DB fallback is disabled.",
      },
      { status: 503 },
    );
  }

  try {
    const { createTenantAdminClient } = await import("@/lib/supabase/tenant");
    const supabase = createTenantAdminClient();

    // Fetch all scheduled messages due to send
    const { data: dueRows, error: fetchError } = await supabase
      .from("communication_logs")
      .select("id, church_id, channel, subject, body_preview, segment_criteria, scheduled_for")
      .eq("status", "scheduled")
      .lte("scheduled_for", new Date().toISOString());

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const logs = (dueRows ?? []) as ScheduledLogRow[];

    if (logs.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    let processed = 0;

    for (const log of logs) {
      // Mark as sending BEFORE dispatching to prevent double-send on overlap runs
      const { error: markError } = await supabase
        .from("communication_logs")
        .update({ status: "sending" })
        .eq("id", log.id)
        .eq("status", "scheduled"); // optimistic lock — skip if already changed

      if (markError) {
        console.error(`[comm-scheduled] Failed to mark ${log.id} as sending:`, markError.message);
        continue;
      }

      try {
        const segment = (log.segment_criteria as SegmentFilter) ?? {};
        const body = log.body_preview ?? "";

        // Recipient resolution is always scoped to log.church_id — never user-supplied
        const recipients = await resolveRecipients(log.church_id, log.channel, segment);

        if (recipients.length > 0) {
          // Build a minimal synthetic session for sendWithSuppression.
          // The cron runs as a service-role context with no user session.
          const syntheticSession = {
            appContext: {
              church: { id: log.church_id },
              roleId: "church-admin" as const,
              source: "supabase" as const,
            },
            profile: { id: null as string | null },
            source: "supabase" as const,
            userId: null as string | null,
          };

          for (const recipient of recipients) {
            try {
              await sendWithSuppression({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                session: syntheticSession as any,
                recipientProfileId: recipient.profileId,
                recipientContact: recipient.contact,
                channel: log.channel,
                subject: log.subject ?? undefined,
                body,
              });
            } catch (recipientErr) {
              console.error(
                `[comm-scheduled] Failed to send to ${recipient.profileId} for log ${log.id}:`,
                recipientErr,
              );
            }
          }
        }

        await supabase
          .from("communication_logs")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", log.id);

        processed++;
      } catch (err) {
        console.error(`[comm-scheduled] Error processing log ${log.id}:`, err);

        await supabase
          .from("communication_logs")
          .update({
            status: "failed",
            error_message:
              err instanceof Error ? err.message : "Scheduled send failed.",
          })
          .eq("id", log.id);
      }
    }

    return NextResponse.json({ processed });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to run communications scheduled job.",
      },
      { status: 500 },
    );
  }
}
