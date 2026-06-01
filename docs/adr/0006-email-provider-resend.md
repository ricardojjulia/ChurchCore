# ADR 0006: Email Provider Resend

- Status: Accepted
- Date: 2026-06-01
- Deciders: Ricardo Julia

## Context

ChurchCore used SendGrid since Phase 6. SendGrid (now Twilio SendGrid) has friction for small-team integrations: verification requires domain setup via Twilio console, webhook signing uses custom HMAC, and API key management is nested under the Twilio hierarchy.

Resend is purpose-built for transactional email from code. It offers simpler domain verification, a cleaner REST API, and uses Svix for webhook signing — the same standard used by Stripe.

## Decision

Resend is the primary email provider. SendGrid remains as a documented fallback — no SendGrid code is removed.

Active provider is selected by the presence of `RESEND_API_KEY`. If absent, the system falls back to `SENDGRID_API_KEY`. If both are absent, stub mode is used (safe for local development).

A new `resendAdapter` is added to `lib/communications/resend-adapter.ts` following the existing `ProviderAdapter` interface. A new webhook route is added at `/api/webhooks/resend`. The `svix` npm package is introduced for webhook signature verification.

## Consequences

- New env vars required in production: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`.
- New webhook route `/api/webhooks/resend` must be registered in the Resend dashboard.
- SendGrid webhook and adapter remain functional and are not removed.
- The `svix` npm package is added as a production dependency.
- `UNSUBSCRIBE_SECRET` is introduced to sign and verify self-service unsubscribe links.

## Alternatives Considered

### Postmark

Rejected — pricing tier is less favorable at scale for the church-SaaS model.

### Mailgun

Rejected — API ergonomics are inferior for Next.js fetch-native usage; webhook signing is a custom HMAC scheme that does not align with existing provider patterns.
