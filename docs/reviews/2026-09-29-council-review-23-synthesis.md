# Council Review 23 — Synthesis

**Date:** 2026-09-29
**Branch audited:** `feat/assignment-notifications-g1-5`, commits `83b7a2d` (G1.5 build) and `a99cfea` (manifest), rebased onto `main` (`6556ce6`). The branch also carries `2d71473`, a docs-only record of the owner's date/scope decision, which is out of this review's scope.
**Roadmap item:** G1.5, assignment notifications (`DEVELOPMENT_PLAN.md` §0.3)

## §0 Scope Note

Diff-scoped. G1.5 was built on 2026-09-28 and paused when its e2e journey found S7 (the login id used as a profile id). After S7 and S8 merged it was rebased cleanly; the journey now passes locally (assign → the volunteer gets a link → declines → the admin finds a replacement). 15 files, about +900/−94. The four agents were cut off once by a rate limit and resumed from their transcripts.

## 1. Cross-Agent Consensus

- **The core is correct (all four).** No new `"use server"` exports (the helpers are module-private); the three widened actions keep their write gate; `sent_by` and `recipient_id` are church profile ids; a failed notification never undoes the assignment; every caller handles the new result; 7 of 8 DoD clauses are done (Agent 4).
- **"Email sent." / "Text sent." can be false (Agents 1, 2 and 4; verified by me).** `lib/communications/sendgrid-adapter.ts` and `twilio-adapter.ts` return `accepted: true` with a `*-stub-*` id whenever their keys are unset, in any environment. Pre-existing, but G1.5 is the first feature that tells an admin a volunteer was contacted. Same class as Review 22's donation stub.
- **SMS-preferring volunteers are never notified (Agents 1 and 4; verified by me).** `checkOptIn` treats a missing `notification_preferences` row as SMS off (`lib/notifications/queue-communication.ts:273, 293`) and `sms_opt_in` defaults to false, so `chooseChannel`'s SMS choice is always skipped, with no email fallback. All 5 local SMS-preferring profiles are affected. The DoD clause "email or SMS by preference" is Partial.
- **Stale volunteer-facing copy (Agents 2 and 4; verified):** the confirm page says links "expire after 14 days" (`app/portal/volunteer/confirm/[token]/page.tsx:30`).

## 2. Single-agent findings, verified during synthesis

1. **Every member can read every volunteer's confirm token (Agent 1). Blocking.** Verified in the DB: `volunteer_shifts_select_member_scope` is `belongs_to_church(church_id)`, and `authenticated` (and `anon`) hold SELECT on every column, including `confirmation_token`. A member can fetch another volunteer's token through PostgREST and decline their shift or read their schedule via `/portal/volunteer/*/<token>`. Pre-existing, but G1.5 now puts a token on every shift, which turns a latent exposure into a real one. Readers of the token in the app: the public token pages (admin client), Remind (`volunteer-actions.ts:1514`, RLS client), `notifyVolunteerOfShift` (RLS client), and `lib/volunteer-data.ts:276`'s `select("*")`.
2. **Links can point at a dead address (Agent 2).** Verified: `process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"` (`volunteer-actions.ts:1491, 2561`), while the rest of the app falls back to `:4200` (`lib/communications/unsubscribe.ts:17`). A deploy without the variable emails volunteers a localhost link.
3. **The person who declined can be suggested as their own replacement (Agent 2, inferred).** Verified by reading: the same-day conflict check and `get_volunteer_pool` ignore declined shifts (`volunteer-actions.ts:1292-1302`), so the decliner is eligible again for that date.
4. **A skipped or failed notification shows in a green success toast (Agent 3).** Verified (`volunteer-schedule.tsx:1401-1404, 1432-1435`).
5. **No church name in the message (Agent 3).** Verified (`volunteer-notifications.ts:87-99`). An SMS from an unknown number with no church name reads as spam. SMS isn't trimmed (the note has no limit).
6. **A volunteer who blocked the date but didn't decline has no "Find replacement" (Agent 3).** Verified: the button shows only for declines, and a full position disables Assign.
7. **Remind can send twice, and counts a failed send as a reminder (Agents 1 and 3).** Verified: the send happens before the `volunteer_shift_reminders` insert; an insert failure returns `ok: false` after the email went out; the counter increments on a skipped or failed send.
8. **Unit tests don't distinguish login id from profile id (Agent 1).** Verified: `assignment-notification-actions.test.ts`'s `SESSION` has no `churchProfileId`, and `sent_by` isn't asserted — the S7 rule says fixtures must use distinct ids. Only the e2e guards it today.

