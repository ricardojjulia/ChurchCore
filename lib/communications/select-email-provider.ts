import type { ProviderAdapter } from "@/lib/communications/provider-adapter";
import { resendAdapter } from "@/lib/communications/resend-adapter";
import { sendgridAdapter } from "@/lib/communications/sendgrid-adapter";

export type EmailProviderSelection = {
  provider: "resend" | "sendgrid";
  adapter: ProviderAdapter;
  /**
   * False when neither provider has its keys. The adapter is then Resend (the
   * primary, ADR 0006) and its own stub / `provider_not_configured` logic
   * applies, so production never fakes a send (Council Review 23).
   */
  configured: boolean;
};

/**
 * Chooses the email provider for every email path (the communications queue
 * and the direct `sendEmail`): Resend when `RESEND_API_KEY` and
 * `RESEND_FROM_EMAIL` are both set, else SendGrid when `SENDGRID_API_KEY` and
 * `SENDGRID_FROM_EMAIL` are both set, else not configured (ADR 0006, G5.1).
 * Reads the environment on each call.
 */
export function selectEmailProvider(): EmailProviderSelection {
  if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
    return { provider: "resend", adapter: resendAdapter, configured: true };
  }
  if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) {
    return { provider: "sendgrid", adapter: sendgridAdapter, configured: true };
  }
  return { provider: "resend", adapter: resendAdapter, configured: false };
}
