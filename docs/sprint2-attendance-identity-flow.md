# Sprint 2: Attendance, Roster, and Member Identity Flow

This document captures the ChurchCore Ops Sprint 2 implementation that connects three related concerns into one tenant-safe workflow:

- attendance and event check-in
- serving rosters and burnout visibility
- member identity and public portal access requests

It is intentionally more detailed than the README. Use this as the engineering reference for the current behavior, data model, and release constraints.

## Scope

Sprint 2 adds three end-user flows:

1. Church-admin and pastor event operations
   - Event-specific attendance management at `/app/church-admin/events/[id]`
   - Roster assignment and roster confirmation
   - Quick check-in for existing members
   - Quick-add visitor creation plus immediate attendance capture

2. Public-to-admin account request flow
   - Public `/portal` landing page
   - Public `/portal/register` request form
   - Church-admin approval queue at `/app/church-admin/accounts`
   - Approval path that generates a `member_number` and optionally sends a Supabase invitation

3. Member self-service visibility
   - Attendance history on `/app/member`
   - Upcoming serving assignments on `/app/member`
   - Self-edit for `preferred_contact_method` and `interests`

## Design Decisions

### Reuse `attendance` instead of creating `attendance_records`

The specification proposed a new `attendance_records` table. The repo already had a tenant-scoped `public.attendance` table, plus downstream code reading `profiles.last_attendance`.

Creating a second attendance table would have split the source of truth and added migration debt immediately. Sprint 2 therefore extends `public.attendance` with:

- `church_id`
- `check_in_method`

This keeps:

- the existing `sync_last_attendance()` trigger relevant
- the pastor people views coherent
- the data layer simpler for reporting and future volunteer analytics

### Support offline people records

The original schema tied `profiles.id` directly to `auth.users.id`. That prevented:

- walk-in visitor creation
- offline roster entries
- portal requests that need a church profile before an auth account exists

Sprint 2 changes that model so:

- `profiles.id` becomes an independent UUID with a default generator
- `profiles.user_id` remains the auth linkage when an account exists
- `profiles.user_id` is now nullable
- new auth users merge onto existing offline profiles by email when possible

This is the key schema change that made the rest of Sprint 2 viable.

## Data Model Changes

The migration is:

- `supabase/migrations/20260420000000_sprint2_attendance_identity_flow.sql`

### Profiles

Added:

- `member_number`
- `account_status`
- `is_roster_eligible`

Behavior:

- `member_number` is unique when present
- `account_status` is constrained to `pending | active | disabled`
- authenticated users default to `active` after migration backfill
- offline visitors can remain `pending`

### Attendance

Extended existing `public.attendance` with:

- `church_id`
- `check_in_method`

Policies now enforce:

- members can `SELECT` only their own attendance rows
- church-admin and pastor can manage attendance rows for their church

Check-in methods are constrained to:

- `manual_admin`
- `self_checkin`
- `nfc_qr`

### Event rosters

New table:

- `public.event_rosters`

Stores:

- `church_id`
- `event_id`
- `profile_id`
- `role_title`
- `is_confirmed`

RLS behavior:

- church-admin and pastor can manage rows in their church
- members can read only their own assignments

### Account requests

New table:

- `public.account_requests`

Stores:

- church target
- identity fields submitted from the public form
- optional linked `profile_id`
- review status and reviewer metadata

Public writes happen through:

- `public.submit_account_request(...)`

This avoids exposing raw tenant tables directly to the public portal.

### Member number generation

New helper:

- `public.generate_member_number()`

Current format:

- `CF-<MMDD>-<6 char random hex>`

This is collision-checked against existing profile rows before returning.

## Route Changes

### Public portal

- `/portal`
  - now acts as a public landing page
  - offers sign-in and request-access actions

- `/portal/register`
  - host-resolved church when available, with manual selection fallback
  - first name
  - last name
  - email
  - phone

### Church-admin

- `/app/church-admin/accounts`
  - pending request queue
  - highlights requests already matched to an existing member profile
  - approve or reject actions

- `/app/church-admin/events/[id]`
  - event summary
  - roster candidate search
  - attendance candidate search
  - current roster
  - attendance log
  - visitor quick-add modal
  - burnout warnings
  - care follow-up prompts with AI disclaimer

### Member

- `/app/member`
  - now includes:
    - member number display
    - interest chips
    - attendance history cards
    - upcoming serving cards

## Server-Side Changes

### New data loaders

- `lib/church-admin-events-data.ts`
  - event summary
  - roster rows
  - attendance rows
  - roster candidates
  - seven-day load counts
  - care prompts

- `lib/church-admin-accounts-data.ts`
  - pending request queue
  - existing-member match counts

- `lib/public-portal-data.ts`
  - public church lookup and host-aware church resolution

### New action files

- `app/app/church-admin-actions.ts`
  - roster add/remove
  - roster confirm/unconfirm
  - quick check-in
  - visitor add + check-in
  - approve request
  - reject request

- `app/portal/actions.ts`
  - public request submission

### Existing action updates

- `app/app/actions.ts`
  - member profile updates now persist `interests`
  - invite flow now uses the tenant service-role client when available
  - invite flow also upserts `church_memberships` and aligns invited users to church profiles

## Security Notes

### RLS intent

Sprint 2 keeps the tenant boundary intact by ensuring:

- members read only their own attendance and serving data
- church-admin and pastor manage church attendance and rosters
- public registration does not get raw table-level read access to `profiles`

### Audit coverage

Audit triggers are attached to:

- `attendance`
- `event_rosters`
- `account_requests`

This complements the existing shared audit model already used elsewhere in the tenant app.

### Data minimization

Public registration collects only:

- host-resolved church or explicit church selection
- first name
- last name
- email
- phone

The portal entry route does not expose broader profile data.

## AI Guardrail Behavior

The Sprint 2 specification included an AI-assisted care suggestion concept. The current implementation keeps this narrow and safe:

- event workspaces produce simple rule-based care prompts
- those prompts are shown only to church-admin / pastor event managers
- prompts always include the standard assistive disclaimer

No LLM generation or autonomous action is performed in this flow.

## Current Constraints

These parts are intentionally incomplete:

- invite delivery requires `SUPABASE_SERVICE_ROLE_KEY` or `TENANT_SUPABASE_SERVICE_ROLE_KEY`
- no dedicated member self-confirm / self-decline serving action yet
- roster role titles are free text today; no controlled vocabulary yet
- visitor deduplication is intentionally light and does not yet attempt fuzzy merge logic at creation time

## Validation

Validated in this release with:

- `npm run lint`
  - passes with existing unrelated warnings in `lib/ministry-forge-data.ts`
- `npm run build`
  - passes

## Files Most Relevant To Review

- `supabase/migrations/20260420000000_sprint2_attendance_identity_flow.sql`
- `app/app/church-admin-actions.ts`
- `app/app/church-admin/accounts/page.tsx`
- `app/app/church-admin/events/[id]/page.tsx`
- `app/portal/actions.ts`
- `app/portal/page.tsx`
- `app/portal/register/page.tsx`
- `lib/church-admin-events-data.ts`
- `lib/church-admin-accounts-data.ts`
- `lib/member-portal-data.ts`
- `components/application/church-admin-event-workspace.tsx`
- `components/application/church-admin-accounts-workspace.tsx`
- `components/portal/portal-register-form.tsx`
