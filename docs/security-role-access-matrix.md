# Security Role-Access Matrix

> **Machine-checked source of truth:** `tests/coverage-manifest.json` records the allowed roles for every page, and the CI page×role sweep (`tests/e2e/page-role-sweep.spec.ts`) enforces them on every PR. This document remains the human narrative for high-sensitivity surfaces; when the two disagree, the manifest and its sweep are what CI checks.

Date: 2026-06-02
Status: Active evidence index for competitive-readiness Finding 6.

## Purpose

This matrix records allowed roles and verification evidence for high-sensitivity operational routes and actions.

## Roles

- Control Plane Staff
- ChurchAdmin
- Secretary
- Pastor
- Ministry Leader
- Volunteer
- Member
- Public

## Matrix

| Surface | Allowed roles | Denied roles | Evidence |
| --- | --- | --- | --- |
| ChurchAdmin giving import dry-run action | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | [app/app/church-admin/giving/import/actions.test.ts](../app/app/church-admin/giving/import/actions.test.ts) |
| ChurchAdmin giving import commit action | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | [app/app/church-admin/giving/import/actions.test.ts](../app/app/church-admin/giving/import/actions.test.ts) |
| ChurchAdmin people import route (`/app/church-admin/people/import`) | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | Route gate in [app/app/church-admin/people/import/page.tsx](../app/app/church-admin/people/import/page.tsx) and action tests in [app/app/church-admin/people/import/actions.test.ts](../app/app/church-admin/people/import/actions.test.ts) |
| People import dry-run action | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | [app/app/church-admin/people/import/actions.test.ts](../app/app/church-admin/people/import/actions.test.ts) |
| People import commit action | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | [app/app/church-admin/people/import/actions.test.ts](../app/app/church-admin/people/import/actions.test.ts) |
| ChurchAdmin event registration approval/settings actions | ChurchAdmin, Pastor (approval path) | Ministry Leader, Secretary, Member, Public | [app/app/church-admin-actions.test.ts](../app/app/church-admin-actions.test.ts) |
| Communications retry action (`retryCommunicationAction`) | ChurchAdmin, Pastor, **Secretary** (`commRoleAllowed`) | Ministry Leader, Member, Public | [app/app/communications-actions.test.ts](../app/app/communications-actions.test.ts) |
| `retryAllEligibleAction` (scoped bulk retry) | ChurchAdmin, Pastor, **Secretary** (`commRoleAllowed`) | Ministry Leader, Member, Public | [app/app/communications-actions.test.ts](../app/app/communications-actions.test.ts) — `retryAllEligibleAction` describe block |
| Communications suppression action (`suppressContactAction`) | **ChurchAdmin only** — narrower than the retry gate above | Pastor, Secretary, Ministry Leader, Member, Public | [app/app/communications-actions.test.ts](../app/app/communications-actions.test.ts); UI gating in [components/application/communications-hub.tsx](../components/application/communications-hub.tsx) and [components/application/communications-hub.test.tsx](../components/application/communications-hub.test.tsx) (S1/Council Review 28 — the "Add Suppression" button previously rendered for every role and always failed the action check for non-admins) |
| `communication_logs`, `communication_delivery_events`, `communication_suppressions` RLS reads (S1, Council Review 28) | ChurchAdmin, Pastor, Secretary (`can_manage_communications`) — matches the `/app/communications/*` page gates | Ministry Leader, Member, Public — **and no role has an `authenticated` insert policy on any of the three tables**; every writer (queue, send, compose, cancel, suppress, unsubscribe, the retry and scheduled crons) uses the server-side church-scoped admin client (ADR 0022) | `supabase/migrations/20261001000000_communication_logs_follow_page_gates.sql`; DB tests in [tests/database/communication-logs-access.test.ts](../tests/database/communication-logs-access.test.ts) |
| Communications retry cron (`/api/cron/communications-retry`) | Cron secret only (not role-based) | Any unauthenticated request | [app/api/cron/communications-retry/route.test.ts](../app/api/cron/communications-retry/route.test.ts) |
| `/app/church-admin/attendance/import` | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | Route gate in `app/app/church-admin/attendance/import/page.tsx` |
| `runAttendanceImportDryRunAction` | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | Action gate in `app/app/church-admin/attendance/import/actions.ts` |
| `commitAttendanceImportBatchAction` | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | Action gate in `app/app/church-admin/attendance/import/actions.ts` |
| `/app/church-admin/giving/import` | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | Route gate in `app/app/church-admin/giving/import/page.tsx`; action tests in [app/app/church-admin/giving/import/actions.test.ts](../app/app/church-admin/giving/import/actions.test.ts) |
| `runGivingImportDryRunAction` | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | [app/app/church-admin/giving/import/actions.test.ts](../app/app/church-admin/giving/import/actions.test.ts) |
| `commitGivingImportBatchAction` | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | [app/app/church-admin/giving/import/actions.test.ts](../app/app/church-admin/giving/import/actions.test.ts) |
| `/app/church-admin/events/import` | ChurchAdmin | Pastor, Ministry Leader, Secretary, Member, Public | Route gate in `app/app/church-admin/events/import/page.tsx` |
| `handleChargeRefunded` (Stripe webhook) | No user role — service-only; verified by Stripe webhook signature | Any authenticated user role (not applicable; route is service-level) | Webhook signature verification in `app/api/webhooks/stripe/route.ts`; available in Supabase production mode |
| Member event registration action | Member | ChurchAdmin, Pastor, Ministry Leader, Secretary, Public | [app/app/member-actions.test.ts](../app/app/member-actions.test.ts) |
| Public event registration action | Public | N/A (route intentionally public) | Action guards in [app/portal/actions.ts](../app/portal/actions.ts) and route scoping in [app/portal/events/register/page.tsx](../app/portal/events/register/page.tsx) |
| `merge_duplicate_profile` (SQL `SECURITY DEFINER` function) | ChurchAdmin, Pastor — checked from `church_memberships.user_id = auth.uid()` inside the function body | Member, Secretary, Ministry Leader, Public/anon (execute revoked from `anon`/`PUBLIC`) | `supabase/migrations/20260930000000_merge_duplicate_profile_actor_from_auth.sql`; DB tests in `tests/database/profile-merge-auth.test.ts` |
| `erase_profile_pii` (SQL `SECURITY DEFINER` function) | ChurchAdmin (church-scoped), platform admins — actor is `auth.uid()`, checked against `church_memberships`/`is_platform_admin()` inside the function body | Member, Secretary, Pastor, Ministry Leader, Public/anon (execute revoked from `anon`/`PUBLIC`; privileged staff profiles can't be erased with this tool) | `supabase/migrations/20260930020000_erase_profile_pii_actor_from_auth.sql`; DB tests in `tests/database/profile-merge-auth.test.ts` (Council Review 27 describe block) |
| Profile self-edit lock (`role`, `church_id`, `user_id`, `membership_status`, data-rights approval columns, `is_pastoral`, `safety_clearance_date`, `merged_into_profile_id`, `merged_at`, `member_number`, `family_id` on `profiles`) | ChurchAdmin (own church), platform admins — everyone else's own-row writes to these columns are refused by trigger | Member, Secretary, Pastor, Ministry Leader — for their *own* profile only; staff can still change these columns on someone else's profile through the normal management actions | `supabase/migrations/20260930010000_profiles_self_edit_lock_and_hq_platform_only.sql` (`profiles_block_protected_self_edit` trigger); DB tests in `tests/database/profiles-self-edit-lock.test.ts` |
| `/hq` and its tables (`hq_tasks`, `hq_risks`, `hq_decisions`, `hq_sessions`), and `/api/ai` (the HQ AI advisor) | Platform admins only (`is_platform_admin()`) — owner decision 2026-09-30: `/hq` is ChurchCore's internal project dashboard, not a church feature | ChurchAdmin, Pastor, Secretary, Ministry Leader, Member, Public | `supabase/migrations/20260930010000_profiles_self_edit_lock_and_hq_platform_only.sql` (RLS policies); `app/hq/layout.tsx`, `app/api/ai/route.ts`; DB/route tests in `app/hq/layout.test.tsx`, `app/api/ai/route.test.ts` |
| `/api/reports/custom` (custom CSV export of people, giving and events) | ChurchAdmin, Pastor — checked against `session.appContext.roleId` in the route | Secretary, Ministry Leader, Member, Public (403); signed-out (307 to `/sign-in`, S3/Council Review 30 — previously a 500, since `requireChurchSession`'s redirect was caught inside the route's `try`) | [app/api/reports/custom/route.ts](../app/api/reports/custom/route.ts); [app/api/reports/custom/route.test.ts](../app/api/reports/custom/route.test.ts); e2e in [tests/e2e/api-session-routes.spec.ts](../tests/e2e/api-session-routes.spec.ts) |

## Notes

- Each row is expected to retain a corresponding executable test as behavior evolves.
- Cross-church scope protection remains mandatory for all tenant writes and should be validated in action tests whenever write paths are expanded.
- **A `SECURITY DEFINER` function takes its actor from `auth.uid()`, called inside the function body, never from a caller-supplied argument** (ADR 0024, S9/Council Review 26; second instance and schema sweep, S5/Council Review 27). `merge_duplicate_profile` previously compared a login id (`church_memberships.user_id`) with a caller-supplied `actor_profile_id` argument — every real admin failed the check, and anyone passing an admin's login id as the argument passed it, a live privilege escalation. `erase_profile_pii` had the identical flaw (found a round later, in a sweep of every `SECURITY DEFINER` function prompted by this pattern) — anyone with the public `anon` key could erase any member's personal data by naming an admin's profile id. This is the SQL-function-layer counterpart of the `session.profile.id`-vs-`session.churchProfileId` mix-up the S7–S9 line of fixes closed at the application layer; the lint rule S9 added has no reach into SQL, so a new or changed `SECURITY DEFINER` function needs this checked explicitly — it isn't caught by the app-layer tooling. **When one `SECURITY DEFINER` function is found with this flaw, sweep every other `SECURITY DEFINER` function in the schema for the same pattern before considering the fix complete** — naming the rule in an ADR after fixing one instance did not, by itself, catch the second.
- **Communications retry and suppression are different gates, not one "retry/suppression" boundary (S1, Council Review 28, found by the four-agent re-run after the single-agent pass conflated them).** Retry (`retryCommunicationAction`, `retryAllEligibleAction`, via `commRoleAllowed`) admits ChurchAdmin, Pastor **and Secretary**. Suppression (`suppressContactAction`) admits ChurchAdmin only. Both are narrower than, and separate from, the RLS **read** boundary on `communication_logs`/`communication_delivery_events`/`communication_suppressions` (ChurchAdmin, Pastor, Secretary via `can_manage_communications`, matching the `/app/communications/*` pages) — and separate again from the fact that `authenticated` has no **insert** policy on any of those three tables at all; every write goes through the server-side admin client. Three different gates on related surfaces; don't describe them as one row.
- **`/api/reports/custom`'s giving export deliberately denies ministry leaders a read RLS would allow (S3, Council Review 30).** RLS alone would let a ministry leader read `donations` (church-scoped `can_manage_church`-adjacent policies admit them to several tables), but the route's own role check (`roleId !== "church-admin" && roleId !== "pastor"` → 403) is narrower and denies ministry leaders, secretaries and members outright — the same "app gate is narrower than RLS" pattern noted elsewhere in this matrix (see the communications retry/suppression note above). **Anonymous donors are masked in the export** (`donor_name`/`donor_email` replaced with `"Anonymous"`/blank when `is_anonymous` is true) for every role that can reach the export, including ChurchAdmin and Pastor — matching every giving screen, which already shows "Anonymous" in place of an anonymous donor's identity even to church admins.
- **A member's own `profiles` row has protected columns a trigger locks against self-edit** (S5/Council Review 27): `role`, `church_id`, `user_id`, `membership_status`, the data-rights approval columns, `is_pastoral`, `safety_clearance_date`, `merged_into_profile_id`, `merged_at`, `member_number` and `family_id`. Only a church admin at that church, or a platform admin, may change these on someone's own profile (a change written by the membership-snapshot sync trigger is exempted, so self-demotion doesn't misfire the lock). `/hq` — ChurchCore's internal project dashboard, not a church feature — and `/api/ai` are platform-admin only (owner decision 2026-09-30); every church's admins could previously read and edit `/hq` across all churches.

## WS-4 Evidence Refresh

- Security evidence maintenance was consolidated on 2026-05-29 with the weekly go/no-go docs in [docs/security-assessment.md](docs/security-assessment.md), [docs/security-mitigation-plan.md](docs/security-mitigation-plan.md), and [docs/testing-schema.md](docs/testing-schema.md).
- Completed verification coverage referenced by this matrix includes:
	- `npm run setup:local`
	- `npm run smoke:local`
	- `npm run test:e2e:readiness`
	- `npm run test:e2e:onboarding`
	- `npm run test -- app/app/church-admin/people/import/actions.test.ts app/app/church-admin-actions.test.ts app/app/communications-actions.test.ts app/app/member-actions.test.ts`
	- `npm run lint`
	- `npm run build`

## Phase D Evidence Refresh (2026-06-02)

- Matrix expanded with Phase C surfaces added since the 2026-05-29 snapshot:
  - Attendance import route and actions (`runAttendanceImportDryRunAction`, `commitAttendanceImportBatchAction`) — ChurchAdmin only.
  - Giving import route confirmation rows (`/app/church-admin/giving/import`, `runGivingImportDryRunAction`, `commitGivingImportBatchAction`) — already had action test evidence; route row added explicitly.
  - Events import route (`/app/church-admin/events/import`) — ChurchAdmin only.
  - `retryAllEligibleAction` — existing row confirmed; ChurchAdmin and Pastor allowed, consistent with communications retry boundary.
  - `handleChargeRefunded` (Stripe webhook) — service-only, no user role; now available in Supabase production mode with signature verification.
- All new rows follow the existing format: surface name, allowed roles, denied roles, evidence reference.
- Cross-church tenant scope protection applies to all import commit actions — no import write may cross church boundaries.
