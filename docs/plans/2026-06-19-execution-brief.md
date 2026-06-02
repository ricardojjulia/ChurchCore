# 2026-06-19 Execution Brief

Date: 2026-06-01
Checkpoint target: 2026-06-19 weekly go/no-go review
Source checklist: docs/plans/mvp-competitive-go-no-go-checklist.md
Phase context: Phase C (Competitive 30 days) continued — three remaining blockers

## Objective

Promote MVP +2 weeks from CONDITIONAL GO to full GO by closing the Spanish
coverage soft gap, advance Competitive 30-day risk reduction by closing the
communications operational depth gap and extending import breadth to events.

## Current scorecard (2026-06-12)

- MVP Today: `GO`
- MVP +2 weeks: `CONDITIONAL GO` ← target: promote to `GO`
- Competitive 30 days: `NO-GO (risk-reduced)` ← target: further risk reduction
- Competitive 60 days: `NO-GO`

## Target outcomes (2026-06-19)

- MVP Today: `GO` (hold)
- MVP +2 weeks: `GO` (promote — Spanish coverage closed)
- Competitive 30 days: `NO-GO` (further risk reduction — comms depth + events import)
- Competitive 60 days: `NO-GO`

## Workstreams

### WS-C4: Spanish UI Coverage — Communications Routes

Status: Planned

Owner: Product + Engineering

Priority: P0 — closes the only remaining Phase B soft gap; unblocks MVP +2 weeks → GO

Context: The i18n system (`lib/i18n.ts`, cookie-driven locale, `useI18n()` hook) is
already in place. Finance routes (journal, import) were covered in the 2026-05-29
factory run. Communications routes still have hardcoded English strings throughout.
`docs/plans/spanish-ui-coverage.md` tracks the remaining gap.

Deliverables:

- Add Spanish translations for all hardcoded English strings in ChurchAdmin
  communications components: compose, broadcast list, delivery log, retry controls,
  suppression/consent views, unresolved-lane closure guidance.
- Add Spanish translations for any remaining finance route strings not yet covered
  (chart-of-accounts selector, budget labels, GL accounts view).
- Update `lib/i18n.ts` with new namespace entries following the existing pattern.
- Update `docs/plans/spanish-ui-coverage.md` to reflect completed surfaces.

Definition of done:

- All ChurchAdmin communications and remaining finance route strings resolve
  from i18n lookups, not hardcoded English literals.
- No new hardcoded English strings introduced in changed files.
- `npm run lint`, `npm run build`, and `npm run test` pass.

Verification commands:

- `npm run lint`
- `npm run build`
- `npm run test`

### WS-C5: Communications Auto-Retry Queue

Status: Planned

Owner: Product + Engineering

Priority: P1 — closes the last operational depth gap in Phase C communications gate

Context: Webhooks, idempotency, bounce/suppression, and consent logging are
production-ready. The only missing operational piece is automatic retry scheduling.
Currently, failed sends sit in `communication_logs` with `status='failed'` until
an operator manually reruns them (runbook SOP). Two gaps remain:

1. No background retry queue — transient failures require manual operator action.
2. Unsubscribe links are not automatically injected into outbound email bodies;
   operators must manually include them.

Deliverables:

- Add a retry-eligible query: select `communication_logs` rows where
  `status = 'failed'`, `retry_count < 3`, and `shouldRetryDelivery()` is true
  for the failure code.
- Add `scheduleRetry(logId)` server action or cron-compatible function that
  re-dispatches the send through the existing provider adapter and increments
  `retry_count`.
- Wire a cron-style trigger (or a ChurchAdmin "Retry eligible failures" operator
  action if a cron is out of scope for this cycle) to process the retry queue.
- Auto-inject a signed unsubscribe link into outbound email HTML before dispatch:
  call `generateUnsubscribeLink(recipientProfileId, communicationId)` from
  `lib/communications/unsubscribe.ts` and append it to the email body before
  passing to the provider adapter.
- Add focused tests for retry eligibility logic and unsubscribe link injection.

Definition of done:

- Failed sends with retryable error codes are re-attempted without manual
  operator SQL intervention.
- All outbound emails include a signed unsubscribe link.
- Targeted tests, lint, and build pass.

Verification commands:

- `npm run test -- lib/communications/`
- `npm run lint`
- `npm run build`

### WS-C6: Events CSV Import

Status: Planned

Owner: Product + Engineering

Priority: P2 — extends import breadth to events (next entity after groups)

Context: The import staging infrastructure (`import_batches`, `import_batch_rows`,
`parseCsv()`, dual-path pattern) is in place. People/households and groups import
are complete. Events is the next highest-value entity for church migration confidence.

Events table key columns: `title` (required), `description`, `location`,
`starts_at` (required, timestamptz), `ends_at` (required, timestamptz),
`capacity`, `approval_status` (defaults `draft`).

Deliverables:

- New source adapters for events (generic_csv, planning_center, breeze):
  map title, description, location, starts_at, ends_at, capacity, status.
- Events dry-run logic: parse CSV, normalize, classify (create/update/skip/reject),
  stage rows. Dedup key: `title + starts_at` (case-insensitive title, exact
  starts_at). Reject rows missing title or starts_at; reject rows where
  ends_at <= starts_at.
- Events commit logic: upsert into `events` table from staged rows; skip/reject
  rows ignored.
- New server actions: `runEventsImportDryRunAction`,
  `commitEventsImportBatchAction`.
- New `/app/church-admin/events/import` route and workspace component (mirror
  groups import workspace).
- Focused tests for adapters, dry-run logic, and actions.

Definition of done:

- ChurchAdmin can import an events CSV (generic or vendor-sourced), inspect a
  dry-run summary, and commit approved event records.
- `ends_at > starts_at` constraint enforced at dry-run classification (reject).
- Targeted tests, lint, and build pass.

Verification commands:

- `npm run test -- lib/events-import`
- `npm run lint`
- `npm run build`

## Sequencing

Execute in order — WS-C4 has the highest gate leverage (Phase B → GO):

1. WS-C4 (Spanish coverage) — bounded, high-leverage, closes Phase B
2. WS-C5 (auto-retry + unsubscribe injection) — closes communications depth
3. WS-C6 (events import) — incremental import breadth

## Risks

- WS-C4 scope creep: Spanish coverage could expand indefinitely. Scope strictly
  to communications routes and any remaining finance route gaps identified in
  `docs/plans/spanish-ui-coverage.md`. Do not attempt a full repo sweep.
- WS-C5 cron availability: if a background scheduler is not available in the
  local or Supabase environment, scope retry to a ChurchAdmin operator action
  ("Retry all eligible failures") rather than fully automated scheduling.
  - Fallback: operator-triggered retry action with a clearly labelled button in
    the communications operations lane.
- WS-C6 datetime parsing: source CSVs may contain locale-specific date formats.
  Scope datetime parsing to ISO 8601 only in the first pass; reject non-ISO rows
  with a clear error message.

## 2026-06-19 review checklist

- Did WS-C4 (Spanish coverage) ship? Does MVP +2 weeks promote to GO?
- Did WS-C5 (auto-retry) ship? Can failed sends be retried without manual SQL?
- Did WS-C5 (unsubscribe injection) ship? Do outbound emails include a signed link?
- Did WS-C6 (events import) ship at dry-run + commit level?
- Did MVP Today hold at GO?
- Were evidence links and factory-run records updated in the same PR?
