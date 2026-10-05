import "server-only";

/**
 * sendEmail — the direct email path (receipts and notices that don't go
 * through the communications queue).
 *
 * The provider is chosen by `selectEmailProvider()`, the same selection the
 * queue uses: Resend when RESEND_API_KEY and RESEND_FROM_EMAIL are set, else
 * SendGrid when SENDGRID_API_KEY and SENDGRID_FROM_EMAIL are set.
 *
 * When neither is configured and stubs are allowed (local dev, demo), the
 * message is logged and a stub success is returned. In production the send is
 * refused with `provider_not_configured`, never faked as delivered.
 *
 * `idempotencyKey` is sent as Resend's `Idempotency-Key` header; SendGrid has
 * no such header, so it is not sent there.
 */

import type { CommunicationProvider } from "@/lib/communications/provider-adapter";
import { selectEmailProvider } from "@/lib/communications/select-email-provider";
import { EMAIL_PROVIDER_NOT_CONFIGURED } from "@/lib/notifications/email-provider";
import { stubsAllowed } from "@/lib/stub-mode";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  /** Plain-text fallback (required for deliverability). */
  text: string;
  /** Optional HTML body. */
  html?: string;
  /** Caller-supplied stable id (donation id, payment id) for provider-side deduplication. */
  idempotencyKey?: string;
}

export interface SendEmailResult {
  /** True when the message was accepted by the provider. */
  accepted: boolean;
  /** The provider's message id (for logging external_id). */
  messageId?: string;
  error?: string;
  /** Shared provider error code (e.g. "rate_limited"), when the provider refused. */
  errorCode?: string;
  /** Which provider handled the send. */
  provider?: CommunicationProvider;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const selected = selectEmailProvider();

  if (!selected.configured) {
    if (!stubsAllowed()) return { accepted: false, error: EMAIL_PROVIDER_NOT_CONFIGURED };
    // Local-dev stub — log to console, treat as accepted
    console.info("[sendEmail] stub (no email provider keys):", {
      to: input.to,
      subject: input.subject,
    });
    return { accepted: true, messageId: `stub-${Date.now()}` };
  }

  const recipients = Array.isArray(input.to) ? input.to : [input.to];
  let messageId: string | undefined;

  // The adapters send to one address; each recipient gets its own request and
  // its own idempotency key.
  for (const [index, to] of recipients.entries()) {
    const result = await selected.adapter.send({
      to,
      subject: input.subject,
      body: input.text,
      html: input.html,
      idempotencyKey:
        input.idempotencyKey && recipients.length > 1
          ? `${input.idempotencyKey}:${index}`
          : input.idempotencyKey,
    });
    if (!result.accepted) {
      console.error("[sendEmail] provider error", selected.provider, result.errorCode, result.errorMessage);
      return {
        accepted: false,
        error: result.errorMessage ?? "Email provider refused the message.",
        errorCode: result.errorCode,
        provider: selected.provider,
      };
    }
    messageId ??= result.providerMessageId;
  }

  return { accepted: true, messageId, provider: selected.provider };
}
