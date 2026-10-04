Status: AMENDED

# Council Review 40 — Synthesis (G3.3 year-end giving statements)

**Branch:** `feat/giving-statements-g3-3` vs `main`, commit `60d912b`. This is a diff-scoped round run under Council v2: five separate read-only audit agents, then the Documenter. The reports are in `2026-10-04-council-review-40-agents-1-5.md`.

The story, the brief and the owner's decisions are in `docs/factory-runs/2026-10-04-g3-3-giving-statements.md`. Before the Council ran, the branch had already been through the factory's own validator, which found two High issues (anonymous attribution in the staff preview). Both were fixed, and the fix follows the owner's decision of 2026-10-04 that **anonymity holds against staff end to end**.

## Status

**AMENDED** — ready once the fixes below land. The status is the Council's recommendation; the owner decides.

What the branch delivers:
- **Statements:** per-donor statements for a church-local date range (by default, last calendar year). They include succeeded gifts only, with per-fund subtotals and the no-goods-or-services sentence.
- **Admin tools:**
  - a preview showing who will be emailed and, for anyone skipped, why;
  - named-gift PDFs;
  - an idempotent batch email whose body is the statement.
- **Duplicate protection:** claim-before-send under a partial unique index (migration `20261005000000`).
- **Member download:** a member downloads their own full statement, including their own anonymous gifts.

These have been verified:
- the end-to-end journey against local Supabase, including a second send adding no emails;
- the migration applying to a fresh reset database;
- 2,401 unit tests;
- lint, the build and `test:surfaces`.

## Fixes required (to land before merge)

