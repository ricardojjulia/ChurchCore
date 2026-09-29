# Council Review 23 — Agent 1: Database & API

**Scope:** `feat/assignment-notifications-g1-5`, commits `83b7a2d` + `a99cfea` vs `main` (G1.5, assignment notifications). Read-only; local DB selects only.

## 1. Exports from the `"use server"` module

Verified: `notifyVolunteerOfShift`, `ensureShiftToken` and `describeOutcomeForLog` in `app/app/volunteer-actions.ts` are **not exported**, so none is POST-callable. The branch adds no action exports; it widens the returns of `assignVolunteerAction`, `sendVolunteerReminderAction` and `applyPlanAutoFillAction`, all still gated by `requireServicePlanWriteAccess()` (church-admin, pastor, ministry-leader — the same set as `can_manage_church()`). `lib/volunteer-notifications.ts` is pure. `sendWithSuppression` and `queueCommunicationAction` (`server-only`) follow ADR 0022.

## 2. Tokens

- No separate table: `volunteer_shifts.confirmation_token`, unique index, 128 bits from `crypto.randomBytes(16)`.
- `tokenExpiryFor`: 00:00 UTC on service date + 8 days (end of day +7), never under now + 7 days. An unexpired token is reused and only extended; the update is scoped by `id` and `church_id`.
- The public lookup uses the admin client on the token alone and checks expiry — fine given uniqueness and entropy.
- **Problem (verified in the DB):** `volunteer_shifts_select_member_scope` is `belongs_to_church(church_id)` and `authenticated` has SELECT on `confirmation_token`, so **any member can read every volunteer's confirm token in their church** through PostgREST. Pre-existing, but G1.5 now puts a token on every shift (0 of 7 local shifts had one before).

## 3. Communications, consent and ids

- Verified: `sendWithSuppression` → `queueCommunicationAction`; suppression and consent lookups use the admin client scoped by `church_id`; consent fails closed; `contact_allowed = false` and `preferred_contact_method = 'none'` skip before any call.
- Ids correct: `communication_logs.sent_by` = `session.churchProfileId`; `recipient_id` = `shift.assigned_user_id` (a profile id); `volunteer_shift_reminders.sent_by` = `session.churchProfileId`.
- **Gap (verified):** `chooseChannel` picks SMS for `preferred_contact_method = 'sms'`, but `sms_opt_in` defaults to false and a missing preferences row counts as SMS off. All 5 local SMS-preferring profiles have no preferences row, so each is skipped as "opted out of texts" with **no email fallback**. Compliant, but those volunteers never hear about their shift.

## 4. Failure behavior

Verified: the insert happens first; `notifyVolunteerOfShift` never throws (a missing `UNSUBSCRIBE_SECRET` becomes `{status: "failed"}`); the assignment is never rolled back. In Remind, the send happens **before** the `volunteer_shift_reminders` insert; if the insert fails the action returns `ok: false` although the email went out, so a retry sends twice.

## 5. Tests

`assignment-notification-actions.test.ts` covers token format, expiry, reuse and extension, the skip/suppressed/throw paths and Remind sending. **Its `SESSION` has no `churchProfileId`** and `sent_by` is never asserted, and `sendWithSuppression` is mocked, so a return to `session.profile.id` wouldn't be caught by unit tests. The e2e journey guards it indirectly (the local admin's login and profile ids differ, so a wrong `sent_by` breaks the log FK and the journey). Step 4 only checks that `suggested-volunteers` is visible. No test covers SMS preference vs. SMS opt-in.

## 6. Top 5

1. **Confirm tokens readable by every member** (verified). A member queries `volunteer_shifts?select=confirmation_token`, then opens `/portal/volunteer/confirm/<token>` to decline someone else's shift, or `/portal/volunteer/schedule/<token>` to read their schedule. Fix before merge: revoke member SELECT on the column.
2. **SMS-preferring volunteers never notified** (verified in source and DB).
3. **"Email sent." is false with no provider configured** (verified): the SendGrid and Twilio adapters return `accepted: true` with a stub id when keys are missing. Pre-existing; G1.5 is the first feature to show it to an admin as fact.
4. **Unit tests don't distinguish login id from profile id** (verified).
5. **Remind can send twice** (verified). Minor: `ensureShiftToken` doesn't check its row count; the e2e cleanup deletes `communication_logs` by subject across churches (local only).
