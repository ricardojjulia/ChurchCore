# Factory Run: Slice 3 Communications Provider Lifecycle Hardening

Date: 2026-05-28

## Intent

Execute Slice 3 from the 30-day competitive readiness plan by hardening communications provider lifecycle behavior for retry, suppression, webhook consistency, and operator triage visibility.

## Architecture Impact

- Normalized retry eligibility in `lib/communications/provider-adapter.ts` so retries are limited to transient `failed` sends with recognized transient error codes.
- Extended webhook event application in `lib/communications/webhook-events.ts` to:
  - map provider statuses (`bounced`, `suppressed`, `unsubscribed`) into deterministic suppression reasons,
  - persist suppression records consistently via `communication_suppressions`,
  - write consent log evidence (`communication_suppression`) when recipient profiles are resolved,
  - update communication log suppression metadata (`suppressed_at`, `suppression_reason`) for provider-origin suppression states.
- Added unresolved delivery-lane cue in `components/application/communications-hub.tsx` for operational triage of failed/bounced/suppressed/unsubscribed records and immediate retryability signal.

## Test Coverage Added

- Added `lib/communications/webhook-events.test.ts` for webhook-driven suppression + consent sync and delivered-path non-suppression behavior.
- Updated `lib/communications/provider-adapter.test.ts` coverage to assert queued/scheduled/sending statuses are not retryable.

## Verification Commands

Executed and passed:

- `npm run test -- lib/communications/provider-adapter.test.ts lib/communications/send-with-suppression.test.ts lib/communications/webhook-events.test.ts app/app/communications-actions.test.ts app/api/webhooks/communications-webhook-flow.test.ts`
- `npm run lint`
- `npm run build`

## Residual Risk

- Webhook suppression synchronization depends on provider-recipient contact normalization quality from adapters; malformed provider payload contacts remain a potential edge case.
- Retry policy intentionally excludes queued/scheduled/sending manual retries; if operational policy changes, this should be revisited with explicit product approval.
