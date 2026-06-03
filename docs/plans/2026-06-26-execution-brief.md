# 2026-06-26 Execution Brief

Date: 2026-06-02
Checkpoint target: 2026-06-26 weekly go/no-go review
Source checklist: docs/plans/mvp-competitive-go-no-go-checklist.md
Phase context: Phase C (Competitive 30 days) — final gate push toward GO

## Objective

Close the remaining Phase C required gates: import tooling expanded to
attendance and giving (the last two entities needed to satisfy the import
breadth gate), and close the SMS channel gap in the communications
auto-retry and suppression operator UI.

## Current scorecard (2026-06-19)

- MVP Today: `GO`
- MVP +2 weeks: `GO`
- Competitive 30 days: `NO-GO (risk-reduced)` ← target: promote to `GO`
- Competitive 60 days: `NO-GO`

## Target outcomes (2026-06-26)

- MVP Today: `GO` (hold)
- MVP +2 weeks: `GO` (hold)
- Competitive 30 days: `GO` (all required Phase C gates closed)
- Competitive 60 days: `NO-GO`

## Phase C gate status going in

| Gate | Status |
|---|---|
| Paid registration lifecycle complete | ✅ Closed (WS-C2) |
| Service-planning depth | ✅ Closed (WS-C1) |
| Import tooling beyond people/households | ⬜ Groups ✅, Events ✅; Attendance and Giving pending |
| Security evidence matrix-linked | ✅ Current |
| Weekly readiness green | ✅ Green |

## Workstreams

### WS-C7: Attendance CSV Import

Status: Planned
Priority: P0 — closes import breadth gate for attendance entity

Context: `attendance` table has `id`, `church_id`, `profile_id` (FK),
`event_id` (FK), `checked_in_at` (timestamptz), `status`
('present'|'absent'|'excused'), `check_in_method` (includes 'import'),
`created_at`. No `source_id` column yet — migration needed. Dedup key:
`source_id` per event per church (same pattern as groups/events).

Deliverables:
- Migration: add `source_id TEXT` + partial unique index on `attendance`
- Source adapters (generic_csv, planning_center, breeze): map profile_email
  (looked up against profiles), event_source_id (looked up against events),
  attended_at, status, check_in_method
- Dry-run: classify create/update/skip/reject; resolve profile by email,
  event by source_id; unresolved → warning + null FK, not rejection
- Commit: upsert into `attendance` with `check_in_method = 'import'`
- New server actions, page, and workspace UI
- Focused tests mirroring events/groups import pattern

Definition of done:
- ChurchAdmin can import an attendance CSV, preview classified rows, and
  commit. Unmatched profile email or event source_id → warning, not reject.
- Targeted tests, lint, and build pass.

### WS-C8: Giving/Donations CSV Import

Status: Planned
Priority: P1 — closes import breadth gate for giving entity

Context: `donations` table has `id`, `church_id`, `profile_id` (nullable
FK), `donor_name`, `donor_email`, `amount_cents` (required, >0),
`fund_designation` (text), `stripe_payment_intent_id` (nullable),
`is_recurring`, `status` ('pending'|'succeeded'|...), `is_anonymous`,
`note`, `created_at`. No `source_id` column yet. Giving is high-sensitivity
financial data — imports should NOT trigger GL posting (no `donation_gl_posts`
entries); GL reconciliation is a separate operator action after import.

Deliverables:
- Migration: add `source_id TEXT` + partial unique index on `donations`
- Source adapters (generic_csv, planning_center, breeze): map amount (parsed
  to cents), fund_designation, donor_email (matched to profiles), date,
  is_recurring, note
- Dry-run: classify; validate amount > 0; resolve donor by email (warning if
  unmatched, sets `profile_id = NULL` and `is_anonymous = true`); no GL posting
- Commit: upsert into `donations`; `status = 'succeeded'` (historical giving);
  `stripe_*` fields all null (imported giving has no Stripe provenance)
- Operator warning in workspace: "Imported gifts will not post to GL automatically.
  Use Finance > Fund Mappings to reconcile after import."
- New server actions, page, and workspace UI
- Focused tests

Definition of done:
- ChurchAdmin can import a giving CSV, preview classified rows, and commit.
- GL posting NOT triggered. Targeted tests, lint, and build pass.

### WS-C9: SMS Channel Depth — Auto-Retry and Suppression Operator UI

Status: Planned
Priority: P2 — closes Phase C communications depth gap for SMS

Context: Twilio adapter is fully wired (not a stub). The auto-retry cron
(`/api/cron/communications-retry`) and `retryEligibleCommunications()` currently
process both email and SMS channels if `check_in_method` filtering allows it —
verify and confirm SMS is included. Gaps:
1. The retry cron may be email-only — confirm and extend to SMS if needed.
2. No SMS-specific operator retry UI in the comms hub (the "Retry all eligible"
   button currently exists for all channels — verify it covers SMS).
3. Suppression list operator UI shows email suppressions; SMS suppressions may
   not be surfaced or filterable by channel.

Deliverables:
- Confirm `retryEligibleCommunications` handles SMS channel rows (check
  `communication_logs` query — no channel filter should mean SMS is included).
- If SMS is excluded from retry: extend to include it (no architecture change,
  just query scope).
- Extend Communications Hub suppression tab to show SMS suppressions distinctly
  (already has channel filtering; confirm SMS rows appear).
- Add "Add SMS suppression" form path in the suppression UI if it only supports
  email today.
- Focused tests for SMS retry eligibility and SMS suppression UI path.

Definition of done:
- Failed SMS sends with transient error codes are picked up by the retry cron.
- ChurchAdmin can view and manually add SMS suppressions in the comms hub.
- Targeted tests, lint, and build pass.

## Sequencing

1. WS-C7 (attendance import) — same pattern as events, fastest to ship
2. WS-C8 (giving import) — higher sensitivity, most import-confidence value
3. WS-C9 (SMS depth) — targeted gap-closure, mostly verify + small UI extension

## Risks

- WS-C8 GL posting: must NOT auto-post; operator should reconcile manually.
  - Guard: import commit path must not call `autoPostToGl()`. Verify in code review.
- WS-C8 anonymous giving: CSV rows with no donor email should be committed
  with `is_anonymous = true`, not rejected.
- WS-C7 double attendance: the `attendance` table has a unique constraint on
  (event_id, profile_id) for 'present' status. Import must detect and skip/update
  rather than insert and fail.
- WS-C9 SMS retry scope: if Twilio API credentials are not set, the retry will
  stub-succeed (safe). Confirm the stub path does not increment `retry_count`
  inappropriately.

## 2026-06-26 review checklist

- Did all three workstreams ship?
- Does Phase C promote to GO (import gate fully satisfied)?
- Did MVP Today and MVP +2 weeks hold at GO?
- Were evidence links and factory-run records updated in the same PR?
