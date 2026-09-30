# Council Review 26 — Synthesis

**Date:** 2026-09-30
**Branch audited:** `fix/profile-id-guards-s9`, commit `3ab51df`
**Base branch:** `main` (`8779048`)
**Roadmap item:** S9, guards so the login-id / profile-id mix-up can't come back

## §0 Scope Note

Diff-scoped. Two combined agents ran: Database & API with Feature, and Route & Page with UX & Shell. The diff is small, and each report says it was combined. Both were told to write nothing in the repo, after Review 25's probe-file breach. Neither wrote anything; the tree was confirmed clean.

## 1. Consensus

- **S9's changes are correct (both).**
  - The lint rule works and its message is clear.
  - The six audit-actor uses now read the login id.
  - `resolveActiveChurchProfileId` and `resolveSessionProfileId` equal the session's value in every context: preview, control plane, a platform admin viewing a church, and merged profiles.
  - The time-zone parameters are required.
  - `profiles.user_id` is unique, which resolves the `limit 1` policy concern.
- **Two clauses are only partial (Agents 1+4).**
  - About 9 other per-call profile lookups remain, several without a `merged_at` filter.
  - The lint misses destructuring and aliases, and flags any `x.profile.id`, not just a session's.

## 2. Findings verified during synthesis

1. **`merge_duplicate_profile` was a live privilege escalation, and never worked (Agents 1+4; verified by me, and a third problem found while fixing).** The function is `SECURITY DEFINER` and was executable by `anon` and `authenticated`.
   - **The escalation:** its admin check compared `church_memberships.user_id` (a login id) with its `actor_profile_id` argument (a profile id). Real admins always failed. Anyone passing an admin's *login id* as the actor passed, and could merge, which hides, any non-staff profile in that church.
   - **Never worked, reason 1:** it still read `emergency_contact_*` off `profiles`, which moved to `profile_sensitive_fields` in April. Every merge failed with "record has no field".
   - **Never worked, reason 2:** a kept profile without an email took the duplicate's while the duplicate still held it, violating `profiles_email_key`.
   - **Also wrong:** the duplicate's memberships were deactivated by profile id, so never.
   - **Fixed ahead of approval,** as a security issue: migration `20260930000000` takes the actor from `auth.uid()` (and `actor_profile_id` must be the caller's own), revokes `anon`/`PUBLIC`, merges the sensitive fields, releases the email first, and deactivates memberships by login id. DB test: an admin merges; a member can't, even passing an admin's login or profile id; anon can't execute.
2. **Two pastoral-read audit events record a profile id as the actor (Agents 2+3).** Verified: `lib/pastor-portal-data.ts:316` and `:505`. The lint can't see them because the variable isn't a session.
3. **Stale comments (both).** The local path's `merged: false` note, and `lib/church-profile-id.ts:9`.

## 3. Corrections

- **Our own S9 commit message overclaimed.** It said the audit actors now read the login id, but two pastoral ones don't, and it called the resolver consolidation "one source of truth" while about 9 lookups remain. Eighth consecutive round with an error in our own write-up.
- No agent claim was found wrong.

## 4. Score

**73/100** once the merge fix lands: a live escalation is closed and an admin tool that never worked now works. Otherwise 72 (Agent 1+4's view before the fix).

## 5. Proposed prompts

- **P1 — `merge_duplicate_profile` (done on the branch, for approval).** As described in §2.1.
- **P2 — Audit actors.** The two pastoral reads use `session.userId`.
- **P3 — Finish "one resolver".** The remaining per-call lookups read `session.churchProfileId` (`requirePastorProfileContext`, `requireChurchAdminProfileContext`, daily desk, church admin, elders, pastor portal, data rights, `actions.ts:2644`).
- **P4 — Lint.**
  - Narrow the selector to a session's `profile.id`, so it no longer flags a `profile` embed.
  - Add a second selector for destructuring `profile` from a session.
- **P5 — Small fixes.** Correct the stale comments. The demo profile save returns an error result instead of throwing.

## 6. Tracker

- **A merge leaves the login on the merged profile** (pre-existing). The person's login then has no church profile. Moving `user_id` to the kept profile, when it has none, is a product decision. New §0.5 row, or a Must if the owner prefers.
- **Local dual-path merged-profile parity:** dead code under the Supabase-only mandate; noted, no row.
