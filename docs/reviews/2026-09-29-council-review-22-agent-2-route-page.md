# Council Review 22 — Agent 2: Route & Page

**Scope:** `fix/member-writes-rls-s8` at `4377e49` vs `main` (S8). Read-only.

**Checks run:** `npm run test:surfaces` passes (117 pages, 15 routes, 30 actions). The 4 unit test files for the changed actions pass (39 tests).

## 1. Server actions and their callers

- **`initiateDonationAction`** returns `{ok: true, clientSecret, donationId, paymentIntentId, isStub} | {ok: false, error}`. Its only caller, `components/portal/donor-portal.tsx:81`, handles `!ok`; the stub path calls `confirmDonationAction` itself. No caller uses the old shape.
- **`confirmDonationAction`** and **`cancelRecurringDonationAction`** return `{ok, error?}`; callers at `donor-portal.tsx:97` and `:133` check `ok`, and the remaining try/catch only covers a real throw.
- **`joinGroupAction`** returns `{ok, error?}`; `member-groups-browser.tsx:33` handles it.
- **`memberMobileCheckInAction`** and **`memberRegisterForEventAction`** keep their shapes; callers (`member-mobile-checkin-card.tsx:75`, `member-event-registration-panel.tsx:147`) already handle `!ok`.
- **Data-rights actions** return `DataRightsResult`; `generateDataExportAction` returns `{ok, payload}`. The only caller, `data-rights-panel.tsx`, is fully updated.

## 2. Page loaders

- `getMemberEventRegistrationOptions` and `getMemberMobileCheckInOptions` feed `/app/[role]` (member home); `getPublicEventRegistrationOptions` feeds `/portal/events/register`.
- **Access codes:** the check-in code reaches the client only as the boolean `accessCodeRequired`; registration selects don't include it; coordinates never leave the loader. No leak (verified).
- **`[0]` embed scan:** no remaining unguarded `row.<embed>[0]` in `lib/` or `app/` (pattern search, heuristic).

## 3. Manifest

- Entries accurate; allowed roles unchanged.
- **Gap:** `member-writes.spec.ts` isn't listed under `/app/[role]`, where its capacity journey runs.
- `respondToCalendarEventRsvpAction` is still waived in `untestedExports`, though S8 fixed its behavior through a migration.

## 4. E2E spec

- Each journey checks the real DB row; data is tagged and cleaned before each test and after all; the describe is serial; seed rows aren't changed.
- Minor flake risk (inferred): the RSVP event sits at UTC `date_trunc('day') + 12h`, which may fall outside the calendar's default view in some time zones.
- Coverage gaps: no journey for mobile check-in, data rights, or cancelling a recurring gift. `member-actions.test.ts` only exercises the local-SQL path, so the new admin-client code in both member actions has no unit test.

## 5. Summary

| Surface | Change | Callers OK? | Notes |
|---|---|---|---|
| donations-actions (3) | Admin client, pending row before Stripe, `{ok}` results | Yes | Non-stub path leaves orphan rows |
| `joinGroupAction` | Admin client, open/active check | Yes | Unit + e2e |
| `memberMobileCheckInAction` | Admin settings read + attendance write | Yes | No Supabase-path test |
| `memberRegisterForEventAction` | Admin settings read, capacity count, payments | Yes | Missing visibility check |
| data-rights-actions (4) | `{ok}` results, row-count check | Yes | No e2e |
| Member-home loaders | Admin reads, `[0]` fix | n/a | No secrets returned |
| Public registration loader | `[0]` fix only | n/a | Still empty for visitors |

## Top issues

1. **Members can register for staff-only events (verified).** `app/app/member-actions.ts:719–724` reads settings with the admin client including `events!inner(id, visibility)` but never checks visibility (the local branch does, `:522`). `event_registrations_public_insert` is `with check (true)`, so the DB doesn't stop it either.
2. **A real Stripe PaymentIntent and pending row on every "Give" click with keys set (verified).** The page then says "not charged" and nothing completes them.
3. **The public registration page is still empty for visitors (verified from migrations).** `lib/public-event-registration-data.ts:219–228` uses the RLS-bound client, and `event_registration_settings` has only the manage policy, so a visitor gets `[]`. The `[0]` fix changes nothing for them.
4. **Registering another household member probably errors (inferred).** `member-actions.ts:806` inserts with `.select("id").single()` on the RLS-bound client; `event_registrations_select_own` only covers the member's own profile.
5. **Test and manifest gaps** (above).
