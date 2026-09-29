# Council Review 21 — Agent 1: Database & API Audit

**Branch:** `fix/session-church-profile-id` (draft PR #158), commit `14461db` (S7). Checked against live `pg_constraint`, `pg_policies` and `pg_proc` on local Supabase (4202). **[V]** = verified, **[I]** = inferred.

## 1. Classification of the changed usages
- **All 51 switched usages [V]** now write a profile id into a *nullable* column that references `profiles`. None of them lands in a column that references `auth.users`. The one NOT NULL sink, `volunteer_blocked_dates.profile_id`, is guarded before the write.
- **The 7 audit usages that keep the login id are consistent [V].** `audit_log.actor_id` has no foreign key, and the audit triggers write `auth.uid()`.
- **Misclassified: `lib/actions/erasure.ts:36`.** It passes the login id as `actor_profile_id`. `erase_profile_pii` looks that up in `profiles` and finds nothing, so every admin erasure raises "Only church admins may erase profile PII". The `actorProfileId === targetProfileId` self-erase guard can never fire.

## 2. Wrong ids the grep missed
- **Localization governance [V].**
  - `app/app/church-admin/localization/actions.ts:327/334` writes `assignedBy: session.userId` into `localization_review_assignments.assigned_by`. That column is NOT NULL and references `profiles`, so the insert violates the foreign key.
  - Submission compares reviewer `session.userId` with `reviewer_id`, which is a profile id, so every submit fails with `reviewer_not_assigned`.
- **`event_rsvps` [V].** `user_id` references `profiles`, but its policy compares it with `auth.uid()`. So member RSVPs are rejected by RLS. This is a policy bug.
- **Hand-built sessions [I].** The cron (`api/cron/communications-scheduled/route.ts:113`) and retry (`lib/communications/retry-eligible.ts:370`) sessions omit `churchProfileId`, hidden by casts.
- **`resolveActiveChurchProfileId`'s `session.userId` fallback** runs only for preview sessions. It is fine.

## 3. Resolving `churchProfileId`
- `profiles_user_id_uidx` is unique on `user_id`, so `maybeSingle()` can't error. A user in two churches has a profile in only one of them, which is by design.
- Merged profiles aren't filtered [I]. That's theoretical today.
- A platform admin viewing a tenant gets null. No null reaches a NOT NULL column.
- **Sandbox hydrate (local-SQL path):** `id != NULL` now deletes nothing. Before this fix, `id != <login id>` deleted every profile in the church, including the admin's own.

## 4. Member writes
- **`respondToShiftAction`'s admin-client update is safe [V].** It is scoped by id, profile and church, touches only the response columns, and checks the row count.
  - **Gap:** there's no check on the shift's state, so a member can re-confirm a cancelled or past shift.
- **Missing policies [V]:**
  - `donations` INSERT and UPDATE are management-only;
  - `group_members` has no member INSERT;
  - `attendance` has no member INSERT.

## 5. Top findings
1. **Erasure is broken, and the self-erase guard is dead.**
2. **Member giving writes are blocked by RLS,** and `initiateDonationAction` throws *after* creating a Stripe PaymentIntent. Cancelling or confirming a donation silently updates 0 rows.
3. **Localization governance can't be used** (a foreign-key violation, and review submission can never match).
4. **The `event_rsvps` policy compares a profile id with `auth.uid()`.**
5. **Members can update their own `profiles.role`, `church_id`, `user_id` and `membership_status`:** `profiles_update_self` plus column grants allow it. `current_user_role()` trusts `profiles.role`, which is an escalation into `/hq`. `lib/auth.ts` also builds a membership from `profiles.role` for users with no membership. This is pre-existing.

Also broken for members: group join and mobile check-in.
