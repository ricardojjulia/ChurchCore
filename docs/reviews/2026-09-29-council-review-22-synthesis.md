# Council Review 22 — Synthesis

**Date:** 2026-09-29
**Branch audited:** `fix/member-writes-rls-s8`, commit `4377e49`
**Base branch:** `main` (`29d1776`)
**Roadmap item:** S8, member writes vs. RLS (`DEVELOPMENT_PLAN.md` §0.3)

## §0 Scope Note

Diff-scoped. S8 was found by Council Review 21: giving, mobile check-in, group join, RSVP and event registration all failed for real members, because RLS gives members no write policy on those tables (and the RSVP self policy compared a profile id with `auth.uid()`). The commit moves business-rule writes to a church-scoped admin client after each action's own checks (ADR 0022), fixes the RSVP policy by migration, returns errors instead of throwing, and adds a member-JWT DB harness and four e2e journeys. While fixing it, it also found that donation confirmation trusted the client, and that member and public registration options were always empty (no member SELECT on `event_registration_settings`, and an object-shaped PostgREST embed read as `[0]`). 19 files; a full four-agent pass.

## 1. Cross-Agent Consensus

- **Scoping is correct (Agents 1 and 2, verified).** Every admin-client query takes `church_id` from the session and profile ids from `session.churchProfileId`; no client-supplied church id; the check-in access code never leaves the server; every caller of a changed action handles the new `{ok: false}` results.
- **Stub mode is unsafe in production (Agents 1, 3 and 4 independently; verified by me).** `lib/stripe/donations.ts:126` returns `"succeeded"` whenever `STRIPE_SECRET_KEY` is unset, with no environment check, and the portal auto-confirms stub gifts. On any deploy without Stripe keys, a member can record succeeded gifts (up to $100k each) with emailed tax receipts, feeding finance reports. **S8 made this reachable:** before, the member's insert failed. Must fix before merge.
- **Every live-mode "Give" leaves a pending row and a real, orphaned PaymentIntent (Agents 1, 2 and 3; verified).** The row, Customer and PaymentIntent are created before the member is told card giving isn't available (G3.0), and the pending gift shows in their history forever.
- **Registration no longer checks event visibility (Agents 1 and 2; verified).** `member-actions.ts:719–724` selects `events.visibility` but never checks it. Before S8 the RLS-bound settings read returned nothing, so this is **new exposure**: a member with an event id can register for a staff-only event. Must fix.
- **Raw database text still reaches members (Agents 2 and 3; verified)** in the check-in and registration paths the diff touched (`member-actions.ts:368, 404, 441, 821`). The household-member registration insert, still on the RLS-bound client with `.select().single()`, is likely rejected by `event_registrations_select_own` (inferred by both).
- **The changed Supabase paths of both member actions are untested (Agents 1, 2 and 4; verified).** `member-actions.test.ts` runs only the local-SQL branch; there's no e2e check-in journey.

## 2. Single-agent findings, verified during synthesis

1. **Confirm never posts to the GL (Agent 1).** Verified: `autoPostToGlSupabase` lives in `app/api/webhooks/stripe/route.ts:496` and runs only when the webhook wins the `pending → succeeded` update. When the browser's confirm wins (every stub gift today, and a race once G3.0 exists), the gift never reaches the ledger.
2. **Receipt HTML injection (Agent 1).** `donor_name` and `fund_designation` are client-supplied and go into receipt HTML unescaped. Exploitable to any address through the stub (issue above). Verified by reading.
3. **A re-submitted member change request is silently lost (Agent 4).** Verified in `pg_policies`: `member_change_requests` has no member UPDATE policy, so `app/app/actions.ts:503-515` updates 0 rows, returns the old id, and the member sees "pending review" while the new changes are dropped. This is exactly S8's class of bug, missed by S8's audit.
4. **A second notification-preferences save throws (Agent 4, "inferred").** Verified by reading: `communications-actions.ts:568` upserts without `onConflict`, the PK is `id`, and `(church_id, profile_id)` is unique, so every save after the first hits 23505.
5. **`event_registrations_public_insert` is `with check (true)` for role `public` (Agent 1).** Verified in `pg_policies`. Anyone with the anon key can insert a confirmed, paid registration for any church, skipping capacity and visibility. Pre-existing, not introduced by S8.
6. **The public registration page is still empty for visitors (Agent 2).** Verified: `lib/public-event-registration-data.ts` reads `event_registration_settings` through the visitor's client, and the only policy on that table is `event_reg_settings_manage`. The `[0]` fix is necessary but not sufficient. Pre-existing.

