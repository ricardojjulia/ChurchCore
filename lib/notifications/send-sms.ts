/**
 * sendSms — wraps Twilio Messages API.
 *
 * Requires env vars:
 *   TWILIO_ACCOUNT_SID  — e.g. AC…
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_NUMBER  — E.164 e.g. +15551234567
 *
 * When absent, logs to console and returns a stub result.
 *
 * IMPORTANT: only send SMS to members whose sms_opt_in = true
 * in notification_preferences. Consent-checking is enforced by
 * queueCommunicationAction before this function is called.
 */

export interface SendSmsInput {
  /** E.164 formatted recipient number, e.g. "+15551234567" */
  to: string;
  body: string;
}

export interface SendSmsResult {
  accepted: boolean;
  /** Twilio message SID (for logging external_id). */
  sid?: string;
  error?: string;
}

export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.info("[sendSms] stub (no TWILIO_* vars):", {
      to: input.to,
      body: input.body.slice(0, 60),
    });
    return { accepted: true, sid: `stub-${Date.now()}` };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const params = new URLSearchParams({
    To: input.to,
    From: fromNumber,
    Body: input.body,
  });

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: params.toString(),
  });

  if (res.ok) {
    const json = (await res.json()) as { sid?: string };
    return { accepted: true, sid: json.sid };
  }

  const body = await res.text().catch(() => "");
  console.error("[sendSms] Twilio error", res.status, body);
  return { accepted: false, error: `Twilio ${res.status}: ${body}` };
}
