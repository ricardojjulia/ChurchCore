# Council Review 26 — Agents 1 and 4 (combined): Database & API, Feature

**Scope:** `fix/profile-id-guards-s9`, commit `3ab51df` vs `main` (S9). Read-only; local DB selects; `eslint --stdin` probes (no files written).

## 1. Definition of done

- **(a) Rename `profile.id`: Partial, acceptable.** Lint bans the expression; the six audit-actor uses moved to `session.userId`. The selector catches `session.profile.id` and `session?.profile?.id`; it misses `const { profile } = session; profile.id`, aliases and `profile["id"]`, and flags any `x.profile.id` (e.g. a future `shift.profile.id` join). No bypass exists in the code today. A type rename would close every gap at compile time.
- **(b) One resolver: Partial.** `resolveActiveChurchProfileId` and `resolveSessionProfileId` return `session.churchProfileId`, equivalent to the removed queries (preview, control plane, platform admin, merged). About 9 other per-call lookups remain (`requirePastorProfileContext`, `requireChurchAdminProfileContext`, `actions.ts:2644`, `daily-desk-actions.ts:62`, `church-admin-actions.ts:202`, `elders-actions.ts:64`, `pastor-portal-data.ts:389`, `elders-data.ts:357`, `data-rights-actions.ts:171`), several without a `merged_at` filter. `lib/church-profile-id.ts:9` describes the old resolver.
- **(c) `limit 1` self policies: Done, by uniqueness.** `profiles_user_id_uidx` is unique; 25 policies use `limit 1`. But `merge_duplicate_profile` never moves or clears the source's `user_id`, so a merged self-signup login is orphaned (pre-existing).
- **(d) Time-zone params required: Done.**
- **(e) Member updates' row counts: Partial (inferred done through S8).**

## 2. Session construction

`merged_at` and `churchProfileIdFor` are correct; callers handle null. The local dual-path's `merged: false` comment is false (that query doesn't filter `merged_at`).

## 3. Top findings

1. **(Verified, High, outside S9's diff)** `merge_duplicate_profile` compares `church_memberships.user_id` (login id) with `actor_profile_id` (profile id): every real admin fails the check, and its membership deactivation (`user_id = source_profile_id`) never matches. The S7 mix-up in SQL, invisible to the lint.
2. **(Verified, Medium)** "One resolver" is incomplete (about 9 lookups remain).
3. **(Verified, Medium)** The lint's gaps and false positives.
4. **(Verified, Medium, pre-existing)** A merge leaves `user_id` on the merged profile.
5. **(Verified, Low)** The local-path comment and `lib/church-profile-id.ts:9` are stale.

MVP readiness stays at 72/100 until finding 1 is fixed or tracked.