1. **Statement send records name the recipient to staff** (found by the orchestrator while checking Agent 5's anonymity analysis; High).
   - `lib/giving-statements/send.ts:65` writes `recipient_id = statement.profileId`. The Communications history loads `recipient:profiles!recipient_id(full_name)` (`lib/communications-data.ts:240`), and pastors and secretaries can read it.
   - That exposes (a) every anonymous-only donor, who is absent from the named preview but present in the log, and (b) every named donor to pastors and secretaries, who have no access to giving.
   - **Fix:** write `recipient_id: null` on statement rows, with a test.
   - Nothing depends on it:
     - consent and the unsubscribe link use the separate `recipientProfileId` parameter;
     - delivery webhooks match rows by provider message id, and a bounce still suppresses the address;
     - statement rows are never retried (the codes are not transient).
   - Accepted cost: a bounce or complaint on a statement adds no per-profile `consent_logs` entry (`lib/communications/webhook-events.ts:182,280`). The suppression itself is still recorded.
2. **Line breaks in the subject** (A5, downgraded from High; see the wrong claims below). The subject is built from `church.name`, so strip CR and LF from it. This is defence in depth.
3. **Rollback is not stated in the migration** (A1). Add the line `drop index if exists public.communication_logs_statement_claim_uidx;` to the migration's comment, as Phase 3 item 4 requires.
4. **Unbounded statement range** (A5, Low). Reject ranges longer than 10 years, with a test.
5. **Silent stale-claim takeover** (A5, Medium → Low). Log a warning when a stale `sending` claim is released, so a takeover is visible.
   - The 15-minute threshold stays. A batch runs at most 60 s (`maxDuration`, with a 40 s budget), so a live claim can't reach 15 minutes. Clock skew of that size isn't a realistic threat.

## Cross-agent consensus

- **Tenancy and authorization hold** (A1, A2, A5):
  - every admin-client query is church-scoped;
  - both actions and both routes gate themselves;
  - the member route accepts no donor id;
  - `churchProfileId` and `userId` are used correctly.
- **Claim-before-send is race-safe** (A1, A5). The partial index is the lock. Failed rows use non-transient codes, so neither the retry cron nor the manual retry picks them up. The orchestrator checked manual retry too: `shouldRetryDelivery` requires a transient code.
- **The surfaces are wired and registered** (A2, A4). The manifest matches the real gates.

## Recorded and not fixed (accepted or follow-up)

- **A1:**
  - No cron proactively fails abandoned `sending` claims. They are released lazily on the next claim for that donor and range. Accepted.
  - No live test of two concurrent batches. The unique index enforces this, and the e2e test covers a second send.
- **A3:**
  - Email HTML uses inline hex colours. Email clients can't read the app's CSS variables, and ADR 0026 governs the app UI. Accepted.
  - Most panel and member-card copy is hard-coded English, like the neighbouring giving panels. Only the tab label is keyed. Tracked with Should row S13's i18n sweep.
- **A5:**
  - Member downloads aren't audited (by design: it's the member's own data).
  - `error_message` keeps 300 characters of provider text. That is the existing pattern.
- **Out of scope, pre-existing:** `lib/notifications/send-email.ts` sends `idempotencyKey` as an `X-Twilio-Email-Event-Webhook-Signature` header, which SendGrid ignores.

## Wrong or unsupported agent claims (7)

1. **A5, "email header injection via church name, High (a Bcc can be injected)".** Both providers take the subject as a JSON field over HTTPS (`lib/communications/sendgrid-adapter.ts:91-94`, `resend-adapter.ts:39,54`), not as raw SMTP headers, so a CRLF can't add a header. It is kept only as defence in depth (fix 2).
2. **A5, "no test of stale-claim detection, of the idempotency key, or of concurrent claims".** `send.test.ts` covers stale claims with an injected clock, a second run emailing nobody, a different range being a separate send, and key shape. Only a live two-process race is untested.
3. **A3, "a server error in `listStatementYears` could crash the member page".** It is caught, logged and falls back to `[]` (`app/app/member/giving/page.tsx`, added in the validator round). A test covers it.
4. **A3, "no unit test for `sanitizeWinAnsi()` edge cases".** `lib/giving-statements/pdf.test.ts:47-51` tests accents, ñ, euro, curly quotes, emoji and CJK.
5. **A1, "consent skips occur at send time, after the claim, so opted-out donors are claimed".** Preview-time decisions skip before claiming (`send.ts:133` returns before the claim at `:141`). Only the send-time re-check inside `sendWithSuppression` runs after a claim.
6. **A2, "the page gate ensures only members reach `/api/member/giving-statement`".** The route serves any session with a church profile, by owner decision (staff give too). It returns only that person's own gifts.
7. **A4:**
   - "staff screens show 'Anonymous'". Since the validator round, anonymous-only donors have no staff row; anonymous gifts are one unattributed aggregate line.
   - "per-gift receipts moved to G3.3b". G3.3b is ChurchCore's receipt for *paid event registrations*. Per-gift donation receipts already exist (`lib/stripe/donation-completion.ts`).
   - Its competitor table states no verified facts about Planning Center, Breeze or Tithe.ly; it is unsupported.

## ADRs

None. The claim-before-send pattern and the anonymity rule are feature-local. The rule is recorded in the factory-run notes, and the Documenter should add it to `docs/security-role-access-matrix.md` or the giving docs if a staff-facing anonymity rule is documented there.

## Score

**MVP readiness: 84/100** (from 82).
- G3.3, a 2-day Must row, is done, with its journey in CI.
- **Gap 3 isn't closed until G3.3b** (the registration receipt, split out by the owner, ~0.5 day) lands. M3 also needs S11, G5.1 and T1a.
- A4's 84–85 is adopted at the low end, because it overstated what Gap 3's definition of done covers.

## Prompt A — Council Review 40 fixes

**Files:**
- `lib/giving-statements/send.ts` and `send.test.ts`
- `lib/giving-statements/email.ts` and `email.test.ts`
- `lib/giving-statements/build.ts` and `build.test.ts`
- `supabase/migrations/20261005000000_giving_statement_claims.sql`

**Work:**
1. Statement claim rows: `recipient_id: null`. Add a test asserting the inserted row has no recipient, while `sendWithSuppression` still receives `recipientProfileId`.
2. In `renderStatementEmail`, strip `\r` and `\n` from the subject. Add a test.
3. `resolveStatementRange` rejects a range longer than 10 years. Add a test.
4. `console.warn` when a stale claim is released (without donor PII: the key's hashed donor ref only).
5. Add a rollback line to the migration comment.

**Verification:**
- `npx vitest run`
- `npm run lint`
- `npm run build`
- `npm run test:surfaces`
- `npm run lint:migrations`
- the giving-statements e2e spec
