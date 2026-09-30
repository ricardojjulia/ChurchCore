# ADR 0024 — A `SECURITY DEFINER` Function Takes Its Actor from `auth.uid()`, Never an Argument

**Status:** Accepted
**Date:** 2026-09-30
**Authors:** S9, Council Review 26

---

## Context

`public.merge_duplicate_profile(source_profile_id, target_profile_id, actor_profile_id)` is `SECURITY DEFINER` and was executable by `anon` and `authenticated`. It authorized the merge by checking `actor_profile_id` — an argument the caller supplies — against `church_memberships`:

```sql
select exists (
  select 1 from public.church_memberships
  where church_id = target_profile.church_id
    and user_id = actor_profile_id   -- a login id column, compared with a profile id argument
    and is_active
    and role in ('church_admin', 'pastor')
) into actor_can_manage;
```

`church_memberships.user_id` is a login (`auth.users`) id; `actor_profile_id` is a `public.profiles.id`. The two are different values for every real user (see `arch_session_profile_ids`, ADR-adjacent memory, and the S7/S8/S9 line of fixes this same round's fix continues). The consequence wasn't a missed edge case — it inverted the check:

- A real admin's own profile id never matches their own `church_memberships.user_id`, so **every real admin failed** the check the function exists to enforce.
- Anyone who passed an admin's **login** id as `actor_profile_id` **passed** the check — a `SECURITY DEFINER` function trusted a value the caller controls, and the value that happened to satisfy it was a real credential, not the caller's own.

Because the function runs as its owner (bypassing RLS) and was grantable to `anon`, this was a live privilege escalation: an unauthenticated caller with the right login id could merge — meaning hide — any non-staff profile in a church.

This is the same *shape* of bug S7, S8 and S9 have each found and fixed at the TypeScript/session layer (a login id substituted for a profile id, or vice versa), but S9's lint rule is JavaScript/TypeScript-only and has no reach into SQL function bodies. A `SECURITY DEFINER` function is a second, independent place the same mix-up can hide, and it's a worse place for it: it already runs with elevated privilege by design.

## Decision

**A `SECURITY DEFINER` function determines who is acting from `auth.uid()`, called inside the function body, never from an argument the caller supplies.**

- If the function needs to know the caller's own profile id for some other purpose (e.g. to include in the call signature for compatibility, or because a caller-supplied value is independently useful), it may still take that value as an argument — but it must not be the value trusted for authorization. Validate it against `auth.uid()` instead of trusting it (`merge_duplicate_profile` keeps `actor_profile_id` in its signature, but now requires `actor.user_id = auth.uid()` before using it for anything).
- Authorization checks inside the function body compare `auth.uid()` against whatever table actually answers "is this login allowed to do this" — for `merge_duplicate_profile`, that's `church_memberships.user_id = auth.uid()`.
- `anon` and `PUBLIC` execute grants on a `SECURITY DEFINER` function are revoked by default; only `authenticated` (or a narrower role, if the function has one) gets `EXECUTE`. A function reachable by `anon` is reachable by anyone with the project's public anon key, regardless of any argument-based check.

## Consequences

- `merge_duplicate_profile` (migration `20260930000000`) is the first function this ADR applies to; it is the reference implementation.
- Any future `SECURITY DEFINER` function in this repo is written and reviewed against this rule from the start. A Council database/API agent checks new or changed `SECURITY DEFINER` functions for this pattern specifically — an argument named like an actor/identity column is a prompt to check whether it's trusted or merely carried.
- This doesn't replace RLS or the scoped-admin-client pattern (ADR 0022); it's a narrower rule for the smaller set of functions that run with elevated privilege via `SECURITY DEFINER` rather than through a client scoped and checked in application code.
- `lib/eslint.config.mjs`'s S9 lint rule and this ADR cover two different layers of the same failure class (application-layer session handling vs. database-function authorization) — neither substitutes for the other, and a future audit should check both.
