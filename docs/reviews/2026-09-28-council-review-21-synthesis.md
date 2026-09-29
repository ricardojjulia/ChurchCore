# Council Review 21 — Synthesis

**Date:** 2026-09-28
**Branch audited:** `fix/session-church-profile-id` (draft PR #158), commit `14461db`
**Base branch:** `main` (`321d617`)
**Roadmap item:** S7, the signed-in person's church profile id (`DEVELOPMENT_PLAN.md` §0.3)

## §0 Scope Note

S7 was found on 2026-09-28 by G1.5's e2e journey. The communication-log writes failed `communication_logs_sent_by_fkey`, and the cause turned out to be app-wide. `session.profile.id` is the **auth (login) user id**. It has never been a church `profiles.id`: since `20260420000000`, `handle_new_user()` has created profiles with `gen_random_uuid()`.

The commit adds `session.churchProfileId`, switches 51 usages, null-guards the "act as myself" paths, and fixes member shift responses. Those responses silently matched 0 rows, because members have no UPDATE policy on `volunteer_shifts`. The commit touches 76 files, so it needs a full Council pass.

## 1. Cross-Agent Consensus

- **The core fix is correct (Agents 1 and 2, verified).** All 51 switched usages now write a profile id into a nullable column that references `profiles`. None lands in an `auth.users` column. The kept audit-actor usages are correct, because `audit_log.actor_id` holds `auth.uid()`. No null reaches a NOT NULL column.
- **The bug's reach was far larger than "member schedule" (Agent 4, verified against the schema).** Every non-platform user created since April hit it. Admin create flows violated their `profiles` foreign keys: service plans, songs, reminders, hours, communication templates and suppressions, communication logs, finance journals and budgets, GL posting, group meetings and attendance, operations documents and onboarding, shepherd workflows. The AI audit trail (`ai_interactions`) was never written. S7 fixes all of these.
- **The same bug class remains in places the grep didn't catch (Agents 1 and 4, verified by me):**
  - `lib/actions/erasure.ts:36` (misclassified in S7 as an audit actor);
  - localization governance uses `session.userId` as a profile id;
  - the data export filters `church_memberships.profile_id`, a column that doesn't exist.
- **A second class: member writes RLS doesn't allow (Agents 1 and 4, verified in `pg_policies`).**
  - **Giving:** `donations` INSERT and UPDATE are management-only, so member giving fails. `initiateDonationAction` creates a Stripe PaymentIntent **before** the failing insert.
  - **Check-in and group join:** members have no INSERT policy on `attendance` or `group_members`.
  - **RSVPs:** the `event_rsvps` policy compares a profile id with `auth.uid()`, so member RSVPs are rejected.
  - **Registrations:** capacity is counted through an RLS-filtered read, and the payments upsert is admin-only.
- **A thrown error crashes a page (Agents 2 and 3, verified).** `joinGroupAction` now throws via `requireChurchProfileId`, and `member-groups-browser.tsx:33` has no catch. Other throwing actions show misleading or generic text.
- **Privilege escalation into `/hq` (Agent 1, verified by me).**
  - `profiles_update_self`, plus column UPDATE grants to `authenticated`, lets a member change their own `role`, `church_id`, `user_id` and `membership_status`.
  - `current_user_role()` trusts `profiles.role`, and it gates every `hq_*` policy and the `/hq` pages. A member who sets `role = 'church_admin'` becomes an `/hq` admin, and the `hq_*` tables have no `church_id`.
  - `lib/auth.ts` also builds a membership from `profiles.role` when a user has none.
  - `can_manage_church`, `can_access_pastoral_data` and the other church RLS helpers read `church_memberships`, so they're **not** affected.

## 2. Corrections and verifications during synthesis

1. **S7's own classification was wrong once.** `erasure.ts:36` was kept on the login id as an "audit actor", but the same variable drives the self-erasure guard and the `erase_profile_pii` actor lookup. So erasure always fails, and the guard is dead.
2. **Agent 2: "the 115 mechanical fixtures prove nothing". Accepted.** They set `churchProfileId === profile.id`, so they'd pass with either id. S7's evidence for the switched modules comes from the classification against live foreign keys (Agent 1) and from the member e2e journeys, not from those fixtures. Distinct-id tests are added for the highest-risk modules (P6).
3. **Agent 4 re-bases past scores: accepted.**
   - The e2e sweep only rendered pages; it never exercised writes as a non-platform user.
   - The true Review 20 figure is about **64/100**, and **67/100** after S7.
   - Getting back to 71 or more needs S8.
   - This is the third round running where a score or claim was revised downward because the evidence behind it only proved that pages render (see the `feedback_council_synthesis_scrutiny` memory).
4. **Our own claim that G1.4's signed-in blockouts "work" was wrong.** Only the volunteer-link path was exercised end to end.

## 3. ADR Assessment

**No new ADR.** `churchProfileId` makes an existing distinction explicit. `lib/church-profile.ts` already had `resolveActiveChurchProfileId`, which few places used. The admin-client-with-server-side-scoping pattern for member writes is ADR 0022's.

## 4. Implementation Prompts (proposed; need owner approval)

### In this branch: finish S7 (the same id-confusion class)
- **P1 — Erasure.** The self guard and the `erase_profile_pii` actor use `churchProfileId`, and the audit actor keeps the login id. A test with *distinct* ids.
- **P2 — Localization governance.** `assigned_by` and the reviewer identity use `churchProfileId`. Tests.
- **P3 — Data export.** Memberships are read by `user_id = session.userId`. A test.
- **P4 — No throws to the UI.**
  - Actions return `{ ok: false, code: "no_profile" }` instead of throwing: group join, donation, data rights, elders AI (checked *before* its `try`), shepherd.
  - Member-schedule responses return codes too (`no_profile`, `not_assigned`), translated in en, es and es-PR, and only for shifts that are still upcoming and not declined by an admin.
  - The self blockout panel gets its own `errNoProfile` message.
- **P5 — Member schedule display.**
  - The date falls back to `startsAt` when there's no plan.
  - Dates use es-PR properly, and the time range is shown.
  - Each card has its own pending state.
  - A translated notice appears when the person has no profile in this church.
- **P6 — Tests that tell the ids apart.** Communications (`sent_by`), finance (`created_by`), erasure and localization, each with login id ≠ church profile id. The synthetic cron and retry sessions carry an explicit `churchProfileId`.

### New tracker rows
- **S8 (Must, 2 days, Week 1 → finishing early Week 2; before G1.5 resumes and before G3.1): member writes vs. RLS.**
  - Audit every member-reachable write and fix each: giving (and create the PaymentIntent only after the row can be written), check-in, group join, RSVP policy, registration capacity and payments, and the data-rights 0-row checks.
  - Add a member-JWT DB test harness that runs each member action's writes as `authenticated`.
- **S5 moves to Week 2 and gains:**
  - column protection on `profiles` (members can't change their own `role`, `church_id`, `user_id` or `membership_status`);
  - `current_user_role()` reading `church_memberships` instead of `profiles`;
  - removing the `profiles.role` membership fallback in `lib/auth.ts`.
- **S9 (Must, 0.5 day, Week 2):**
  - rename `DemoProfile.id` for sessions to make "login id" explicit;
  - a lint rule against `session.profile.id` in `app/` and `lib/`;
  - one resolver instead of two;
  - require 0-row checks on member updates.
- **T3** gains a lens: a non-platform user creates through the UI, for every create action.
- **Capacity:** S8 and S9 add 2.5 Must days, making 36 days against 25 available, **about 44% over**. The owner should decide at M1 (Oct 2) between moving the date and cutting scope.

## 5. Resolution (owner approved 2026-09-28)

P1–P6 landed on this branch.

**P1 — Erasure.** The self guard and the `erase_profile_pii` actor use `churchProfileId`. An admin with no church profile is refused before any database call. The erasure test fixture now uses realistic, distinct ids; with equal ids it had hidden the bug.

**P2 — Localization.** `assigned_by` and the reviewer identity use `churchProfileId`, returning `no_profile` without one. The audit actor stays the login id. Tests prove both.

**P3 — Data export.** Memberships are read by `user_id = session.userId`, because `church_memberships` has no `profile_id`. A test pins both ids.

**P4 — Returned errors instead of throws.**
- `joinGroupAction` returns `{ ok: false, error }`, so it no longer reaches the error page.
- Elders AI checks for a church profile *before* its `try`, so it no longer says "AI temporarily unavailable".
- `respondToShiftAction` returns codes (`no_profile`, `not_assigned`), accepts only shifts that haven't happened yet, and logs database errors instead of showing them.
- The blockout panel has its own `errNoProfile` message.
- Scope note: donations and data-rights errors move to S8, which rewrites those writes anyway. Shepherd keeps its caught throw (admin-only; only a platform admin viewing a tenant hits it).

**P5 — Member schedule.**
- The date falls back to the shift's own date when there's no plan, so no more "Invalid Date".
- Dates use en, es and es-PR, and the time range is shown.
- The error codes are translated in all three locales.
- Each card has its own pending state.
- A translated notice appears when the viewer has no church profile.

**P6 — Tests that tell the ids apart.**
- **109 test fixtures now use a login id distinct from the church profile id.** The whole suite passes. The only assertions that had to change were two audit-actor ones (`acknowledgeBurnoutAlertAction`), which had been asserting the wrong id, since audit actors are login ids. This is the evidence Agent 2 asked for.
- `queue-communication` asserts `sent_by` is the church profile id.
- The cron and retry synthetic sessions set `churchProfileId: null` explicitly.

**Tracker:**
- S8 (member writes vs RLS, 2 days) and S9 (regression guards, 0.5 day) added to Week 1.
- S5 moved to Week 2, with the profile-column lock, `current_user_role()` from memberships, and no `profiles.role` fallback.
- T3 gains a lens for non-platform users creating through the UI.
- G3.1 marked as depending on S8.
- MVP readiness is 67/100: re-based to 64, then +3 for S7.
- Capacity: 36 Must days, about 44% over. The owner decides date vs. scope at M1 (Oct 2).

**Also caught during verification:** `test:surfaces` flagged the `generateDataExportAction` waiver as stale, now that it's tested, and it was removed.

**Verification:**
- `npx tsc --noEmit`: clean.
- `npm run lint`: 0 errors (1 pre-existing warning).
- `npx vitest run`: 154 files, 1,807 passed.
- `npm run test:db`: 34 passed.
- `npm run test:surfaces`: OK.
- `npm run lint:migrations`: PASS.
- `npm run test:e2e:local`: 124 passed, covering the member self-service journeys (schedule and confirm, blocked dates), the rotation, link and notification-free journeys, and the member, volunteers, groups, localization and data-rights pages × every role.

## 6. Execution Order (as planned)

1. P1–P6 in this branch.
2. Verify: tsc, lint, unit, DB, surfaces, and e2e (member self-service, rotation, full sweep).
3. The Documenter.
4. Merge S7.
5. Then S8, before G1.5 resumes (G1.5 is built and paused on its branch).
