import { NextRequest, NextResponse } from "next/server";

import { twilioAdapter } from "@/lib/communications/twilio-adapter";
import { recordProviderWebhookEvent } from "@/lib/communications/webhook-events";

function normalizeHeaders(headers: Headers): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();
  const headers = normalizeHeaders(request.headers);

  if (!twilioAdapter.verifyWebhookSignature(rawBody, headers)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = twilioAdapter.normalizeWebhookEvent(rawBody, headers);
  if (!event) {
    return NextResponse.json({ error: "No supported event payload provided" }, { status: 400 });
  }

  const result = await recordProviderWebhookEvent({
    event,
    rawBody,
  });

  return NextResponse.json({ ok: true, recorded: result.recorded });
}