## 3. Corrections

- **Agent 2's manifest finding (6) is right, and it's ours:** `volunteer-schedule.test.tsx` was added to the list page's manifest entry, but it renders only the detail page's builder.
- **Gap 1's definition of done still lists "rehearsal"** among the CI journeys though the owner moved G1.7 after MVP (Agent 4) — our own doc edit from the date/scope decision earlier today missed it. Fifth round running with an error in our own write-up.
- No agent claim was found wrong.

## 4. Score

**70/100** (Agent 4; accepted), up from 69: service-planning notifications work end to end. Not more, because deliveries still depend on stubbed or unwired providers (G5.1, F2) and G1.6 is open. Volunteer Scheduling ~86%.

## 5. Proposed prompts (fix before merge)

- **P1 — Close the token exposure.** A migration revokes SELECT on `volunteer_shifts` from `anon` and `authenticated` and grants `authenticated` SELECT on every column except `confirmation_token` (the migration notes that a new column needs its own grant). The two staff-side token reads (Remind, `notifyVolunteerOfShift`) and `ensureShiftToken`'s update move to the church-scoped admin client after the write gate (ADR 0022), with a row-count check; `lib/volunteer-data.ts:276` selects explicit columns. DB test: a member can't read the token; everything else they could read, they still can.
- **P2 — SMS falls back to email.** When SMS is the preferred channel but consent is off (or there's no phone), and the volunteer has an email with email consent, send by email instead; the outcome says so ("Emailed (they haven't opted in to texts)"). Test through the real consent logic, not a mocked `sendWithSuppression`.
- **P3 — No faked deliveries.** SendGrid and Twilio stubs run only outside production or in demo mode (the Review 22 rule); otherwise the adapter returns `accepted: false` with "not configured", and the admin sees "Not sent: email isn't set up for this church yet." Adapter tests.
- **P4 — One app-URL resolver.** `lib/app-url.ts`: `NEXT_PUBLIC_APP_URL` (trimmed, non-empty), else `http://localhost:4200` outside production; in production without it, the notification is skipped with "the app's web address isn't configured." Used by the volunteer links and `unsubscribe.ts`.
- **P5 — Messages and admin feedback.** The church name is in the subject and the first line; SMS is trimmed (note capped) to fit about 2 segments; a non-"sent" outcome shows a yellow toast; the confirm page's expiry copy matches the rule; "Find replacement" also shows for a volunteer who blocked the date; the decliner is excluded from that date's suggestions.
- **P6 — Remind.** Record the reminder only when it was actually sent; if the record fails after a send, return success with a warning, never `ok: false` (no double send).
- **P7 — Tests and docs.** Distinct `churchProfileId` in the G1.5 unit fixtures with `sent_by` asserted; the e2e checks `confirmation_status = 'declined'` in the DB and that the decliner isn't suggested; fix the list-page manifest entry and the stale e2e comment; Gap 1's DoD drops "rehearsal"; G1.5's tracker status.

## 6. Tracker changes (not fixed here)

- **Decline alerts to the admin** (Agent 4): a decline notifies whoever made the assignment. Stretch, after G1.10 in the cut order — recorded in §0.5 unless the owner promotes it.
- **Volunteer message language** (Agent 4): messages are English-only and no volunteer language is stored. Joins the existing localization deferral in §0.5.
- **Auto-fill sends sequentially** (Agent 2): fine at MVP scale; §0.5.
- The token-response update's missing row-count check (Agent 4) is folded into P1's row-count checks.

## 7. Execution order

P1 (migration and reads) → P3 → P4 → P2 → P5 → P6 → P7, then full verification, the Documenter, and the PR.
