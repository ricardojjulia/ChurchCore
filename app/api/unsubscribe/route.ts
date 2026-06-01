import { NextRequest } from "next/server";

import { verifyUnsubscribeToken } from "@/lib/communications/unsubscribe";

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const params = {
    t: searchParams.get("t") ?? "",
    cid: searchParams.get("cid") ?? "",
    e: searchParams.get("e") ?? "",
    ch: searchParams.get("ch") ?? "",
    sig: searchParams.get("sig") ?? "",
  };

  const result = verifyUnsubscribeToken(params);

  if (!result.valid) {
    const messages: Record<typeof result.reason, string> = {
      missing_params: "Invalid unsubscribe link.",
      expired:
        "This unsubscribe link has expired. Please contact the church directly to unsubscribe.",
      invalid_signature: "Invalid unsubscribe link.",
      invalid_channel: "Invalid unsubscribe link.",
    };
    return new Response(messages[result.reason], {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const normalizedEmail = result.contactEmail.trim().toLowerCase();

  try {
    const { shouldUseLocalTenantFallback, queryTenantLocalDb, createTenantAdminClient } =
      await import("@/lib/supabase/tenant");

    if (shouldUseLocalTenantFallback()) {
      await queryTenantLocalDb(
        `insert into public.communication_suppressions
           (church_id, channel, contact, reason, notes, suppressed_by)
         values ($1, $2, $3, 'unsubscribe', 'Self-service unsubscribe link', null)
         on conflict (church_id, channel, contact) do nothing`,
        [result.churchId, result.channel, normalizedEmail],
      );
    } else {
      const supabase = createTenantAdminClient();
      await supabase.from("communication_suppressions").upsert(
        {
          church_id: result.churchId,
          channel: result.channel,
          contact: normalizedEmail,
          reason: "unsubscribe",
          notes: "Self-service unsubscribe link",
          suppressed_by: null,
          created_at: new Date().toISOString(),
        },
        {
          onConflict: "church_id,channel,contact",
          ignoreDuplicates: true,
        },
      );
    }
  } catch (err) {
    console.error("[unsubscribe] suppression write failed:", err);
    return new Response("An error occurred. Please try again later.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const channelLabel = result.channel === "email" ? "email" : "SMS";
  return new Response(
    `You have been unsubscribed successfully. You will no longer receive ${channelLabel} messages from this church.`,
    { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
