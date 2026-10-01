import { NextRequest, NextResponse } from "next/server";

import { normalizeSendgridEvents, sendgridAdapter } from "@/lib/communications/sendgrid-adapter";
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

  if (!sendgridAdapter.verifyWebhookSignature(rawBody, headers)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const events = normalizeSendgridEvents(rawBody);
  if (events.length === 0) {
    return NextResponse.json({ error: "No supported event payload provided" }, { status: 400 });
  }

  // Record every event in the batch. A failure throws (500), so SendGrid
  // retries the batch; events already recorded are skipped by idempotency.
  let recorded = 0;
  for (const { event, rawEvent } of events) {
    const result = await recordProviderWebhookEvent({ event, rawBody: rawEvent });
    if (result.recorded) recorded++;
  }

  return NextResponse.json({ ok: true, recorded: recorded > 0, recordedCount: recorded, received: events.length });
}
