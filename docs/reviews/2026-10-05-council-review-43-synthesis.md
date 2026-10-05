Status: AMENDED
Date: 2026-10-05
Branch: feat/resend-live-g5-1 vs main (93e883c)
Related: DEVELOPMENT_PLAN §0 row G5.1 (F2); Gap 5 / M3 ("Resend live"); ADR 0006; factory run docs/factory-runs/2026-10-05-g5-1-resend-live.md
Tags: communications, email, receipts, retry
Surfaces: no new routes or pages. Affected indirectly: POST /api/webhooks/resend, POST /api/webhooks/sendgrid, GET /api/cron/communications-retry, GET /api/cron/communications-scheduled, /app/communications/history, and every sender (queueCommunicationAction, sendWithSuppression, sendEmail)

# Council Review 43 — Synthesis (G5.1: Resend live)

Five separate read-only agents reviewed this branch (Council v2); their reports are in `2026-10-05-council-review-43-agents-1-5.md`.

## Status

**AMENDED**: ready once the fixes below land. The owner decides.

What the branch does:
- **Provider selection.** One `selectEmailProvider()` routes both email paths to Resend when `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are set, otherwise to SendGrid. The two paths are the communications queue and the direct `sendEmail` used by receipts and notices. This implements ADR 0006, which Review 16 found unimplemented.
- **Resend request format.** Resend requests follow the contract verified against Resend's docs today, including `Idempotency-Key`.
- **Error mapping.** Both providers' HTTP statuses map to one shared set of retryable codes.
- **Re-send script.** A one-off script, dry run by default, re-sends the 2 unsent production receipts through the same receipt code. The owner decided on the re-send.

## Fixes required

1. **The retry key differs on every attempt, so a delivered-but-timed-out email can be sent twice** (found by the orchestrator, from Resend's idempotency docs).
   - Resend's docs: a repeat request with the same key after a success returns the original response *without sending again*. A request still in flight returns 409, and retrying later is safe. Keys last 24 hours.
   - The branch uses a random UUID on the first queue send and `comm-log:<id>:attempt:<n>` on each retry. So a send that reached Resend but timed out on our side is sent again on retry under a new key.
   - **Fix:**
     - Generate the log row's id *before* the send, and use `comm-log:<logId>` as the key for the first send and every retry.
     - Insert the log row with that id.
     - Prefix the other keys by kind (`donation:<id>`, `registration-payment:<id>`) so keys from different sources can't collide (A1).
     - Test that the first send and the retry use the same key.
2. **`lib/notifications/send-email.ts` has no `import "server-only"`** (A5, confirmed). Add it.
3. **Operators can't see why a send failed, and Retry is offered when it can't succeed** (A3, confirmed).
   - `listCommunicationLogsAction` (`app/app/communications-actions.ts:888-896`) doesn't select `error_code`, `error_message` or `provider`.
   - The Retry button (`components/application/communications-history-workspace.tsx:252-264`) shows for any failed or bounced row with fewer than 3 retries. The server then refuses with "not eligible" whenever the code isn't transient.
   - This branch introduces clear codes such as `provider_auth_error` and `provider_config_error`, so surfacing them now is worth it.
   - **Fix:**
     - Select `error_code` and `provider`.
     - Compute `isRetryEligible` on the server with `shouldRetryDelivery`.
     - Show Retry only when it is eligible.
     - Show a one-line plain-language reason for a failed row, for example "Email provider rejected the API key: check RESEND_API_KEY" or "Rate limited: will retry automatically".
     - Add tests.

## Consensus

- **Provider selection, error mapping and stub gating are correct** (A1, A4, A5). Every path returns `provider_not_configured` in production without keys.
- **Webhooks and crons are intact and registered** (A2, A5). The Resend webhook still verifies through Svix and fails closed.
- **The re-send script is safe** (A3, A5): dry run by default, counts only, refuses without a provider. The `server-only` stub is used by the script alone.

## Recorded, not fixed

- **No in-app "which provider is active" indicator** (A3). That's Should row S12.
- **The Resend error-type field (`name` or `type`) is unverified.** The code reads both. Only the 409 `invalid_idempotent_request` distinction depends on it.
- **No live Resend call has been made.** That's the owner action below.
- **Email addresses aren't validated on startup** (A1). A malformed `RESEND_FROM_EMAIL` fails at the first send as a non-retryable `invalid_request`, and the error is visible once fix 3 lands.

## Gap 5

The M3 line reads "**Gap 5 closed: Resend live (G5.1)**". "Live" means email actually leaves production. **Gap 5 therefore closes only after the owner configures Resend and one real send is confirmed**, not on merge. A4 said it closes on merge.

New owner action O12:
1. Verify a sending domain in Resend.
2. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in Vercel Production.
3. Register `/api/webhooks/resend` in Resend and set `RESEND_WEBHOOK_SECRET`.
4. Redeploy.
5. Run `node scripts/resend-unsent-receipts.mjs` as a dry run, then with `--apply`.
6. Confirm one delivered email (a `communication_logs` row with `provider = 'resend'` and a delivery event).

## Wrong or unsupported agent claims (7)

1. **A1** reviewed "G5.1 migrations … add nullable columns and new tables". This branch has no migration.
2. **A1** marked the per-attempt retry key "✓ PASS idempotent". Resend's documented semantics make it the duplicate-send path (fix 1).
3. **A2:** "/app/member — No page.tsx; redirects". `app/app/[role]/page.tsx` serves it.
4. **A4:** "run `npm run provision:resend-receipts --apply`". No such script exists; the command is `node scripts/resend-unsent-receipts.mjs [--apply]`. A4 also reused "O11", which is already the G3.3b migration action.
5. **A4:** "Gap 5 is closed on merge". The plan says "Resend live".
6. **A4:** "50% cost savings vs. SendGrid" and "PCO has no native email send". Both are unsourced.
7. **A5** listed the Resend webhook's Svix verification as an UNVERIFIED risk and implied it changed. It isn't changed on this branch, and Svix is the scheme Resend documents (ADR 0006).

## Score

**Readiness 87/100** on merge, up from 86: G5.1's code is done and both email paths reach a real provider. It reaches **88** once O12 confirms a live send and Gap 5 closes. A4's 88–89 counted Gap 5 as closed on merge.

## Prompt A — Council Review 43 fixes

**Files:**
- `lib/notifications/queue-communication.ts`
- `lib/communications/retry-eligible.ts`
- `lib/stripe/donation-completion.ts`
- `lib/stripe/registration-receipt.ts`
- `lib/stripe/recurring-webhooks.ts`
- `lib/notifications/send-email.ts`
- `app/app/communications-actions.ts`
- `lib/communications-types.ts`
- `components/application/communications-history-workspace.tsx`
- the tests for each

**Work:** fixes 1–3 above.

**Verification:**
- `npx vitest run`
- lint, `tsc`, `test:surfaces`, build
- `npm run test:e2e:local -- tests/e2e/api-cron.spec.ts tests/e2e/api-webhooks.spec.ts`, plus the communications history spec if one exists

## Definition of done

- [x] Unit tests pass: `npx vitest run` 206 files / 2,544 tests (orchestrator, after `a961d21`)
- [x] Surfaces: `npm run test:surfaces` OK (orchestrator)
- [x] Lint: 0 errors, 1 pre-existing warning (orchestrator)
- [x] Types: `npx tsc --noEmit` clean (orchestrator)
- [x] Build succeeds: compiled (orchestrator)
- [ ] E2E: touched specs pass locally (builder: `api-cron`, `api-webhooks`, `church-admin-readiness`, 45 passed; re-send script dry run counted 2, sent nothing); CI `verify` and 4 `e2e` shards: pending PR
- [x] Migration: none on this branch
- [ ] Commits verified on GitHub: pending PR (no push yet)
- [ ] GitHub review comments read, fixed or answered, threads resolved: pending PR
- [x] Documenter close-out committed, including owner action O12 (plan row O12, CHANGELOG, README, runbook, factory-run note, memory)
