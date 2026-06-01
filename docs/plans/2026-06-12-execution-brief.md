# 2026-06-12 Execution Brief

Date: 2026-05-31
Checkpoint target: 2026-06-12 weekly go/no-go review
Source checklist: docs/plans/mvp-competitive-go-no-go-checklist.md
Phase context: Phase C (Competitive 30 days) — first meaningful movement toward GO

## Objective

Begin closing Phase C replacement blockers. The 2026-06-05 brief is fully complete
and MVP +2 weeks is now CONDITIONAL GO. This brief targets the three Phase C gates
that remain NO-GO: service-planning depth, Stripe refund lifecycle, and import breadth
beyond people/households. WS-C1 and WS-C2 are the primary workstreams for this
cycle; WS-C3 is scoped conservatively to groups as the highest-value import entity
after people.

## Current scorecard (2026-05-31)

- MVP Today: `GO`
- MVP +2 weeks: `CONDITIONAL GO`
- Competitive 30 days: `NO-GO` ← target: reduce blockers
- Competitive 60 days: `NO-GO`

## Target outcomes (2026-06-12)

- MVP Today: `GO` (hold)
- MVP +2 weeks: `GO` (promote from CONDITIONAL — close Spanish soft gap if feasible)
- Competitive 30 days: `NO-GO` (risk reduced; service-planning depth and refund lifecycle closed)
- Competitive 60 days: `NO-GO`

## Workstreams

### WS-C1: Worship/Setlist Planning Depth

Status: Planned

Owner: Product + Engineering

Priority: P0 — primary Phase C replacement blocker

Context: Service plans already support event linkage, volunteer assignments, linked event
roster/check-in actions (Slices 10–12, A1–A2 on main). The worship/setlist layer is
completely unstarted. This is the clearest Planning Center / Pushpay replacement gap
for target-segment churches.

Deliverables:

- Add worship-element blocks to service plans: songs, readings, sermon metadata
  (title, speaker, series, scripture), and attachments (order sheet, slides, notes).
- Support run-of-service ordering for worship elements alongside existing schedule blocks.
- Add "Add Song / Reading / Sermon" controls inside the service-plan detail workspace.
- Surface worship element list and run order in the read-only plan view.
- Add focused action and page tests for worship element writes, ordering, and church-scope guards.

Definition of done:

- ChurchAdmin can create a service plan, add and reorder worship elements, and view
  the full run-of-service order including volunteer assignments and worship blocks.
- All writes are church-scoped and test-covered.
- `docs/application-guide.md` and `docs/testing-schema.md` updated to reflect worship
  planning capability.
- lint, build, and targeted tests pass.

Verification commands:

- `npm run test -- app/app/church-admin/volunteers/schedules/page.test.tsx "app/app/church-admin/volunteers/schedules/[id]/page.test.tsx" app/app/volunteer-actions.test.ts`
- `npm run lint`
- `npm run build`

### WS-C2: Stripe Refund Lifecycle

Status: Planned

Owner: Product + Engineering

Priority: P1 — closes the final open payment lifecycle state

Context: The payment lifecycle is otherwise complete: pending, paid, failed states are
reconciled via webhook, ChurchAdmin follow-up UI is wired, Payment Intent IDs are
stored, and checkout UI states are in place (B1–B4 on main). The `refunded` state and
operator-facing refund/cancel workflow remain the only unhandled Stripe outcome.

Deliverables:

- Handle `charge.refunded` and `payment_intent.canceled` Stripe webhook events:
  reconcile `event_registration_payments` to `refunded` or `cancelled` state with
  Stripe refund amount and timestamp.
- Add ChurchAdmin refund/cancel action for manual operator-initiated refunds:
  call Stripe Refunds API, update ledger row, write audit note with actor.
- Surface `refunded` and `cancelled` states in ChurchAdmin event registration workspace
  (badge, filter, and follow-up audit trail row).
- Add focused tests for webhook refund reconciliation and ChurchAdmin refund action
  role/backend gates.

Definition of done:

- Stripe-initiated refunds and manual ChurchAdmin refunds both reconcile to `refunded`
  state in `event_registration_payments` with an audit record.
- `cancelled` state handles intent cancellations.
- Non-manager roles cannot invoke refund action.
- Targeted tests, lint, and build pass.

Verification commands:

- `npm run test -- app/app/church-admin-actions.test.ts app/app/member-actions.test.ts app/portal/actions.test.ts`
- `npm run lint`
- `npm run build`

### WS-C3: Import Breadth — Groups

Status: Planned

Owner: Product + Engineering

Priority: P2 — extends import beyond people/households to highest-value next entity

Context: People and households import is complete with source adapters for
`generic_csv`, `planning_center`, `breeze`, and `pushpay_ccb` (Slice 8 on main).
Groups are the next most common migration entity after people across all four supported
source systems. Giving and events imports are deferred to a future brief.

Deliverables:

- Add group import staging schema: batches/rows extended for group entity type.
- Add CSV group parser: name, type/category, leader email (linked to existing people
  records), description, status (active/inactive).
- Extend source adapters (`planning_center`, `breeze`, `generic_csv`) for group exports.
- Add dry-run summary for groups: create, update, skip, reject, unmatched-leader counts.
- Add ChurchAdmin commit action for group import batches.
- Add focused tests for group parser, dry-run, and commit role/backend gates.

Definition of done:

- ChurchAdmin can import a groups CSV (generic or vendor-sourced), inspect a dry-run
  summary, and commit approved group records.
- Leader-email matching links to existing people records where found; unmatched leaders
  are reported rather than silently dropped.
- Targeted tests, lint, and build pass.

Verification commands:

- `npm run test -- app/app/church-admin/people/import/actions.test.ts app/app/church-admin-actions.test.ts`
- `npm run lint`
- `npm run build`

## Sequencing

Execute in order — each workstream can be started independently, but WS-C1 has the
highest Phase C leverage and should complete before WS-C3 is started if time is
constrained.

1. WS-C1 (worship/setlist depth) — highest Phase C blocker
2. WS-C2 (refund lifecycle) — closes payment lifecycle with bounded scope
3. WS-C3 (groups import) — incremental; scope to dry-run + commit only

## Risks

- WS-C1 worship element ordering: run-of-service block ordering may need a position
  integer column on the existing schedule-block schema; confirm before adding a new
  table.
  - Fallback: persist order as an integer field on the worship element row; reorder via
    drag/sort action that patches position values.
- WS-C2 Stripe refund API: local testing requires Stripe CLI event forwarding for
  `charge.refunded`; manual ChurchAdmin action path can be tested without a live Stripe
  connection.
  - Fallback: unit-test the webhook handler with a mocked event payload; note in
    factory-run docs that live webhook verification requires Stripe CLI.
- WS-C3 leader-email matching: unmatched leaders should not block group commit; report
  them as warnings, not hard rejections.

## 2026-06-12 review checklist

- Did WS-C1 (worship/setlist) ship? Does ChurchAdmin have a usable plan-building
  workflow with worship elements?
- Did WS-C2 (refund lifecycle) ship? Can ChurchAdmin initiate a refund and does the
  Stripe webhook reconcile it?
- Did WS-C3 (groups import) ship at least to dry-run level?
- Did MVP Today hold at GO?
- Was the Spanish soft gap addressed (MVP +2 weeks promoted to full GO)?
- Were evidence links and factory-run records updated in the same PR as each workstream?
