# Factory run: G3.3 — Year-end giving statements (2026-10-04)

**Plan row:** `DEVELOPMENT_PLAN.md` §0, G3.3 (Must, 2 days, milestone M3 Oct 23). Branch `feat/giving-statements-g3-3`.

## Owner decisions (2026-10-04)

- **Delivery:** the email body *is* the statement (church header, itemized gifts, totals, tax wording), HTML and plain text, through the existing queue and suppression path. No attachments. The PDF is downloadable in-app.
- **PDF:** `pdf-lib`, standard fonts, generated in a server-side route handler.
- **Anonymous gifts:** included on the donor's *own* statement, PDF and email. Staff-facing lists show "Anonymous" and never name an anonymous giver.
- **Split:** ChurchCore's own receipt for paid event registrations moves to a new row, G3.3b (~0.5 day, M3).
- **Story approved** with these answers to its open questions:
  1. The gift date is `donations.created_at`, read as a church-local date. `completed_at` is a processing marker, written last by G3.2, and missing on imported history.
  2. One fixed tax sentence: "No goods or services were provided in exchange for these contributions." Per-church wording is later work.
  3. A guest's gifts are not merged into a member profile by email.
  4. Both `notification_preferences.email_opt_in` and `communication_suppressions` are honored.
  5. Standard fonts (WinAnsi) cover Spanish accents and ñ. Anything outside that set is replaced, never a crash, and is tested.
  6. A batch is processed in chunks, with no hard cap.
  7. There is one currency per church. If mixed currencies ever appear, subtotals are shown per currency.
  8. Access uses the existing church-admin giving gate, verified in code.
- **No migration.** IRS Pub 1771 doesn't require an EIN on an acknowledgment.

## Research corrections (checked against source)

- Consent includes `notification_preferences.email_opt_in` (`20260418000000_communications_phase6.sql`, default true), not only suppressions.
- `churches` has `legal_name`, `mailing_address`, `contact_email`, `contact_phone` and `website_url` (`20260506000000_church_settings_profile.sql`).
- Registration fees live in `event_registration_payments`, not `donations`. The webhook's `completeDonation` call is keyed by PaymentIntent and finds no donation for a registration, so registration fees never reach a statement.
- The email path has no attachment support today.
- The member giving page hides a donor's own anonymous gifts (`lib/donations-data.ts:91,111`).

## Approved story

As a church admin, I want to generate per-donor giving statements for a date range, download each as a PDF, and email them to donors who can be emailed. As a member, I want to download my own statement for a calendar year. Donors then have the written acknowledgment they need for taxes, and the church doesn't compile it by hand.

**Out of scope:**
- G3.3b registration receipts
- attachments, a new email provider, SMS
- EIN storage
- pledges, non-cash gifts, per-gift receipts
- a donor-facing statement history or a scheduled send
- multi-currency conversion
- re-sending after the church corrects a gift

### Acceptance criteria

**What counts**
1. The default range is the last calendar year in the church's timezone. An admin can choose a custom start and end date.
2. A gift is included only if its status is `succeeded` and its church-local date (from `created_at`) falls inside the range. Both end dates are inclusive. A gift at 11:30 pm church time on Dec 31 counts in that year even when its UTC date is Jan 1.
3. Refunded, failed, pending and cancelled gifts are excluded from every total, list, PDF and email.
4. Recurring installments are treated like any other succeeded gift.

**Grouping and totals**
5. Gifts are grouped by donor profile. A gift with no profile is grouped by its normalized donor email (trimmed, case-insensitive).
6. A gift with neither a profile nor an email is never dropped silently. The admin sees it in an "un-statementable gifts" list showing date, amount and fund, with the donor as "Anonymous" or "No donor information". It gets no PDF or email.
7. Each statement shows per-fund subtotals and a grand total, exact in cents. A gift with no fund appears under "Unassigned".

**Statement content (PDF and email)**
8. Each statement shows:
   - the church header: name, legal name if set, mailing address, contact email and phone;
   - the donor's name and the date range;
   - an itemized list of gifts: church-local date, fund, amount;
   - the per-fund subtotals and the grand total.
9. Each statement includes the fixed tax sentence.
10. Statements never invent a tax ID.
11. The email carries the same content as the PDF, as HTML and plain text, with no attachment.

