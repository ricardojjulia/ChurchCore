# ADR 0006: Email Provider Resend

- Status: Accepted
- Date: 2026-06-01
- Deciders: Ricardo Julia

## Context

ChurchCore used SendGrid since Phase 6. SendGrid (now Twilio SendGrid) has friction for small-team integrations: verification requires domain setup via Twilio console, webhook signing uses custom HMAC, and API key management is nested under the Twilio hierarchy.

Resend is purpose-built for transactional email from code. It offers simpler domain verification, a cleaner REST API, and uses Svix for webhook signing — the same standard used by Stripe.

## Decision

Resend is the primary email provider. SendGrid remains as a documented fallback — no SendGrid code is removed.

Active provider is selected by the presence of both `RESEND_API_KEY` and `RESEND_FROM_EMAIL`. If either is absent, the system falls back to SendGrid when both `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` are set. If both are absent, stub mode is used (safe for local development).

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

## Implementation status

**Resolved by F2 / G5.1 (2026-10-05).** `selectEmailProvider()` (`lib/communications/select-email-provider.ts`) now implements the Decision as written (with the From address required alongside the key), and both email paths use it: `queueCommunicationAction` and the direct `sendEmail()`. The provider used is recorded on `communication_logs.provider`. Resend sends follow its API contract (`POST /emails`, `Idempotency-Key` header), and Resend and SendGrid failures map to one set of error codes (`rate_limited`, `provider_unavailable`, `network_error`, `timeout`, `temporary_failure` are retried; `invalid_request`, `provider_auth_error`, `provider_config_error` are not).

*History (2026-09-23).* Council Review 16 (`docs/reviews/2026-09-23-council-review-16-synthesis.md`, Agent 4) had found the code did not implement this decision: the queue always sent through the SendGrid adapter and `resendAdapter` was used only by its own webhook route.
