# Factory run: G5.1 — Resend live and provider error codes (F2) (2026-10-05)

**Plan row:** `DEVELOPMENT_PLAN.md` §0 G5.1 (Must, 1 day, M3).
**Branch:** `feat/resend-live-g5-1`.
**Story and brief:** approved by the owner on 2026-10-05.

## Context (from source)
- ADR 0006 makes Resend the primary email provider, with SendGrid as the fallback. Council Review 16 found the code never selects Resend:
  - `lib/notifications/queue-communication.ts` always calls `sendgridAdapter` (around line 115).
  - `resendAdapter` (`lib/communications/resend-adapter.ts`) is used only by its own webhook route.
- `lib/notifications/send-email.ts` is a second, SendGrid-only direct path. It is used by:
  - donation receipts (`lib/stripe/donation-completion.ts`);
  - registration receipts (`lib/stripe/registration-receipt.ts`);
  - recurring-gift failure notices (`lib/stripe/recurring-webhooks.ts`).

  It sends `idempotencyKey` as an `X-Twilio-Email-Event-Webhook-Signature` header, which is wrong (Review 40 follow-up).
- `resendAdapter` maps every failure to `resend_<status>`, which the retry cron never treats as transient.
- Stubs: both adapters and `sendEmail` return `provider_not_configured` when `stubsAllowed()` is false (Council Reviews 23 and 42). The three receipt callers treat that as "leave unsent, don't throw".
- Transient codes: `timeout`, `rate_limited`, `provider_unavailable`, `network_error` and `temporary_failure`. They live in both `lib/communications/provider-adapter.ts` and `lib/communications/retry-eligible.ts`, and the two lists match today.
- Production (2026-10-05): 2 succeeded donations have `receipt_sent_at` null and a donor email; 0 registration receipts are unsent.

## Resend contract (verified against resend.com/docs, 2026-10-05)

**Request**
- `POST https://api.resend.com/emails`
- Headers:
  - `Authorization: Bearer <RESEND_API_KEY>`
  - `Content-Type: application/json`
  - optional `Idempotency-Key`: 1–256 characters, unique per request, expires after 24 hours
- Body:
  - required: `from` (`"Name <email>"` allowed), `to` (string or array, max 50), `subject`
  - optional: `html`, `text`, `reply_to`, `headers`, `tags`
- Success: `{ "id": "<uuid>" }`

**Error statuses and types**

| Status | Types |
|---|---|
| 400 | `invalid_idempotency_key`, `validation_error` |
| 401 | `missing_api_key`, `restricted_api_key` |
| 403 | `invalid_permission`, `restricted_api_key`, `suspended_api_key`, `validation_error` (unverified domain) |
| 404 | `not_found` |
| 405 | `method_not_allowed` |
| 409 | `concurrent_idempotent_requests`, `invalid_idempotent_request`, `resource_locked` |
| 422 | `invalid_attachment`, `invalid_parameter`, `missing_required_field`, `missing_required_parameter` |
| 429 | `daily_quota_exceeded`, `monthly_quota_exceeded`, `rate_limit_exceeded` |
| 500 | `application_error` |
| 503 | `service_unavailable` |

**Unverified:** the JSON field that carries the error type. The SDKs use `name`; read `name`, then fall back to `type`.

## Acceptance criteria
1. **Provider selection.** One `selectEmailProvider()` (or equivalent) chooses Resend when `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are both set, else SendGrid when its keys are set, else "not configured". Both email paths use it:
   - the communications queue;
   - the direct `sendEmail`.
2. **Request shape.** Resend sends match the contract above, including an `Idempotency-Key` built from the caller's stable id (log id, donation id, payment id). The bogus SendGrid "idempotency" header is removed.
3. **Error mapping.** Resend and SendGrid outcomes map to the shared codes:

   | Outcome | Code | Retried? |
   |---|---|---|
   | 429 | `rate_limited` | yes |
   | 500, 502 | `provider_unavailable` | yes |
   | 503 | `provider_unavailable` | yes |
   | network failure or abort | `network_error` | yes |
   | timeout | `timeout` | yes |
   | 409 in-flight idempotent request | `temporary_failure` | yes |
   | 400, 422 | `invalid_request` | no |
   | 401, 403 | `provider_auth_error` | no |
   | 404, 405 | `provider_config_error` | no |

   - The provider's error message is kept for logs; no PII is added.
   - Transient codes stay in one shared constant used by both `provider-adapter.ts` and `retry-eligible.ts`, so the lists can't drift.
4. **Provider recorded.** The provider used is recorded on the communication log row (`provider` column) and returned with the provider message id, so the right delivery webhook (Resend through Svix, or SendGrid) matches it.
5. **Stubs.** The existing `stubsAllowed()` / `provider_not_configured` behaviour is unchanged on every path.
6. **One-off receipt re-send script.** `scripts/resend-unsent-receipts.*` (owner decision: re-send once on deploy):
   - Re-sends receipts for succeeded donations with `receipt_sent_at` null and an email, through the same receipt code and claim/lease, so it's idempotent.
   - Dry run by default. `--apply` writes.
   - Prints the target host and counts only (no emails or names).
   - Refuses to run if no provider is configured.
7. **Docs.** ADR 0006 is updated: the "not implemented" note is resolved by F2/G5.1. `.env.example` and the comms runbook say which env selects which provider.
8. **Tests.**
   - Adapter request bodies checked against the documented example.
   - Every status mapping, for Resend and SendGrid.
   - Provider selection, for both paths.
   - The idempotency header present and correctly sourced.
   - The retry cron picks up `rate_limited` / `provider_unavailable` rows and skips the non-transient ones.
   - The script's dry run versus `--apply`, with mocks.