**Anonymous gifts**
12. A donor's own statement, PDF and email include their own anonymous gifts. This covers the member download, the admin PDF for that donor, and the batch email.
13. Staff-facing lists in the admin UI (the preview and the un-statementable list) never show an anonymous giver's name or email. They show "Anonymous", and the gift still counts in the totals.

**Admin preview**
14. The preview shows the donor count, the grand total, and one row per donor with a gift count and total.
15. Each row says whether the donor will be emailed. If not, it gives one reason: opted out, email suppressed (with the reason in words), or no email on file.
16. The preview changes nothing and sends nothing.

**Admin PDF download**
17. An admin can download any donor's PDF for the range, including donors who won't be emailed.

**Batch send and consent**
18. Sending requires an explicit confirmation that shows how many will be emailed and how many skipped.
19. A donor is emailed only if they are not opted out and their email is not suppressed. A guest has only the suppression check. A donor with no email is skipped.
20. A skipped donor is recorded with the reason. The run ends with sent, skipped and failed counts.
21. Sends go through the existing queue and suppression path. A provider failure is retryable and doesn't abort the batch.
22. Sends are idempotent per donor and range. A re-run, a double-click or a retry never emails a donor a second time when they already have a sent or queued email. Donors who failed or weren't reached are sent on the re-run.
23. A different range for the same donor is a separate send.

**Audit**
24. A batch send is audited with the actor, church, range and sent/skipped counts. No per-donor emails or amounts are recorded.
25. Each admin PDF download is audited with the actor, the donor reference and the range.

**Member self-service**
26. On `/app/member/giving` a member chooses a calendar year (default: last year) and downloads their own PDF.
27. The member's statement contains only gifts whose `profile_id` is the session's church profile id, including their own anonymous gifts.
28. The member route accepts no donor identifier.

**Empty and invalid input**
29. If nothing qualifies, the admin sees "No statements for this range" with send disabled. The member sees "No gifts recorded for [year]", and no empty PDF is offered.
30. An invalid range shows an error and generates nothing.

**Authorization and tenancy**
31. Preview, admin PDF and send are allowed only through the church-admin giving gate. Every other role, and signed-out callers, are denied.
32. Everything is scoped to the session's church. An id from another church yields not-found or denied, never data.
33. Member download is allowed for any signed-in member of the church and returns only their own data.

### Test expectations

- **Unit tests** for:
  - inclusion rules and church-local boundaries;
  - grouping;
  - totals;
  - consent decisions;
  - idempotency keys;
  - anonymous masking;
  - the PDF: valid output, header, tax wording, multi-page, replaced characters.
- **Manifest and role/tenant tests:**
  - every new surface registered in `tests/coverage-manifest.json`;
  - role and tenant denial tests.
- **E2E journey:** seed a member, a guest, an anonymous gift, an opted-out donor, a suppressed donor and a refunded gift, then:
  - the admin previews, checks the reasons, sends, and sees the summary;
  - a second send adds no emails;
  - the admin downloads a PDF;
  - the member downloads their own PDF, which includes their anonymous gift;
  - the audit entries exist.

## Approved technical brief (2026-10-04)

The brief was written by spec-writer and checked against source by the orchestrator. Owner amendments are marked **[A]**.

### Findings from the source
- `queueCommunicationAction` and `communication_logs` have no idempotency key, so nothing in the existing path deduplicates a send.
- The retry cron re-sends `failed` rows with a transient `error_code`, rebuilding them from a truncated text-only `body_preview` (`lib/communications/retry-eligible.ts`). A statement row must never carry a transient code.
- `createTenantAdminClient()` is not tenant-scoped. Every query must carry `.eq("church_id", churchId)`.
- The church-admin giving gate is `roleId === "church-admin"` (`app/app/church-admin/giving/page.tsx:22`).
- `session.appContext.church` has only id, name, slug and timezone. The header fields are read from `churches`.
- `communication_logs.segment_criteria` (jsonb) already exists.

### Modules
All modules except `build.ts` are `import "server-only"`. Only the action file and the route handlers authenticate their own caller.

- **`lib/giving-statements/build.ts`** (pure functions):
  - `resolveStatementRange` (default: last calendar year in the church zone; validated)
  - `giftLocalDate`, `normalizeEmail`, `donorKey` (`p:<profileId>` or `e:<email>`)
  - `buildStatements`, which returns `{ statements, unstatementable }`
  - `maskForStaff`
  - `idempotencyKey`, giving `giving-statement:v1:<church>:<donorKey>:<start>:<end>`
  - the `TAX_SENTENCE` constant
