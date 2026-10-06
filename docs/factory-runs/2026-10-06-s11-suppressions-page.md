# Factory run: S11 — Church-admin suppressions page (2026-10-06)

**Plan row:** `DEVELOPMENT_PLAN.md` §0 S11 (Must, 1 day, M3). Widened by Council Review 32 to a real page.

**Branch:** `feat/suppressions-page-s11`.

**Status:** owner approved the story, the brief and the two policy decisions on 2026-10-06.

## Owner decisions (2026-10-06)
- **What can be removed.** Admins can lift **bounce** and **manual** suppressions only.
  - Removal needs a required reason and is audited.
  - **Unsubscribe/STOP** and **spam-complaint** suppressions are shown but locked. Only the person can opt back in. This protects consent and SMS (TCPA-style) compliance.
- **Who sees what.** Church admin, pastor and secretary can view the page. This matches the existing `/app/communications/history` gate and `can_manage_communications`. Only church admins can add or remove suppressions.

## Context (from source)
- **Table.** `communication_suppressions` has `church_id`, `channel` (`email`|`sms`), `contact` (email lowercased, phone trimmed), `reason` (`manual`|`unsubscribe`|`bounce`|`complaint`), `notes`, `suppressed_by` (profile, nullable) and `created_at`.
  - Its unique key is `(church_id, channel, contact)`.
  - RLS (S1) grants `authenticated` **reads only**, through `can_manage_communications` (church admin, pastor, secretary).
  - Every write goes through the church-scoped admin client.
- **Who writes suppressions.**
  - Manual add: `suppressContactAction` in `app/app/communications-actions.ts:304`, church-admin only.
  - Delivery webhooks: bounce and complaint.
  - `/api/unsubscribe` and Twilio STOP: unsubscribe.
- **No screen exists today.** Council Review 32 deleted the dead `communications-hub.tsx`, and the runbook's §3 undoes suppressions with SQL.
- **Communications sub-navigation** lives in each communications client's nav items: History, Compose, Templates (for example `components/application/communications-compose-client.tsx:36-49`).

## Acceptance criteria
1. **Page.** `/app/communications/suppressions` is gated server-side to church-admin, pastor and secretary; anyone else is redirected. A "Suppressions" item appears in the communications sub-nav everywhere History, Compose and Templates do.
2. **List.** The page shows every suppression for the church, newest first. Each row has:
   - the channel;
   - the contact;
   - the member name, when a church profile has that email or phone;
   - the reason in words: bounce → "Bounced", unsubscribe → "Unsubscribed (link or STOP)", complaint → "Marked as spam", manual → "Added by staff";
   - the notes;
   - who added it (manual only);
   - the date.

   There is a filter by channel and a search by contact or name, plus an empty state.
3. **Add (church admin only).**
   - A form with channel, contact and optional notes calls `suppressContactAction`.
   - Validation and an error message cover a bad email, an empty contact, and a duplicate (the unique key).
   - The list refreshes after a successful add.
4. **Remove (church admin only, bounce and manual only).**
   - A new `removeSuppressionAction({ id, reason })`, marked `"use server"`, authenticates and checks church-admin itself.
   - It loads the row scoped to the session's church. It refuses `unsubscribe` and `complaint` with a clear message. It requires a reason of at least 5 characters.
   - It deletes through the church-scoped admin client and checks the error. It writes `audit_log` with the actor (`session.userId`), the table, the record id, and old values (channel, reason, contact, notes) plus the removal reason.
   - The UI uses a confirmation modal with a required reason. Locked rows show a lock and "Only the person can opt back in".
5. **Pastor and secretary** see the list with no add or remove controls. The server action denies them independently of the UI.
6. **Tenancy.** Every read and write is scoped to the session's church. A suppression id from another church gives not-found.
7. **Tests and coverage.**
   - Unit tests for the action: role denial for each non-admin role, locked reasons refused, reason required, cross-church id, audit written, error checked.
   - Component tests for the page.
   - Coverage-manifest entries for the page (allowed roles from the real gate) and the new action.
   - An e2e journey: an admin adds a manual suppression and sees it; removes a seeded bounce with a reason; sees an unsubscribe row locked. A pastor sees the list without controls.
8. **Docs.** The runbook's §3 points to the page; SQL remains only for locked types, and only with the person's documented consent.

## Council and verification

**Council Review 44** (`docs/reviews/2026-10-06-council-review-44-synthesis.md`, agent reports in `...-agents-1-5.md`, both committed in `5954465`): five separate read-only agents, status **AMENDED**. Authorization, tenancy, the lock and IDOR protection held. Four fixes were required and landed in `5954465`:
1. the table scrolls on phones (it was clipped at 390px);
2. add and remove results are announced (`role="status"`, `aria-live="polite"`);
3. the 1,000-row cap shows a notice;
4. the audit-failure message no longer claims the removal was unaudited (the table's trigger had already recorded the delete).

Six agent claims were wrong or unsupported and are listed in the synthesis.

**Intent.** Replace SQL-only suppression handling with an audited admin screen, without letting an admin undo a person's own opt-out.

**Architecture impact.** No migration, no new dependency, no ADR. One new page and one new `"use server"` action (`removeSuppressionAction`) that authenticates and role-checks itself. Writes go through the church-scoped admin client (ADR 0022); `authenticated` keeps reads only (S1). `suppressContactAction` changed from upsert to insert-or-refuse and returns `{ ok, error }` for validation and duplicates (a role denial still throws). The upsert change closed a loophole found at build: re-adding an unsubscribed address as "manual" and then removing it would have defeated the lock.

**Verification** (orchestrator, after `5954465`): `npx vitest run` 208 files / 2,589 tests pass; `npm run lint` 0 errors (1 pre-existing warning); `npx tsc --noEmit` clean; `npm run test:surfaces` OK. Builder: `npm run build` clean; theme ratchet 2/2; `npm run test:e2e:local -- tests/e2e/communications-suppressions.spec.ts --workers=1` 10/10; the communications slice of the page-role sweep 69/69 (a full combined local run had auth-redirect flakes on unrelated pages; CI is the judge).

**Not verified.** CI (`verify` and the 4 `e2e` shards; no PR exists yet), GitHub's PR review, commit signature verification on GitHub (no push yet), and a phone-width visual check of the scrolling table. The consent and TCPA-style reasoning behind the lock is recorded as unverified: no legal review.

**Residual risk.** Two audit rows per removal (noisy, complete); no suppression retention policy; no "admins only" hint for pastors and secretaries; streamed markup may briefly duplicate inputs before hydration (not reproduced as a user-facing defect). All are in `DEVELOPMENT_PLAN.md` §0.5.

**Follow-up.** Open a PR, get CI green, read GitHub's review, then set S11 to `Done (#PR)`. T1a is the last M3 item. Owner action O13 (permanent Resend key) is unrelated to this branch but surfaced in the same close-out.
