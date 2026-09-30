# Council Review 27 — Agents 1 and 4 (combined): Database & API, Feature

**Scope:** `fix/hq-role-tenancy-s5`, commit `43d0305` vs `main` (S5). No repo writes; probes run as `BEGIN … ROLLBACK` against local Supabase. The S5 DB tests pass (11/11) and `app/hq/layout.test.tsx`.

## 1. The self-edit trigger and other ways to escalate

- INSERT of a new profile: blocked (only `profiles_manage_management_scope` allows INSERT).
- Self-writes to `church_memberships`: blocked (a member inserting their own `church_admin` membership fails RLS). `platform_admins` has only SELECT-self. RLS is on for all 8 relevant tables.
- **Missing from the lock: `family_id`.** Verified: a member set their own `family_id` to another family, then updated that family's `home_phone` (`families_update_self_scope` trusts `profile.family_id`). Inferred: the same passes the household check in `app/app/member-actions.ts:206/585`, so the member can check in or register another household's people.
- SECURITY DEFINER functions: `auth.uid()` survives them, so the trigger applies inside. `handle_new_user`, `sync_last_attendance`, `sync_ministry_load` and `erase_profile_pii` don't touch locked columns. **The membership snapshot sync breaks one flow** (verified): a church admin without a platform-admin row who removes their own admin role hits the trigger, because the role editor deactivates the other roles first and `can_manage_church` is already false when the snapshot re-syncs. The message is misleading.
- Membership-creation flows (invite approval, add-person, provisioning, seeds) use the admin client (`auth.uid()` null), so none are blocked.

## 2. `current_user_role()` and the removed fallback

Inactive memberships are ignored; with several churches it returns the strongest role across all of them. No policies, functions or app code call it any more (only tests), and `anon` can still execute it. 0 of 17 local users with a church profile lack an active membership, and every membership-creation path writes one. Removing the fallback also stops a pending account-request profile from getting member access before approval. `lib/auth.ts` still derives a display-only `profile.roleId` from `profiles.role` (cosmetic).

## 3. `hq_*` access as a non-platform user

Only `app/api/ai/route.ts`: it checks only that the caller is signed in, so any member gets a paid Anthropic call from the "HQ Governance Advisor", and its `hq_sessions` insert now fails silently.

## 4. Definition of done (with the owner's /hq decision)

/hq gated by `is_platform_admin` — Done. `hq_*` tenancy — Done in its new form (platform-admin only; `/api/ai` the one residual). Profile-role drift — Partial (no longer authoritative, but the snapshot still turns secretary into `member_volunteer`). Column lock — Done (plus `merged_*`, `member_number`). `current_user_role()` from memberships — Done. Fallback dropped — Done. DB test — Done. The local `schema_migrations` table stops at `20260924` (migrations applied by hand locally); the hosted DB needs this migration in owner action O2.

## 5. Top findings

1. **Critical, verified, outside the S5 diff.** Anyone holding only the public anon key can erase any member's PII: `erase_profile_pii(target, actor)` is executable by `anon` and trusts the `actor_profile_id` argument. As `anon`, passing any church admin's profile id erased a member. Same pattern as `merge_duplicate_profile`. Fix: revoke `anon`, derive the actor from `auth.uid()`.
2. **High, verified.** Self-edit of `family_id` lets a member take over another household.
3. **Medium, verified from code.** `/api/ai` isn't limited to platform admins.
4. **Low, verified.** A church admin's self-demotion fails with a misleading message.
5. **Low, verified.** `refresh_profile_membership_snapshot` is executable by `anon` for any user id; the secretary → `member_volunteer` drift remains.

MVP readiness: 73 → 73/100 until finding 1 is fixed.
