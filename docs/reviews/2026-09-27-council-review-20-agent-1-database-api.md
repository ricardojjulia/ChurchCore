# Council Review 20 — Agent 1: Database & API Audit

**Branch:** `feat/blockout-dates-g1-4`, diff-scoped to commit `e54a856` (G1.4 blockout dates, plus fixes to the public volunteer link pages). Checked against the diff and live `pg_policies` and indexes on local Supabase (4202). SELECT only; `.env.local` not opened. **[V]** = verified, **[I]** = inferred.

**Verdict:** no blockers. Tenant and profile scoping hold, the `vbd_own` change is correct, and the new code is Supabase-only.

## 1. RLS
- **`vbd_own` is right [V].**
  - It reads "my own profile" and writes only when the row's church is the profile's church.
  - `EXISTS` fixes the arbitrary result of the old `limit 1` for a login with several profiles.
  - The subquery can always see the caller's own profile (`profiles_select_self`).
- **`vbd_manage` is too broad [V/I].**
  - It checks `can_manage_church(church_id)` only. It never checks that `profile_id` belongs to that church.
  - The unique key is `(profile_id, blocked_date)`, with no church.
  - So a church A admin calling PostgREST directly can insert `(A, a church B profile, date)`. That row occupies the slot: church B's later `upsert … ignoreDuplicates` does nothing, the volunteer's blockout never appears in B, and the planner keeps auto-filling them.
  - The same unique violations also let A test whether a B profile has blocked a given day.
  - The app checks the profile's church; the database doesn't.

## 2. Token trust model
- **A token acts only as its own volunteer [V].** It lets its holder act only as the shift's `assigned_user_id` in the shift's `church_id`, both read from the database.
- **Tokens are hard to guess [V].** They are 128-bit random, created only when a reminder is sent, and valid for 14 days. Unassigning deletes the shift row; a profile merge moves shifts.
- **Declined and past shifts keep working [V].** Their tokens still work until they expire. That's acceptable, because it's the same person.
- **A forwarded link reaches more [V].** Exposing each upcoming shift's token on the schedule page means anyone with a forwarded link can respond to every reminded shift. Worth documenting.
- **Writes are bounded [V]:** at most 366 rows per profile, and reasons are capped at 200 characters.

## 3. Correctness
- **Validation and scoping are sound [V].** `expandBlockoutRange` is sound, and removal is scoped to church, profile and day.
- **Re-adding a day is a silent no-op [V].** Re-adding with `ignoreDuplicates` never updates the reason.
- **[I] The warning uses a different day from the planner.** `scheduledOnDays` buckets shifts by the UTC day of `starts_at`, while the planner and the roster use `service_date`. An evening service in UTC−4 is missed. Tied to G1.6.
- **[V] Profile merges lose blocked dates.** A merge moves shifts but not blocked dates, so the merged-away profile's blockouts are lost.

## 4. Performance
- The roster lookup is covered by the unique index.
- The pool's `(church_id, blocked_date)` lookup uses only `vbd_church_id_idx`. A composite index would help at scale.

## 5. Tests
The action tests pin identity, scoping, fake clocks and expired links. The DB tests run as `authenticated`.

Gaps:
- the `vbd_manage` cross-church planting case;
- a declined or past shift's token;
- Respond on a shift with no token;
- an evening start in `scheduledOnDays`.

## 6. Top findings
1. **`vbd_manage` never checks that the profile is in the church**, and the unique key has no church. A cross-church planted row silently blocks the real one.
2. **The schedule page's Respond link falls back to the page's own token** (`shift.confirmation_token ?? token`). Tokens exist only on shifts that got a reminder, so a pending shift that never did opens and answers the wrong shift.
3. **Token scope:** declined and past shift tokens still work, and every token is exposed. Document it.
4. **The warning's day differs from the planner's** (UTC `starts_at` vs `service_date`). Tied to G1.6.
5. **Re-adding a day is a silent no-op**, and profile merges drop blocked dates.
