/**
 * When a missing provider key may be stubbed instead of failing.
 *
 * Stubs keep local development and the demo working without real Stripe,
 * SendGrid, Twilio or Resend keys. In production they would report money
 * received or messages delivered that never were (Council Reviews 22 and 23),
 * so they're allowed only outside production, or in demo mode.
 */
export function stubsAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}
