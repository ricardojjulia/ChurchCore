# ChurchCore Application Guide

This guide explains what ChurchCore does from first entry through day-to-day use. It is written for evaluators, operators, and contributors who need the whole product story before reading implementation details.

## 1. What ChurchCore Is

ChurchCore is a multi-tenant church operations platform. It gives a church one working system for member records, families, ministries, events, giving, communications, volunteer coordination, children's ministry safety, finance, reports, and guarded ministry workflow recommendations.

The application has two separate operating surfaces:

- **Tenant app:** the church-facing product used by church admins, pastors, ministry leaders, volunteers, and members.
- **Control plane:** the ChurchCore staff surface used for tenant oversight, platform operations, onboarding, billing metadata, and support audit workflows.

Those surfaces intentionally have different data boundaries. The control plane manages platform concerns; the tenant app manages church runtime data.

## 2. How To Run It Locally

For a quick product walkthrough without a backend:

```bash
npm ci
npm run dev
```

Open `http://localhost:4200`. The app runs in preview mode with in-memory demo data.

For the full local demo with Supabase, seeded Grace Harbor Church data, and local demo users:

```bash
npm run setup:local
npm run dev
```

The local setup script creates demo credentials in `.demo-credentials.local`. The default demo users are:

| User | Role | Main Surface |
| --- | --- | --- |
| `sarah@churchcoreops.app` | Church Admin + Platform Admin | `/app` |
| `nora@graceharbor.church` | Church Admin only (not a platform admin) | `/app/church-admin` |
| `olivia@graceharbor.church` | Secretary / Office Admin | `/app/secretary` |
| `miriam@graceharbor.church` | Pastor / Elder | `/app/pastor` |
| `robert@graceharbor.church` | Ministry Leader | `/app/ministry-leader` |
| `david@graceharbor.church` | Member | `/app` |

See `docs/setup/local-supabase.md` for the full tenant backend setup, reset, seed, and smoke-test flow. The control plane has a separate Supabase project and should be provisioned separately when testing platform-staff workflows.

For browser-level verification of the weekly ChurchAdmin operator path, install the Playwright Chromium runtime once and run the readiness e2e check:

```bash
npm run test:e2e:install
npm run test:e2e:readiness
```

The readiness e2e check starts the Next.js dev server automatically and expects local Supabase plus `.demo-credentials.local` from `npm run setup:local`.

## 3. First Screen And Sign-In

The root page introduces ChurchCore and gives two main entry points:

- **Sign in:** opens the tenant app sign-in flow.
- **Control:** opens the platform control-plane sign-in flow.

After sign-in, the app hydrates the user's session, role, and church context. A church user lands in the tenant app. A platform user can enter the control plane. Tenant routes and control-plane routes do not share the same long-term data model.

## 4. Tenant App Overview

The tenant app is the church's operating workspace. It is role-aware, so each user sees the workflows that match their responsibility.

The application shell and public entry flow now include English / Spanish language selection. The public home page, sign-in page, public portal, shared shell, Daily Desk, member home, member directory, member family detail page, ChurchAdmin navigation, readiness path, dashboard summary cards, main operations lanes, portal account approval queue, church settings page, and people management page are translated surfaces; church-entered content such as member names, notes, event titles, fund names, and pastoral or office records remains in the language entered by the church. The full rollout is tracked in `docs/plans/spanish-ui-coverage.md`.

Primary tenant roles:

| Role | Purpose |
| --- | --- |
| ChurchAdmin | Church setup, people, ministries, events, giving, communications, finance, volunteers, and operations. |
| Secretary / Office Admin | Daily Desk calls, notes, visit scheduling, calendar coordination, and request follow-up. |
| Pastor / Elder | Pastoral visibility, people care, ministry oversight, discernment, and reporting. |
| Ministry Leader | Ministry roster, volunteers, events, and assigned ministry work. |
| Member / Volunteer | Profile, family, directory, giving, calendar, ministries, groups, and schedule. |

All sensitive data is treated as church-scoped tenant data. Actions are expected to enforce least-privilege access and row-level security.

## 5. ChurchAdmin Workflow

ChurchAdmin is the broadest tenant role. A church admin starts at `/app`, where the home dashboard summarizes live tenant state when a backend is configured and falls back to preview data when it is not.

### Home Dashboard

The dashboard shows summary cards for:

- people
- ministries
- events
- giving

