# Council Review 27 — Synthesis

**Date:** 2026-09-30
**Branch audited:** `fix/hq-role-tenancy-s5`, commit `43d0305`
**Base branch:** `main` (`638178e`)
**Roadmap item:** S5, `/hq` role source and tenancy, and the profile self-edit lock (Council Reviews 18, 21, 22)

## §0 Scope Note

Diff-scoped, two combined agents. Both were read-only (probes in `BEGIN … ROLLBACK`), and the tree was clean afterwards. The owner decided before the build that `/hq` is platform-staff only, which supersedes the per-church tenancy in the tracker row.

## 1. Consensus

- **S5's core holds (both).**
  - A member can't insert profiles, write memberships or `platform_admins`, or change the locked columns.
  - No member-facing save writes a locked column, and staff flows and server-side admin writes are unaffected.
  - `current_user_role()` reads memberships.
  - Removing the `profiles.role` fallback strands no user, and it closes a pre-approval access path.
- **`/api/ai` isn't platform-gated (both; verified by me).** It checks only for a signed-in user. Any member of any church can spend Anthropic credit on the HQ advisor, and its `hq_sessions` log insert now fails silently.
- **The exemption is wider than the lock intends (both).** The exemption uses `can_manage_church`, which includes pastor and ministry_leader. So they can set their own `safety_clearance_date`, `data_delete_approved_*` and `is_pastoral`. That self-set clearance feeds the clearance report.

## 2. Findings verified during synthesis

1. **Critical: anyone with the public key could erase any member's personal data (Agent 1+4; verified by me).**
   - The flaw: `erase_profile_pii` is SECURITY DEFINER, was executable by `anon`, and authorized the actor named in its `actor_profile_id` argument. It's the same pattern ADR 0024 was written for last round.
   - A sweep of every SECURITY DEFINER function found two more that `anon` could run with arguments: `refresh_profile_membership_snapshot` (rewrite any user's snapshot) and `generate_member_number`.
   - **Fixed ahead of approval,** as a security issue, in migration `20260930020000`:
     - the actor is `auth.uid()`, and the audit records it;
     - `anon` can't execute `erase_profile_pii` or `generate_member_number`;
     - nobody can call `refresh_profile_membership_snapshot` directly (the sync trigger runs as the owner).
   - DB tests: an admin erases; a member naming an admin can't; signed-out callers have no execute privilege.
2. **High: a member could take over another household (Agent 1+4).** Verified: `family_id` isn't locked, and the family policies and member household checks trust it.
3. **A church admin's self-demotion fails with a misleading message (Agent 1+4).** Verified: the membership snapshot sync runs under the demoted admin's uid, after `can_manage_church` has become false.
4. **Stale sweep entry (Agents 2+3).** `KNOWN_BUGS["secretary /hq"]` blames the old `profiles.role` gate and skips the denied assertions.
5. **Local environment fault, found while testing.** In the local Supabase image, calling a function `anon` may not execute crashes the Postgres backend (recovery mode) instead of returning "permission denied". The DB tests check execute privileges through the catalog instead. The hosted service is not affected by our code; the fault is in the local image.

## 3. Corrections

- **Our own ADR 0024 (last round) should have prompted this sweep.** It named the pattern but checked only the function in hand; the second instance sat beside it. Ninth consecutive round with a miss in our own work.
- No agent claim was found wrong.

## 4. Score

**74/100** once these land (Agent 1+4 held S5 at 73 pending finding 1). The member self-promotion and pre-approval access paths are closed, `/hq` is no longer cross-tenant, and the anon-key erase hole is closed.

## 5. Proposed prompts

- **P1 — `erase_profile_pii` and the SECURITY DEFINER sweep.** Done on the branch, for approval (§2.1).
- **P2 — Lock `family_id` too.** A member can't move themselves into another household; joining one stays a staff action.
- **P3 — Gate `/api/ai`** on `is_platform_admin`, like `/hq`.
- **P4 — Narrow the exemption.** Only church admins and platform admins may change their own protected columns, per the owner's decision below. Allow the change when it comes from the membership snapshot sync, which fixes the misleading self-demotion error.
- **P5 — Clean-ups.** Remove the stale `KNOWN_BUGS["secretary /hq"]` entry and the dead role branches in `app/hq/page.tsx`.

## 6. Tracker

- The `profiles.role` snapshot still collapses secretary to `member_volunteer`. It's informational only now; §0.5.
- `current_user_role()` has no callers left and can be dropped later; §0.5.
- The local image's anon-permission crash: noted in `docs/testing.md`, no row.
