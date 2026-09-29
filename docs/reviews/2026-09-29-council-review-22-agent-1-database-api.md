# Council Review 22 — Agent 1: Database & API

**Scope:** `fix/member-writes-rls-s8` at `4377e49` vs `main` (S8, member writes vs. RLS). Read-only; local DB queries only.

**Verdict: conditional GO.** Tenant and person scoping are correct everywhere checked. Two donation-flow defects and one new business-rule bypass in registration should be fixed before merge, or explicitly deferred with tracker rows.

## 1. Admin-client writes — scoping (verified by reading source)

- Every admin-client query takes `church_id` from `session.appContext.church.id`, never from the client. Profile ids always come from `session.churchProfileId`; the login id is never used as a profile FK in the diff. The only `userId` use is `church_memberships.user_id` in the data-rights export, which is correct per S7.
- **joinGroupAction:** reads the group by `id` + `church_id`, requires `is_active && is_open`, hardcodes `role: 'member', status: 'pending'`. This matters because `current_user_leader_group_ids()` grants leader powers from `group_members.role` (checked in the DB).
- **Check-in:** the settings read is scoped to `church_id` + `event_id` + enabled. Window, code, location and household checks all run before the admin insert. The access code never leaves the server. The partial unique index `attendance_event_profile_present_uidx` backs dedupe (checked in the DB).
- **Cancel recurring:** filters on `profile_id = churchProfileId` + church before Stripe is called.

## 2. Donations

- Confirm is sound in live mode: it requires Stripe to report `succeeded` and updates only `pending`, matching id + church + PaymentIntent. Only the path that wins the pending→succeeded update sends a receipt, so double receipts don't happen.
- **The stub is unsafe in production.** `lib/stripe/donations.ts:126` returns `"succeeded"` whenever `STRIPE_SECRET_KEY` is missing, with no `NODE_ENV` or demo-mode check. On any deploy without Stripe keys, a member can record unlimited "succeeded" gifts of up to $100k each, each with an emailed tax receipt, feeding finance reports.
- **Orphaned objects in live mode.** Every attempt creates a pending row and a real PaymentIntent (and possibly a Customer). The UI then says "not charged" (G3.0), and nothing ever cancels or expires them.

## 3. Migration `20260929000000_event_rsvps_own_profile_policy.sql` (checked against live `pg_policies`)

- The live policy matches the file; `drop if exists` + `create` is idempotent.
- Narrower than the old `auth.uid()` policy: WITH CHECK requires own profile, same church and `rsvp_enabled`.
- The USING self-branch has no church or `rsvp_enabled` condition, so a member can still change or delete their own RSVP after RSVPs are turned off. Acceptable.
- No widening. `event_rsvps` has no `church_id`; scoping goes through `events`.

## 4. Data rights (checked in the DB)

- `profiles_update_self` / `profiles_update_own_data_rights` (`user_id = auth.uid()`) plus a table-wide UPDATE grant to `authenticated` allow the member's own write. The row-count check is correct.
- **Pre-existing, adjacent risk:** those policies have no column limits. Through PostgREST a member can set their own `role`, `church_id`, `membership_status`, `data_delete_approved_at`/`_by`, `is_pastoral`, `safety_clearance_date`, and so on. Authorization runs through `church_memberships`, so this doesn't escalate privileges in the church app, but it corrupts data and approval state. S8 now leans on this policy.
- The export doesn't leak across tenants. The export still has a local-SQL branch (minor, against the Supabase-only mandate).

## 5. Tests

- Unit tests use distinct ids (`login-1` vs `profile-1`); assertions on `profile_id`, `church_id`, `status = pending` and the PaymentIntent id would fail on a regression.
- The DB harness runs as the real `authenticated` role with JWT claims; the member's profile id is trigger-generated, so it differs from the login id. It proves the denials it claims.
- Gaps: `memberMobileCheckInAction` has no Supabase-path unit test and no e2e; the harness never tests direct `event_registrations` inserts (they succeed, see #4); nothing tests event visibility at registration; nothing tests confirm-vs-webhook GL posting.

## 6. Top 5 issues

1. **Stub confirm marks gifts succeeded in production.** `lib/stripe/donations.ts:126`, used by `app/app/donations-actions.ts:144`. Ten clicks of "Give $100,000" on a keyless deploy produce $1M of succeeded donations with tax receipts. Fix: stub only outside production or with demo mode set. *Verified.*
2. **Confirm skips GL posting.** `donations-actions.ts:152–160` flips the row to succeeded but never calls `autoPostToGlSupabase`; the webhook (`app/api/webhooks/stripe/route.ts:170–182`) posts only if it also wins the `pending` update. Once Elements exists, whenever the browser's confirm lands first the gift never reaches the GL. Stub gifts never post either. *Verified; the race is inferred.*
3. **Registration no longer checks event visibility.** `app/app/member-actions.ts:719–724` selects `events.visibility` but never checks it; the local path filters `('public','members')` (line 522). Because the settings read now bypasses RLS, a member with an event id can register for a staff-only or private event. Before S8 the RLS-bound read returned nothing, so this is new exposure. *Verified.*
4. **`event_registrations_public_insert` accepts any row.** WITH CHECK is `true` for role `public`, and the registration insert at `member-actions.ts:806` still uses the member client. Anyone with the anon key can insert a registration for any church with `status='confirmed', payment_status='paid'`, skipping capacity. Pre-existing, but S8's "business rules stay server-side" claim doesn't hold for this table. *Verified in `pg_policies`.*
5. **Receipt HTML injection to any address.** `donor_email` and `donor_name` come from the client; `fund_designation` and `donor_name` go into the receipt HTML unescaped. With #1, a member can make the church send branded HTML email with injected content to any address. *Verified; exploitability depends on #1.*

**Also noted:** live-mode orphaned PaymentIntents and pending rows; check-in and registration read household profiles through RLS (line 396), so a household member with `directory_visible = false` may be invisible (inferred); the capacity count and insert aren't atomic (inferred); `confirmDonationAction` throws if Stripe returns an error (inferred).