It also includes live operations lanes:

- **Care:** pastoral care assignments and aging follow-up.
- **Weekend:** upcoming events needing approval, roster, capacity, waitlist, or near-term attention.
- **Communications:** queued or failed sends, bounced logs, consent gaps, and contact gaps.
- **Giving:** payment exceptions, unsent receipts, GL reconciliation gaps, fund mapping gaps, and public giving page setup.

### Weekly Readiness

Path: `/app/church-admin/readiness`

The readiness workspace is the MVP operating path. It checks whether a church admin can run the week across church setup, portal account requests, people and households, weekend events, children's ministry, volunteer schedule, giving and finance, communications, reports, and suggested ministry workflows. Each item links directly to the workflow that resolves it, and supported routes open in a filtered readiness view.

Readiness items now follow a shared `ReadinessSummary` contract with status, severity, issue count, completion state, recommended action, target route, and target query metadata. Setup, account request, people/household, weekend event, children's ministry, volunteer schedule, giving/finance, communications, reports, and suggested workflow readiness now use module-owned builders, which keeps the weekly operator path consistent as each module owns its own readiness summary.

Supported readiness targets now include filtered or context-specific views for people records, events without roster coverage, children's ministry safety checks, volunteer scheduling, giving/finance exceptions, draft finance journals, communication readiness, reporting coverage, and suggested workflows.

Current readiness target audit:

| Readiness target | Route | Resolution path |
| --- | --- | --- |
| Church setup | `/app/church-admin/settings` | Review tenant profile, contact, website, address, and public-summary fields, then return to readiness. |
| Account approvals | `/app/church-admin/accounts?status=pending` | Approve, reject, or match pending portal account requests. |
| Incomplete people records | `/app/church-admin/people?view=incomplete-profiles` | Open filtered people records and complete missing profile details. |
| Unassigned households | `/app/church-admin/people?view=unassigned-households&household=unassigned` | Use household controls to assign people to existing households or create household links. |
| Event roster gaps | `/app/church-admin/events?view=needs-roster` | Open matching events and add roster assignments or attendance setup. |
| Children's ministry safety | `/app/church-admin/children/dashboard?view=readiness` | Open services, volunteers, rooms, incidents, check-in, or pickup flows from the dashboard to resolve safety gaps. |
| Volunteer service plans | `/app/church-admin/volunteers/schedules?view=unassigned` | Open service plans, link them to ChurchAdmin events when needed, and fill or confirm volunteer positions. |
| Giving/finance exceptions | `/app/church-admin/giving?view=exceptions` | Review failed gifts, publish giving pages, post mapped gifts to GL, queue receipt follow-up, or open draft journals. |
| Draft finance journals | `/app/church-admin/finance/journals?view=drafts` | Open each draft journal and post, correct, or void it. |
| Communications readiness | `/app/communications?view=readiness` | Review delivery/contact/consent signals and compose needed follow-up; provider retry and suppression handling remain part of the communications delivery roadmap. |
| Reports coverage | `/app/reports?range=90d` | Review reporting coverage and drill into reports; richer remediation for missing finance journals or budgets remains a reporting follow-up. |
| Suggested workflows | `/app/church-admin/workflows?status=open` | Review, accept, or dismiss open ShepherdAI workflow suggestions. |

This completes the current operator-path navigation and state-evidence layer. The remaining Phase 1 work is to deepen partial target routes into richer one-click resolution flows where provider or reporting infrastructure is not yet complete.

### Daily Desk

Path: `/app/daily-desk`

The Daily Desk is the daily working surface for church admins, secretaries / office admins, and pastors. It captures and tracks the work that usually happens between larger modules:

- incoming and outgoing calls
- office notes
- scheduled pastoral or administrative visits
- calendar-related items
- follow-up tasks
- routine checkups

Each item can be connected to a church profile, assigned to a staff or pastoral profile, scheduled, given a due time, marked by priority, and moved to done, waiting, or cancelled. The screen also keeps the operator aware of near-term events and open operational signals such as pending account requests, care follow-up, suggested workflows, and roster gaps.

The Secretary / Office Admin role has its own `/app/secretary` portal and can work `/app/daily-desk` plus `/app/calendar`. It does not receive the full ChurchAdmin sidebar or broad admin settings, finance, children, people-management, or readiness permissions.

### Church Setup

Path: `/app/church-admin/settings`