- **`lib/giving-statements/consent.ts`**:
  - `decideEmail`, a pure function that returns `no_email`, `opted_out` or `suppressed`
  - `resolveConsent`, which batch-reads `notification_preferences` and `communication_suppressions` and fails closed on an error
- **`lib/giving-statements/load.ts`**:
  - church header, gifts (paged, `status='succeeded'`, `created_at` in `[startInstant, endExclusiveInstant)` via `startOfDayInTimeZone`, optional `profile_id`), donor names
  - `loadStatementRun`
- **`lib/giving-statements/pdf.ts`**: `renderStatementPdf` with pdf-lib, Helvetica, multi-page with the header repeated and "Page n of m". `sanitizeWinAnsi` never throws.
- **`lib/giving-statements/email.ts`**: `renderStatementEmail`, returning `{ subject, text, html }` (HTML-escaped).
- **`lib/giving-statements/send.ts`**: `sendStatementBatch(session, range)`, which returns `{ sent, skipped by reason, failed }`.
- **`app/app/church-admin/giving/statements-actions.ts`** (`"use server"`, and each export checks the church-admin gate itself): `previewStatementsAction` and `sendStatementsAction` (which requires `confirm: true`).
- **Routes:**
  - `GET /api/giving/statements/pdf?donor=&start=&end=` — church-admin only, audited, `no-store`
  - `GET /api/member/giving-statement?year=` — no donor parameter
- **UI:**
  - a Statements tab in `giving-admin-workspace.tsx` (`giving-statements-panel.tsx`)
  - a year picker and download button in `donor-portal.tsx`

### [A] Idempotency: claim before send, with a migration
1. An additive migration adds a partial unique index on `communication_logs (church_id, (segment_criteria->>'statementKey'))`. It applies where `segment_criteria ? 'statementKey'` and the status is a "claimed or sent" state: sending, queued, sent or delivered. Failed rows don't count, so a re-run can re-claim them.
2. For each donor, in order:
   - **Claim:** insert a `communication_logs` row (status `sending`, the statement key, a generic `body_preview`, no amounts). A unique-violation means the donor is already claimed or sent: skip them as `already_sent`.
   - **Send:** call `sendWithSuppression({ ..., recordLog: false })`.
   - **Update the claimed row:**
     - success sets `sent` plus the provider ids;
     - a suppression or consent skip at send time sets a non-blocking status;
     - a failure sets `failed` with `error_code 'statement_send_failed'`, which is not a transient code.
3. A `sending` claim older than 15 minutes is stale. It is marked failed (`statement_claim_stale`) and can be re-claimed, a rare and benign duplicate only if a crash followed the provider accepting the email.
4. The builder must confirm the allowed status values on `communication_logs` from the migrations.

### [A] Other answers
- **Member download:** any signed-in person with a non-null `churchProfileId` gets only their own statement, by `profile_id = churchProfileId`. The UI stays on `/app/member/giving`.
- **No extra in-flight guard:** the unique index covers it.
- **Skip records:** the run summary plus counts by reason in the audit entry. No row per skipped donor.

### Audit
Through `logAuditEvent`, wrapped so a failure doesn't block. `tableName "giving_statements"`, `actorId session.userId`.
- **Batch send:** the range, plus sent, skipped (by reason) and failed counts. No emails, names or amounts.
- **Admin PDF download:** `{ action: "pdf_download", donorRef, start, end }`. `donorRef` is the profile uuid, or a SHA-256 prefix of a guest's email.

### Tests
- **Unit tests:** `build`, `consent`, `pdf`, `email`, `send`.
- **Action and route tests** cover every non-admin role, a signed-out caller, cross-church ids, and a member's own data. Fixtures give `userId` and `churchProfileId` distinct values.
- **Manifest:** the new spec is added to `/app/church-admin/giving` and `/app/member/giving`. Two `apiRoutes` entries are added, and the action module lists both exports.
- **Admin-route denials:** role denial for the admin PDF route goes in `api-session-routes.spec.ts`.
- **E2E:** `tests/e2e/giving-statements.spec.ts`, with its seed rows inserted in the spec.

### Follow-ups found, out of scope
`lib/notifications/send-email.ts` sends `idempotencyKey` as an `X-Twilio-Email-Event-Webhook-Signature` header, which SendGrid ignores. It's harmless, but it is no dedupe.

