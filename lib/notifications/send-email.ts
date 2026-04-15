/**
 * sendEmail — wraps SendGrid Mail Send API.
 *
 * Requires env vars:
 *   SENDGRID_API_KEY   — SendGrid API key (sg.…)
 *   SENDGRID_FROM_EMAIL — verified sender address
 *
 * When the env vars are absent (local dev without SendGrid),
 * the message is logged to the console and the function returns
 * a stub result so callers do not blow up.
 */

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  /** Plain-text fallback (required by SendGrid for deliverability). */
  text: string;
  /** Optional HTML body. */
  html?: string;
  /** Caller-supplied idempotency key (e.g. communication_logs row id). */
  idempotencyKey?: string;
}

export interface SendEmailResult {
  /** True when the message was accepted by the provider. */
  accepted: boolean;
  /** SendGrid X-Message-Id header value (for logging external_id). */
  messageId?: string;
  error?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    // Local-dev stub — log to console, treat as accepted
    console.info("[sendEmail] stub (no SENDGRID_API_KEY):", {
      to: input.to,
      subject: input.subject,
    });
    return { accepted: true, messageId: `stub-${Date.now()}` };
  }

  const toList = Array.isArray(input.to) ? input.to : [input.to];

  const payload = {
    personalizations: [{ to: toList.map((email) => ({ email })) }],
    from: { email: fromEmail },
    subject: input.subject,
    content: [
      { type: "text/plain", value: input.text },
      ...(input.html ? [{ type: "text/html", value: input.html }] : []),
    ],
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (input.idempotencyKey) {
    headers["X-Twilio-Email-Event-Webhook-Signature"] = input.idempotencyKey;
  }

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    const messageId = res.headers.get("X-Message-Id") ?? undefined;
    return { accepted: true, messageId };
  }

  const body = await res.text().catch(() => "");
  console.error("[sendEmail] SendGrid error", res.status, body);
  return { accepted: false, error: `SendGrid ${res.status}: ${body}` };
}