Admins manage church profile data such as legal name, website, contact details, mailing address, and public summary metadata. This is the starting point for making a tenant usable by a real church.

### People And Households

Path: `/app/church-admin/people`

Admins manage member and attendee records, including:

- member profile details
- account status
- portal account requests
- role assignment
- household assignment and household gaps
- active, inactive, visitor, transferred, and baptized states

This area is also where Sprint 2 continues to expand deeper household workflows, invite edge cases, and role-management hardening.

### Account Requests

Path: `/app/church-admin/accounts`

Church admins review portal access requests submitted from `/portal/register`. Approval creates or updates the member profile, activates the account state, links the profile to the invited Supabase auth user when tenant admin auth is configured, records an active member role in `church_memberships`, and sends a Supabase invitation.

The MVP happy path is:

1. A member opens `/portal/register`, selects the church, and submits first name, last name, email, and optional phone.
2. The request appears at `/app/church-admin/accounts` with an existing-member match when the email already belongs to a church profile.
3. A church admin approves the request.
4. The app assigns or preserves a member number, activates the profile, creates the auth invitation, and records active member access.
5. The invited member completes sign-in and lands in the member portal with church-scoped profile data.

### Communications

Path: `/app/communications`

The communications workspace is used for church messaging and operational follow-up. Consent and communication preferences are logged append-only so changes can be audited.

### Giving

Paths: `/app/giving`, `/app/church-admin/giving`

Admins can review donation activity, giving analytics, fund mappings, receipt gaps, and GL posting status. Donation receipts, recurring-gift failure notices and paid event-registration receipts are emailed from the Stripe webhook. A paid registration's receipt names the church, the event and its local time, and the amount, and says the fee is not a tax-deductible donation (registration fees never appear on a giving statement). In production, until an email provider is configured, these messages are not sent and stay visibly unsent (the "unsent receipts" count below); they are never reported as delivered. Public giving is available through `/give/[churchSlug]` when a giving page is configured and live.

The readiness link `/app/church-admin/giving?view=exceptions` opens a focused exception view for failed gifts, unposted gifts, unsent receipts, draft journal count, and public giving page status. Mapped unposted gifts can be posted to the general ledger from the readiness view; failed gifts and receipt gaps link to the next review workflow.

