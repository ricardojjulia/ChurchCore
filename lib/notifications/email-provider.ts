/**
 * The refusal `sendEmail` returns when no email provider is configured and
 * stubs aren't allowed (production without SendGrid keys). Callers treat it as
 * "cannot send yet", not a transient failure: they release their claim, log,
 * leave the sent marker unset and do not retry (Council Review 42).
 * Kept apart from `send-email.ts` so callers can import it without the sender.
 */
export const EMAIL_PROVIDER_NOT_CONFIGURED = "provider_not_configured";

export function isProviderNotConfigured(result: { accepted: boolean; error?: string }): boolean {
  return !result.accepted && result.error === EMAIL_PROVIDER_NOT_CONFIGURED;
}

/** Thrown by `sendDonationReceipt` so its caller can tell "not configured" from a real refusal. */
export class EmailProviderNotConfiguredError extends Error {
  constructor() {
    super(`Receipt email not sent: ${EMAIL_PROVIDER_NOT_CONFIGURED}`);
    this.name = "EmailProviderNotConfiguredError";
  }
}