## Validation, Council and verification (added by the Documenter, 2026-10-04)

### Amendments to the decisions above

Two statements earlier in this note were overtaken and are corrected here:
- **"No migration"** is superseded by the idempotency amendment: migration `20261005000000_giving_statement_claims.sql` adds the partial unique index `communication_logs_statement_claim_uidx`. Rollback: `drop index if exists public.communication_logs_statement_claim_uidx;`.
- **"Staff-facing lists show 'Anonymous'"** is superseded by the owner decision of 2026-10-04 (below).

### Validator round

The factory's own validator ran before the Council and found two High issues: the staff preview attributed anonymous gifts (an "Anonymous" row per anonymous-only donor, and the un-statementable list), so staff could infer who gave anonymously. Both were fixed, and the member page was given a fallback for a failed statement-year load.

### Owner decision, 2026-10-04: anonymity holds against staff end to end

- The staff preview lists named gifts only. Anonymous gifts are one unattributed aggregate line; an anonymous-only donor has no staff row.
- The admin PDF is named gifts only.
- The donor's own statement (member download, and the batch email to that donor) is the full statement, including their anonymous gifts.
- Statement send records carry no recipient (applied after the Council round; see below).
- Recorded in `docs/security-role-access-matrix.md` and `docs/application-guide.md`.

### Council Review 40

Five separate read-only seats under Council v2; synthesis `docs/reviews/2026-10-04-council-review-40-synthesis.md`, agent reports `docs/reviews/2026-10-04-council-review-40-agents-1-5.md`. **Status: AMENDED.** Fixes landed in `55a2418`:
1. `recipient_id: null` on statement send records. **Found by the orchestrator, not a seat:** the Communications history renders `recipient_id` by name to pastors and secretaries, who have no giving access, exposing anonymous-only donors and every named donor.
2. CR/LF stripped from the email subject (defence in depth).
3. The migration states its rollback.
4. Ranges over 10 years are rejected.
5. A warning is logged when a stale `sending` claim is released.

Seven agent claims were wrong or unsupported against source (listed in the synthesis; they include the Security seat's High "header injection", wrong because both providers take the subject as a JSON field). Score: **84/100** (from 82). Gap 3 is not closed until G3.3b.

### Verification (orchestrator-run, after `55a2418`)

| Command | Result |
|---|---|
| `npx vitest run` | 199 files / 2,403 tests pass |
| `npm run lint` | 0 errors (1 pre-existing warning in `localization-governance.config.mjs`) |
| `npx tsc --noEmit` | clean |
| `npm run test:surfaces` | OK |
| `npm run lint:migrations` | PASS |
| `npm run setup:e2e -- --reset` | migration `20261005000000` applies cleanly to a fresh database |
| `npm run test:e2e:local -- tests/e2e/giving-statements.spec.ts tests/e2e/api-session-routes.spec.ts` | 49 passed (the run builds the app) |

**Not verified:** CI (`verify` and the four `e2e` shards) has not run, because no PR exists yet. The Documenter did not re-run these commands (docs-only role); the results are the orchestrator's. Commit signature verification (`gh api ... .commit.verification`) is also not yet checked.

### Residual risk (accepted)

- No cron proactively fails abandoned `sending` claims; they are released lazily on the next claim for that donor and range.
- No `consent_logs` entry for a bounce or complaint on a statement email, because the rows carry no recipient. The address suppression is still recorded.
- Most panel and member-card copy is English-only; only the tab label is keyed.
- One possible duplicate email if a run dies after the provider accepted the message but before the row update.
- No live test of two concurrent batches; the unique index enforces it and the e2e covers a second send.
- The hosted database lacks the index until owner action O8 is done after merge.

### Follow-up work

- **G3.3b** (new Must row, ~0.5 day, M3): ChurchCore's own receipt for a paid event registration. Gap 3 stays open until it lands.
- **O8:** apply migration `20261005000000` to hosted Supabase after merge.
- `lib/notifications/send-email.ts` sends `idempotencyKey` as an `X-Twilio-Email-Event-Webhook-Signature` header SendGrid ignores (pre-existing, harmless, not a dedupe). Not yet a tracker row; the owner should say whether to add one (Should).
- i18n of the statements panel and member-card copy, under Should row S13's sweep.
- Open the G3.3 PR (a draft is enough to get the `e2e` result), check commit signatures, and read GitHub's automated review before merging.