Year-end giving statements (G3.3) live on the Statements tab of `/app/church-admin/giving`. A church admin picks a date range (default: last calendar year, in the church's time zone), previews who will be emailed and why anyone is skipped (opted out, email suppressed, no email on file), downloads a donor's PDF, and sends the batch; the email body is the statement and a donor is never emailed twice for the same range. Staff never see an anonymous giver: anonymous gifts show as one unattributed line and are left out of the admin PDF. Members download their own full statement, including their own anonymous gifts, from `/app/member/giving`. Statement emails don't appear against a recipient in Communications history, by design.

Donations can be bulk-imported from CSV files exported from Planning Center, Breeze, or any generic CSV source. The import flow runs a dry-run classification first (showing `create`, `update`, `skip`, and `reject` rows with reasons) before committing. Each row is matched to an existing donation by `source_id` for idempotent re-imports; a gift with no ID in the file (Planning Center, Breeze) gets a stable ID derived from its content, so re-importing the same file creates nothing new. Rows are rejected for missing or blank amounts, invalid amounts (zero, negative, or non-numeric), or an unreadable `donated_at` (ISO 8601 and US `mm/dd/yyyy` dates are both accepted, read in the church's time zone). Duplicate source IDs within the same file are skipped. Donors are linked by the vendor's person ID (Breeze ID, stored as the member number) first, then by email; an `Anonymous` donor is recorded as anonymous with no warning, and unmatched donors are flagged in the dry-run preview and the donation is recorded as anonymous on create. On update, the existing `is_anonymous` value is preserved and not overwritten. Imported donations use `status='succeeded'` (all historical giving), `currency='usd'` (single-currency MVP), and `created_at` from the `donated_at` field if provided. Stripe fields (`stripe_payment_intent_id`, `stripe_subscription_id`, `stripe_customer_id`, `receipt_sent_at`) are not set during import. The `autoPostToGl` path is never triggered by this import. Imported gifts do not post to the general ledger. The import page is `/app/church-admin/giving/import` (an Import button is on the Giving page). See [Migrating from Planning Center or Breeze](#migrating-from-planning-center-or-breeze).

### Finance

Path: `/app/church-admin/finance`

The finance module provides internal church bookkeeping:

- chart of accounts
- journal entries
- posting and voiding workflows
- budgets
- imports
- income statement, balance sheet, and budget variance reports

Donation GL auto-posting connects giving records to balanced journal entries when fund mappings exist.

The readiness link `/app/church-admin/finance/journals?view=drafts` filters journal entries to drafts and highlights the action to open each draft for posting or voiding before calling the week ready.

### Ministry Forge

Path: `/app/church-admin/ministry`

Ministry Forge manages ministry health, rosters, designated leaders, track-specific ministry panels, and stewardship metrics. Current ministry tracks include worship, men, women, marriage, missions, outreach, children, youth, young adults, and education.

Specialized panels surface ministry-specific data such as worship songs, mentorship pairs, mission partners, youth milestones, education coverage, children's safety ratios, and outreach zones.

### Children's Ministry

Path: `/app/church-admin/children`

The Children's Church Ministry module handles:

- check-in and checkout
- services
- rooms
- children records
- volunteers
- emergency roster
- incidents
- safety settings

The module is designed around child safety, custody restrictions, pickup verification, emergency workflows, and restricted access to sensitive child data.

Children service detail now includes day check-in session controls (`draft`, `enabled`, `paused`, `closed`) with optional session start/end windows. Staff check-in only runs when the service is open and the day session is explicitly enabled, which prevents always-on check-in access outside an approved service session.

Service detail now exposes session-scoped parent links for both check-in and checkout under `/portal/children/checkin/[token]` and `/portal/children/checkout/[token]`. These links are safe by default: invalid, draft, paused, closed, and out-of-window sessions return an explicit unavailable state instead of exposing active children workflows.

When a day session is available, parents can submit self-service check-in (child + room + guardian details) and checkout (child session + PIN/claim token + release name) directly from those links. Submission actions remain token-scoped to the active service session and enforce room/session validity before writes.

Parent self-service also applies guardrails: repeated failed attempts are rate-limited per link/fingerprint window, long-running enabled links without an end window expire automatically, custody-restricted release names are blocked during checkout, and authorized-pickup name matching is enforced when a child has an authorized pickup list.

The readiness link `/app/church-admin/children/dashboard?view=readiness` opens a focused safety view for active service state, room ratios, two-adult coverage, open incidents, and background-check coverage. It links directly to volunteer assignment, service management, room setup, incident review, and safety settings so each readiness issue has a clear resolution path.

### Kiosk self check-in

Path: `/app/church-admin/children/kiosk` (church admin only), which opens the family-facing screens at `/kiosk/children`.

A kiosk lets families check their own children in on a church-owned tablet while staff stay in the room.

**Starting it.** A church admin signs in on the tablet, opens Children's Ministry, then Family Kiosk, optionally names the device (for example "Lobby iPad"), chooses a **6-digit exit PIN** twice, and presses Start. The PIN is stored only as a hash. If no service is open with check-in enabled, families see a message and nothing is recorded. From then on that browser is locked to the kiosk: any other address, including `/api/...`, returns to the start screen. Only a church admin can start a kiosk; the kiosk can only look up and check in.

**What families see.** A family finds itself in one of three ways: by typing the full phone number, by typing the family code, or by tapping Scan and holding the family's QR to the camera (if the camera is blocked, the typed code is the fallback). The phone must match a number on file exactly; there is no partial or name search. If a phone is shared by more than one household, nothing is listed and the family is sent to a greeter. Children appear as a first name and last initial ("Ana R."), only for children under 18 by birth date; a child with no birth date is not listed (staff can check them in from the staff screen). A child with a custody restriction is not listed either: the family sees "Please see a greeter". The family selects children and a room (a single room is preselected), and gets each child's badge PIN **once**. A child already checked in for the service is marked and cannot be checked in twice. A language picker on the start screen switches the kiosk between English and Spanish. Lookups that find nothing show a neutral message that does not say whether the household exists; five failed lookups pause that tablet for two minutes.

**Idle reset and the PIN screen.** After 60 seconds without a touch (10 seconds of warning, with an "I'm still here" button), the kiosk clears the family's details and any PIN and returns to the start screen. The admin stays signed in; the usual 15-minute logout does not run on the kiosk. The PIN screen also returns to the start screen by itself after 20 seconds, with a visible countdown.

**Leaving the kiosk.** An Exit button asks for the 6-digit exit PIN. Wrong attempts are rate limited. A right PIN ends the kiosk and returns to the church admin home. The exit dialog closes itself when idle and clears what was typed.

**Release this device.** If the kiosk session is dead (it ran past 16 hours, was ended elsewhere, or the admin's sign-in is gone), the tablet shows "Kiosk needs a staff sign-in". Its Release button clears the kiosk and **signs the admin's session out**, so the tablet comes back at the sign-in page. Release refuses while a valid kiosk session exists; the exit PIN is then the only way out.

**Family codes and QR.** Each family has an 8-character code (letters and digits; I, L, O and U are never used). A member sees their own family's code and QR on the Family page (`/app/member/family`) and can show it on a phone. A church admin can issue a new code from a person's Relationships dialog: the old code and QR stop working immediately, the change is audited, and the admin does not see the new code (the family does, on their Family page). Members cannot change a code.

**Not in the kiosk (see the plan):** rooms by age and capacity, several open services at once, printed labels, and a first-visit path for new families.

### Events And Attendance

Paths: `/app/church-admin/events`, `/app/church-admin/attendance`, `/app/calendar`

Admins create and manage church events, view categorized calendar data, track rosters, and log service attendance headcounts. The shared calendar is available from the tenant app and supports categorized event visibility.

Event registration operations now support approval-gated intake (`pending_approval` before confirmation), optional household registration policy toggles, and configurable per-event registration form fields for custom intake data.

Registration payment lifecycle defaults are now deterministic across ChurchAdmin, member, and public registration entry points (`pending` for paid non-waitlisted registrations; `not_required` for free or waitlisted). Paid registrations now create and store a Stripe Payment Intent when possible, returning a client secret for the member or public registration surface to continue secure payment confirmation. Member and public registration modals show payment-required messaging before submit and a secure payment-ready state after the intent is prepared, without displaying the client secret. ChurchAdmin event registration views include a dedicated payment follow-up filter to isolate unresolved paid registrations, resolve pending or failed records inline with a status and note, and show the follow-up audit trail after resolution.

Events can be bulk-imported from CSV files exported from Planning Center, Breeze, or any generic CSV source. The import flow runs a dry-run classification first (showing `create`, `update`, `skip`, and `reject` rows with reasons) before committing. Each row is matched to an existing event by `source_id` for idempotent re-imports. Rows are rejected for missing title, missing or unreadable `starts_at` or `ends_at` (ISO 8601 or US `mm/dd/yyyy` with an optional time), `ends_at` not after `starts_at`, invalid `approval_status` (allowed values: `draft`, `pending`, `approved`, `archived`), or invalid capacity (must be a positive integer). Ministry names are resolved case-insensitively against existing church ministries; unmatched ministry names are flagged in the dry-run preview and the event is imported without a ministry link. `approval_status` defaults to `draft` when absent. Blank cells on a re-import never erase stored values. The import page is `/app/church-admin/events/import` (an Import button is on the Events page). See [Migrating from Planning Center or Breeze](#migrating-from-planning-center-or-breeze).

### Volunteers

Paths: `/app/church-admin/volunteers`, `/app/church-admin/volunteers/schedules`

ChurchAdmin service plans can now be linked to an existing church event from the create flow or the plan detail view. Use that link when the volunteer schedule, run-of-service, and event roster should stay anchored to the same ministry moment.

When a service plan is linked, both service-plan list and detail views expose direct event-ops navigation links to linked event roster, attendance, and registrations. Plan detail also keeps inline event operations for assigned volunteers so ChurchAdmin can add roster entries and check members in without leaving the plan workflow.

If a plan references an event that is no longer available, the schedules workspace now shows explicit relink guidance instead of rendering dead navigation links.

Volunteer workflows cover scheduling, member responses, hours, conflicts, and coverage needs. The roadmap includes deeper burnout guardrails and rotation suggestions.

ChurchAdmin service-plan detail now surfaces assignment response timestamps and reminder audit history for pending responses. Pending assignments can be reminded in place, reminder counts and last-reminded times are retained per assignment, and list/detail views now expose explicit coverage-gap and response-gap indicators.

Service plan detail now includes editable service metadata (service type, scripture reference, sermon title, sermon speaker) and run-of-service item planning with schedule blocks, leader, notes, and attachment links.

### Small Groups

Path: `/app/church-admin/groups`

Admins manage small groups, group leaders, membership requests, meetings, attendance, and resources. Members can browse and request to join open groups.

Groups can be bulk-imported from CSV files exported from Planning Center, Breeze, or any generic CSV source. The import flow runs a dry-run classification first (showing `create`, `update`, `skip`, and `reject` rows with reasons) before committing. Each row is matched to an existing group by `source_id` for idempotent re-imports. Category values must be one of `general`, `life_stage`, `geographic`, `interest`, `discipleship`, `support`, `service`, `youth`, or `seniors`. Leader emails are resolved against existing church profiles; unmatched leaders are flagged in the dry-run preview. A Breeze Tags file (it has a `Tag Name` column) is detected automatically and imports group memberships instead: see the section below. The import page is `/app/church-admin/groups/import` (an Import button is on the Groups page).

### Migrating from Planning Center or Breeze

Paths: `/app/church-admin/people/import`, `/giving/import`, `/attendance/import`, `/groups/import`, `/events/import` (church admin only; the staging tables are church-admin-only too).

Supported files:

| Import | Planning Center | Breeze |
| --- | --- | --- |
| People | People export (Person ID, First/Given/Last Name, Home/Work/Other Email, phones, Household Name, Status, Membership) | People export (Breeze ID, First Name, Last Name, Email, Mobile/Home/Work) |
| Giving | Donation history (Donation amount, Received date, Fund, Remote ID) | Generic giving (Breeze ID or `Anonymous`, Processor ID, Date, Amount, Fund, Note) |
| Attendance | Best-effort, unverified (no documented format) | Attendance (Breeze ID or `Anonymous`, Event Name, Date, Count) |
| Groups | Best-effort, unverified | Tags (Breeze ID, `Tag Name` as `Folder>>Tag`) |
| Events | Best-effort, unverified | Best-effort, unverified (Breeze exports events only through its API) |

Neither vendor publishes its export header row, so the formats above come from vendor templates and third-party tools. Planning Center Check-Ins, Groups and Calendar are unverified until a church supplies a real export (plan item O15). Fixtures and their confidence labels are in `tests/fixtures/imports/README.md`.

How it works:

- **Breeze exports are Excel.** Open the export in Excel, then save it as CSV (UTF-8 is best). The importer does not read `.xlsx` files.
- **Automatic detection.** Paste the CSV or upload a `.csv` file; the page picks Planning Center or Breeze from the headers, so you do not have to choose the source. You can still change it.
- **Forgiving headers and dates.** Header case, spacing and punctuation do not matter. US dates (`mm/dd/yyyy`, `mm/dd/yy`, with times like `10:30am`) are accepted alongside ISO dates and are read in the church's time zone.
- **Linking people.** Rows link to existing people by the vendor's ID first (stored as the member number), then by email. Two churches can have the same member number; a person is only ever matched inside their own church. A people row whose member number belongs to someone with a different email is rejected rather than overwriting them.
- **Names.** The name is First Name + Last Name (Planning Center uses Given Name when First Name is blank; nicknames are ignored). New Planning Center people marked Inactive, or whose Membership contains "visitor", are created with that status; existing people's status is never changed.
- **Tags become group memberships.** Each tag matches an existing group by name (case-insensitive) or creates a new closed group in category `general`, with the Breeze folder kept in the description. Memberships are never duplicated, and a tag that joins an existing group says so in the dry run.
- **Skipped, not failed.** Anonymous attendance head-counts and attendance rows whose person or event is not found are skipped with a reason; events are never created from attendance. Unmatched donors are recorded as anonymous gifts.
- **Ignored columns.** Each dry run lists the column names the importer did not use (names only, never values). Birthdate, address and gender are not imported yet (plan item S25).
- **Limits.** Up to 5,000 rows and 3.5 MB of CSV text per batch. Larger files should be split. A dry run is always required before commit, and Commit is disabled after it succeeds.
- **Safe to repeat.** Re-importing the same file creates nothing new, and a blank cell never erases a stored value. Each commit writes one audit entry (counts only, no personal data).

### Checking an import (reconciliation report)

Path: `/app/church-admin/imports/<batch>` (church admin only). It opens from the "View reconciliation report" link after you commit, and from **Recent imports** on every import page, which lists the last 20 imports of that type with the date, file name, status, mismatch count and a "View report" link. Imports that were only dry runs are not listed there.

What the counts mean:

- **Source rows:** the rows in your file. **Expected (create + update):** the rows the import was supposed to save. **Written:** saved. **Failed:** the import tried and the database refused (the reason is shown). **Not attempted:** the commit stopped before reaching the row. **Skipped** and **Rejected:** rows the dry run set aside, with a reason each (for example a duplicate, an unmatched attendance row or an invalid amount).
- Skipped and rejected rows are listed so you can see them, but they are **not mismatches**.

Mismatches and "Changed since import":

- A **mismatch** is something the import itself got wrong: a row that failed, a row that was never attempted, or a gift whose saved amount, date or fund at the moment of commit differs from your file. Every one is listed, with its row number and reason. A clean import reads "0 mismatches".
- **Changed since import** is a separate list of records edited, deleted or merged after the import (for a gift: a different amount, date or fund; for a person: merged into another). These are normal edits, so they **do not count against the import**. A fund added to a gift after import shows here too.
- For giving, the page also says that the date is compared for updated gifts too, and an update never changes a stored date.

Giving totals and the general ledger:

- Giving shows the **source total** (your file), the **total written at commit**, the **current total** (re-read from the saved gifts) and the **difference** (source minus written at commit), in USD.
- Imported gifts are **not posted to the general ledger**, and ledger totals are not reconciled here. The note is on the page and in the CSV.

The CSV ("Download CSV") has a summary section followed by one line per row: row number, source id, classification, outcome and reason; giving adds amount, date and fund. It deliberately has **no names, emails or phones**. Cells that start with `=`, `+`, `-`, `@`, a tab or a carriage return are neutralized so a spreadsheet cannot run them. Each download is recorded in the audit log (who and which import), and a download that cannot be audited is not served.

Older and incomplete imports:

- An import committed **before ChurchCore recorded row outcomes** shows "Row-level outcomes were not recorded for this import" with the totals saved at the time. It never shows a false zero, and has no CSV.
- If ChurchCore could not finish recording the outcomes (a database refusal during the commit), the page says "Row-level outcomes were not fully recorded for this import" and gives the same kind of message instead of claiming rows were not attempted.
- An import that is still running, or was not committed, shows "Report not available yet". An import left in "Not finished" cannot be released from the app yet (plan item S27).
- A report belongs to your church only; another church's link shows "not found".

### Visitors

Path: `/app/church-admin/visitors`

The visitor workflow tracks first-time visitor follow-up stages from first contact through conversion or inactivity.

### Suggested Ministry Workflows

Path: `/app/church-admin/workflows`

ShepherdAI Ops is an Ops-only recommendation foundation. It uses deterministic signals to suggest ministry workflows, explain why a suggestion exists, and let church admins promote, assign, defer, dismiss, complete, or provide feedback.

It is not a chatbot. It does not replace pastoral judgment. AI-assisted content requires human review.

## 6. Member Workflow

Members enter through `/app` and see a member-focused mobile-friendly navigation:

- **Home:** personal church context and next actions.
- **Calendar:** upcoming church events.
- **Groups:** open small groups and join requests.
- **Schedule:** volunteer and event schedule.
- **Family:** household and family information.

Auxiliary member routes remain available from home cards and deep links:

- **Directory:** church directory visibility based on permissions.
- **Ministries:** ministry participation and opportunities.
- **Giving:** donor history and receipts.
- **My Data:** privacy and data-rights actions.

Member home now includes an enabled-session mobile check-in card. Church admins can enable mobile member check-in per event from event registration settings, set a check-in window, and optionally require an access code. Member check-ins write attendance with `mobile_member` source metadata, while admin quick-check-in paths now record `staff` source metadata.

Member home also includes event self-registration cards for events with open registration. The registration modal renders dynamic per-event form fields configured by ChurchAdmin, supports household-target registration when enabled, and returns registration status as confirmed, waitlisted, or pending approval.

Members can also manage giving, data rights, notification preferences, and communication preferences where those flows are enabled.

**Using it on a phone.** Member home, Schedule, Giving and Family are built for a phone (tested at 390x844 and 360 px wide): every button and field is at least 44 px, pages do not scroll sideways, cards sit in one column (the home quick actions are two across), and each page's main action is on the first screen: the quick actions on home, Confirm or Decline on the next assignment in Schedule, "Give now" in Giving, and edit or add in Family. On a phone the giving history leaves out the Type column and shows a Recurring badge beside the fund. Dates on home and Giving are shown in the church's time zone, so an 8 pm Sunday event reads Sunday. The Calendar page has a "Calendar" heading.

When a church enables household check-in for an event, the member check-in card can also target another person in the same household. The action remains limited to the signed-in family and still honors the event's approved window and access code.

Church admins can also configure optional check-in geofence constraints (latitude, longitude, radius meters) per event. When enabled, member mobile check-in requires browser location access and validates that the device is within the configured on-site radius.

Church admins and pastors can review attendance source patterns in Events Reports using check-in method filters, and event-level attendance logs also support source filtering for operational audit review.

## 7. Public Portal Workflow

Public routes support church-facing entry points before a user is fully signed in:

- `/portal`
- `/portal/register`
- `/portal/events/register`
- `/give/[churchSlug]`

The public portal can resolve a church from the request hostname, so a tenant hostname can route visitors toward the correct church context. Public giving does not expose private tenant data; it displays only live public giving-page configuration.

Public event registration now supports dynamic intake fields configured by ChurchAdmin event settings. Guests can register through `/portal/events/register` for events marked as public with open registration, and submitted registrations follow the same approval and waitlist lifecycle used by member registrations.

Children ministry parent check-in and checkout links now use day-scoped session tokens generated from church-admin children service controls. Links are intentionally safe-by-default: invalid or closed tokens return unavailable states, and closed services rotate session tokens so old links cannot be reused. Parent checkout verification supports PIN/QR or pickup code and also validates guardian name, custody restrictions, and authorized pickup rules.

## 8. Pastor, Elder, And Ministry Leader Workflow

Pastors, elders, and ministry leaders have narrower operational views than ChurchAdmin. Their surfaces focus on:

- people and pastoral awareness
- assigned ministry leadership
- ministry rosters and events
- discernment and reporting workflows
- care follow-up where permitted

The current implementation continues to expand these role-specific paths as the tenant data model matures.

## 9. Control Plane Workflow

Path: `/control`

The control plane is for ChurchCore platform staff, not church staff. It supports platform-level oversight such as:

- tenant registry
- onboarding state
- billing metadata
- platform staff identity
- tenant-view audit trails
- support and operational review

The control plane has its own Supabase project directory under `supabase/control-plane/`. Control-plane data should not be mixed into tenant runtime tables.

## 10. Data And Security Model

ChurchCore treats member information, donations, pastoral notes, prayer journals, children's safety records, care records, volunteer feedback, and account access as sensitive data.

Core expectations:

- church-scoped data access
- row-level security
- explicit role checks
- append-only audit records for sensitive actions
- explicit consent for communications, tracking, and AI-assisted features
- separate control-plane and tenant backends
- no shared fallback database path between control-plane and tenant surfaces

Children's safety data and pastoral/care-related data require especially tight access boundaries.

## 11. Reporting And Operations

The product includes reporting surfaces for members, events, giving, ministries, communications, outreach, finance, and operational health. These reports are intended to support stewardship decisions, not replace human discernment.

Current reporting and dashboard work includes:

- admin dashboard cards
- operations lanes
- giving and finance reports
- Ministry Forge stewardship metrics
- event and attendance reporting
- ShepherdAI workflow signal explanations

## 12. What Is Still In Progress

The active plan is Sprint 2: Admin Dashboard and Church Setup.

Current next areas:

- deeper church settings/profile management
- invite and account-request edge cases
- deeper household workflows
- broader role-management hardening
- more live admin dashboard summaries
- more write-action and ownership-check coverage
- continued parity between local SQL fallback and Supabase relation reads

The authoritative roadmap remains `DEVELOPMENT_PLAN.md`.

## 13. Where To Read Next

| Need | Document |
| --- | --- |
| Roadmap and release discipline | `DEVELOPMENT_PLAN.md` |
| Local backend setup | `docs/setup/local-supabase.md` |
| Control-plane architecture | `docs/control-plane.md` |
| Tenant/control split ADR | `docs/adr/0002-control-plane-and-tenant-separation.md` |
| Church admin people details | `docs/church-admin-people.md` |
| Working calendar details | `docs/working-calendar.md` |
| ShepherdAI architecture | `docs/shepherd-ai-ops.md` |
| Testing map | `docs/testing-schema.md` |
| Current todo | `docs/todo.md` |
