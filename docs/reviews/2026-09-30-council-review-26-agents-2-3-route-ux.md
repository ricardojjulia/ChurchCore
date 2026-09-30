# Council Review 26 — Agents 2 and 3 (combined): Route & Page, UX & Shell

**Scope:** `fix/profile-id-guards-s9`, commit `3ab51df` vs `main` (S9). Read-only; `eslint .`, `tsc --noEmit` and `test:surfaces` run, nothing written.

## 1. Resolver callers

22 call sites across 11 files. Preview sessions, a platform admin viewing a church and the control plane behave as before (verified). Merged profiles now resolve to null, which is the correct outcome; the old per-call query already returned null. **One regression on the local dual-path:** `loadSupabaseAppDataFromLocalDb` doesn't select `merged_at` and hard-codes `merged: false`, and its comment ("merged profiles aren't selected here") is wrong. Low severity (deprecated path). `lib/church-profile-id.ts:9-10` is stale.

## 2. New throws

The demo-mode save throw in `updateMemberProfileAction` is caught by `member-profile-edit.tsx:70-96` and shown with `setServerError` (verified). In production, Next.js hides a server-action error's message, so users probably see a generic English message (inferred); a returned result would be better. The file uses the same pattern throughout.

## 3. Lint rule

`eslint .` exits 0; the message is clear. False-positive risk: the selector matches any `X.profile.id`, and PostgREST embeds named `profile` exist (`communications-data.ts:248`). It misses destructuring and bracket access, and doesn't cover `scripts/`, `tests/`, `supabase/`.

## 4. Surfaces

OK; no manifest change needed.

## 5. Top issues

1. **(Medium, verified)** Two `READ_PASTORAL` audit events still put a church `profiles.id` in `actorId` (`lib/pastor-portal-data.ts:316, 505`); the lint can't see them.
2. (Low-Med, inferred) The demo-save throw shows a generic, English-only message in production.
3. (Low, verified) The local fallback's hard-coded `merged: false`.
4. (Low, verified) The lint selector's breadth and gaps.
5. (Trivial) Stale comment at `lib/church-profile-id.ts:10`.
6. (Pre-existing, inferred) The merge function never moves `user_id` to the target, so a merged login is left with no church profile.
