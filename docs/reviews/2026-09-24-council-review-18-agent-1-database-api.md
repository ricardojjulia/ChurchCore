# Council Review 18 — Agent 1: Database & API Audit

**Branch:** `feat/e2e-testing-foundation` (draft PR #150), diff-scoped. Checked against source, the Supabase CLI source, and the local DBs (SELECT only; `.env.local` was not opened).

## 1. Hosted-data safety
Safe: `supabase start/status/db reset/db query` default to the local stack even though the repo is linked (`db query` only goes remote with `--linked`/`--db-url`). `setup-e2e.sh` checks all four URLs are local before any write. CI uses dummy secrets.

Holes:
- **H1: blanked provider keys are re-filled.** `tests/e2e/fixtures/env.ts:59`: `loadEnvFiles` skips a variable only when `process.env[key]` is truthy. The empty values that `e2e-local.sh` exports (`SENDGRID_API_KEY=""` and similar) are therefore overwritten from `.env.local`, then passed to `next start` through `playwright.config.ts`. Any real keys there reach the server, so a paid Anthropic call is possible.
- **H2: the local-host guard runs before `.env.local` loads.** `env.ts:205-207`: with `CI` set locally, local derivation is skipped, the check sees nothing, and hosted URLs load afterwards unchecked.
- **H3: the suite can reuse a hosted dev server.** `playwright.config.ts:47`: `reuseExistingServer` lets the suite attach to a `next dev` that reads a hosted `.env.local`. Cron happy paths would then run against it with the real secret, and the unsubscribe happy path would write a suppression row to production. `docs/testing.md` called this setup fine.

## 2. `scripts/backfill-pastoral-encryption.mjs`
- Format and same-key idempotency are correct.
- **The select is unpaginated** (`:83`). PostgREST's `max_rows = 1000` silently truncates it.
- **Lost-update race:** the update filters on `id` only (`:91`), so an edit made between select and update is overwritten.
- **Wrong key:** existing ciphertext gets encrypted a second time. Recovery then needs both keys.
- No dry-run default, no confirmation, and no host/count printout.
- **Misses `church_documents.body`** for elder council notes, which is also encrypted (`operations/actions.ts:60,135`).
- `docs/setup/production-deployment.md` §12 is stale. It says the script doesn't exist and that plaintext is returned as-is, but plaintext of 29 bytes or more throws.
- The local key lives in `node_modules/.cache`, so `npm ci` loses it and the next run encrypts the local seed twice.

## 3. API contract specs
Rejection assertions match the handlers. Gaps:
- **Webhooks fail open when their secret is unset:** the SendGrid, Twilio and Resend adapters return true, and Stripe skips verification (`route.ts:664`). This is untested and dangerous in production.
- Stripe has no timestamp tolerance.
- No valid-signature test exists for any webhook.
- The demo routes' 403 outside demo mode is never tested.
- `/api/reports/custom` 403s are untested.
- `/api/control/*` is not tested as a tenant role.
- The cron happy paths do no real work: no retry-eligible or scheduled seed rows exist.

## 4. `create-dev-users.sh` / control-plane `config.toml`
The precedence fix is correct and minimal. The `[auth.email] enable_signup = true` change is correct: `[auth] enable_signup = false` still blocks sign-ups, and hosted config only changes on `supabase config push`.

## 5. Manifest
All 15 route auth kinds match. The 7 action entries checked all import their module. But one test file per module overstates coverage: `app/app/actions.ts` has 6 of 25 exports referenced, `elders-actions.ts` 2 of 10, and `createPastoralNoteAction` / `createCareAssignmentAction` have no tests at all.

## 6. Ranked
1. H1
2. H3
3. H2
4. Backfill hardening
5. Webhook fail-open
6. Stale docs
7. Module-level coverage overstatement
