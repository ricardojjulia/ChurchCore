import { NextRequest, NextResponse } from "next/server";

import { appBaseUrl } from "@/lib/app-url";
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

  // Twilio signs the public URL it called, which behind a proxy isn't
  // request.url's host; the app's configured base URL is.
  const base = appBaseUrl();
  const signedUrl = base ? `${base}${request.nextUrl.pathname}${request.nextUrl.search}` : null;

  if (!twilioAdapter.verifyWebhookSignature(rawBody, headers, signedUrl)) {
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