## 3. Corrections

- **Our own S8 write-up overstated.** The commit said registration options "were always empty" for the member page and "same embed bug fixed on the public registration page" — true, but it implied the public page now works, and it doesn't (finding 6). The tracker's S8 note also claimed "every member-reachable write is audited"; Agent 4 found a missed one (finding 3). This is the fourth round where the error is in our own write-up, not an agent's claim.
- **Agent 4's "inferred" preferences finding was right**, and verifiable by reading alone; recorded as verified.
- No agent claim was found wrong this round.

## 4. Score

**69/100** (Agent 4; accepted). First re-based from 67 to 66: Review 21's "above 71 once S8 lands" assumed giving would work once RLS was fixed, and G3.0 shows online card giving could never charge. S8 adds about 3 for member self-service writes (RSVP, group join, check-in, registration, data rights). Returning above 71 needs G3.0 and the change-request fix. Module estimates: Giving ~48%, Events & Registrations ~70% (from a re-based ~55%), member-portal writes ~62% (from ~40%), Volunteer Scheduling ~80% (unchanged, until G1.5).

## 5. Proposed prompts (fix in S8, before merge)

- **P1 — Stub mode only outside production.** Donation stubs (`createPaymentIntent`, `retrievePaymentIntentStatus`, customer) run only when `NODE_ENV !== "production"` or `NEXT_PUBLIC_DEMO_MODE === "true"` (the repo's existing demo convention). In production without keys, `initiateDonationAction` returns "Online giving isn't set up for this church yet." without writing a row. Tests for both.
- **P2 — No orphans while G3.0 is unbuilt.** With Stripe configured, `initiateDonationAction` returns the "isn't available yet" error before writing a row or calling Stripe. The giving page shows the notice up front and disables Give, from a server-computed `onlineGivingAvailable` prop. G3.0 removes the guard.
- **P3 — Confirm posts to the GL.** Move `autoPostToGlSupabase` from the webhook route into a `server-only` finance module, and call it from both the webhook and `confirmDonationAction` on whichever wins the `pending → succeeded` update. Tests.
- **P4 — Registration visibility and household insert.** The Supabase path requires `events.visibility` in `('members','public')`; the registration insert moves to the admin client (so a household member's row can be read back), with a friendly error. Unit tests for visibility, household and capacity on the Supabase path.
- **P5 — No raw database text to members.** Check-in and registration errors log the raw message and return plain text. Mobile check-in gets Supabase-path unit tests.
- **P6 — Escape receipt HTML.** `donor_name` and `fund_designation` are HTML-escaped in both the confirm and webhook receipts. Test.
- **P7 — The two missed member writes.** Change-request re-submit updates through the admin client, scoped to church, request id and target profile, with a row-count check; notification preferences upsert `onConflict: "church_id,profile_id"`. Tests.
- **P8 — Manifest.** `member-writes.spec.ts` is added under `/app/[role]`.

## 6. Tracker changes (not fixed here)

- **New row S10 (Must, 1 day): public event registration server-side.** The visitor page reads settings server-side (it's empty today); visitor submissions go through a server action that enforces visibility, capacity and deadline; the `event_registrations_public_insert with check (true)` policy is dropped. DB test that anon can't insert. Week 2.
- **S5** widened: the `profiles` column lock also covers the data-rights approval columns (`data_delete_approved_at`/`_by`), `is_pastoral` and `safety_clearance_date` (Agent 1).
- **S9** widened: self policies that pick a profile with `where user_id = auth.uid() limit 1` and no church filter (`event_registrations_select_own`, `notification_preferences_*`, `consent_logs`) match by church (Agent 4).
- **G3.0** DoD adds: remove P2's guard, and cancel a PaymentIntent whose gift is abandoned.
- **Deferred minor:** `respondToCalendarEventRsvpAction` still throws and is waived; a failed paid-registration payment upsert is logged while the member sees success; the member portal is untranslated (pre-existing localization coverage gap); group "Requested" state lost on reload; the non-atomic capacity count.
- **Capacity:** S10 adds 1 Must day: 38 against 25, about 52% over. **Agent 4 recommends the owner take the date-vs-scope decision now rather than at M1 (Oct 2).**

## 7. Execution order

P1 → P2 → P3 → P6 (donations, one pass) → P4 → P5 → P7 → P8, then full verification (tsc, lint, unit, DB, surfaces, migrations, build, member e2e), then the Documenter, then the PR.
