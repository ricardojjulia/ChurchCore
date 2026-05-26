# MVP Readiness Audit

Date: May 9, 2026  
Scope: ChurchCore Ops evaluation snapshot on the Sprint 2 branch.

## Executive Verdict

ChurchCore Ops can plausibly help run a church, but it is not yet a clean MVP without tightening the operator path. The product has the right major modules: people, households, ministries, events, children, giving, finance, communications, groups, volunteers, care signals, and reporting. The main readiness risk is not missing ambition; it is workflow clarity and confidence that each role can find the next action without knowing the codebase.

For MVP, the app should be judged by whether a church admin can complete one realistic week:

1. Set up church profile basics.
2. Add or approve people.
3. Organize households and member status.
4. Create or review Sunday events.
5. Confirm children's ministry safety readiness.
6. Confirm volunteers and attendance.
7. Review giving and finance exceptions.
8. Send or review communications.
9. Hand off pastoral/ministry follow-up.
10. See reports that explain what changed.

The current product covers most of these areas. The gaps are mostly in route discoverability, end-to-end task completion, and readiness checks.

## What Is Working

- **Church operating scope is right:** the modules match real church administration better than a generic CRM would.
- **ChurchAdmin is the correct MVP anchor:** church admins are the users who need the broadest connected workflow first.
- **People management is headed the right direction:** account requests, households, statuses, roles, and duplicate concerns are in the same orbit.
- **Children's ministry is a strong differentiator:** safety, check-in, emergency roster, volunteers, and incidents are meaningful MVP value if access boundaries stay tight.
- **Finance is unusually complete for an early product:** chart of accounts, journals, budgets, imports, and reports are enough to evaluate serious church-office use.
- **The control-plane split is the right architecture:** tenant operations and platform operations should not share one loose data model.
- **Preview fallback is valuable:** evaluators can inspect the product without setting up Supabase.

## Product Fit: Does It Help Run A Church?

Yes, if the MVP target is a church office running weekly operations, not a public marketing launch. The strongest flows are:

- church profile setup
- people and household records
- public portal account review
- event and attendance operations
- children's ministry execution
- small groups
- giving and finance review
- ministry health and leadership assignment

The weaker flows are:

- end-to-end onboarding from public registration to active member account
- member self-service completion and confirmation states
- staff invitation and auth-email change management
- communications send lifecycle beyond operational summaries
- reports as a daily decision surface rather than a destination page
- pastor and ministry-leader task paths compared with ChurchAdmin

## Information Architecture Findings

### Fixed In This Pass

- ChurchAdmin navigation now includes workflows that already existed but were not visible from the main admin sidebar:
  - Account Requests
  - Suggested Workflows
  - Reports
- The donations route is labeled **Donations** and the admin giving route is labeled **Giving Ops** to reduce ambiguity.
- Active sidebar state now follows the current route instead of leaving Home active.

### Remaining IA Issues

- ChurchAdmin still has a long flat sidebar. MVP can tolerate this, but it will not scale. The next design step should group navigation into:
  - Setup
  - People
  - Weekend
  - Ministries
  - Money
  - Insights
- Calendar appears both as a global app link and as events/attendance routes. That is acceptable, but the distinction should be sharper:
  - Calendar: what is happening
  - Events: event records and rosters
  - Attendance: service headcounts
- Pastor, elder, and ministry-leader surfaces need clearer entry points once ChurchAdmin stabilizes.

## UI Fit

The UI direction is mostly right for an operations product:

- restrained, dashboard-like, and scan-friendly
- Mantine components are appropriate for admin workflows
- tables, badges, summary cards, drawers, and segmented controls fit the domain
- the product avoids a marketing-heavy application shell

MVP UI risks:

- too many rounded cards can make dense admin work feel softer than necessary
- some labels are product-internal rather than church-office language
- home dashboard actions need stronger visual priority between urgent, warning, and informational work
- repeated modules need consistent empty, loading, and unavailable-backend states

## Verification Findings

### Passed

- `npm run smoke:preview`
- `/`, `/sign-in`, `/portal`, and `/plan` return successfully in preview smoke.
- `/portal` and `/portal/register` no longer crash from server-to-client function props.

### Fixed In This Pass

- `lib/supabase/config.test.ts` had an obsolete expectation that shared `SUPABASE_DB_URL` should still back both control-plane and tenant DB access. ADR 0002 says that path is removed, so the test now expects explicit split DB URLs.
- `smoke-demo.sh local` could report progress after a failed sign-in because it only checked for a redirect status. It now fails when sign-in redirects with an error and when protected routes land back on `/sign-in`.

### Current Local Caveat

The local smoke path validates the tenant demo app that `npm run setup:local` provisions. Local control-plane smoke remains a separate follow-up because the current setup script creates tenant demo users only.

## MVP Blockers

These should be closed before calling the product MVP-ready:

- **Reliable local demo:** `npm run setup:local`, `npm run dev`, and `npm run smoke:local` must pass on a clean machine. The local smoke now includes the Daily Desk and ChurchAdmin readiness routes.
- **Spanish UI path:** the public entry flow, shared application shell, Daily Desk, member home/directory/family surfaces, and high-traffic ChurchAdmin home/readiness/account approval/settings/people surfaces now have English/Spanish dictionary coverage. Remaining MVP modules still need translation extraction and review before claiming full Spanish readiness; the rollout is tracked in `docs/plans/spanish-ui-coverage.md`.
- **Control-plane local demo:** either provision local control-plane staff users during setup or move control-plane checks into a separate explicit smoke command.
- **Account onboarding path:** public registration, account approval, user invite, membership linkage, first sign-in, and profile hydration now have a documented happy path. Local smoke submits a portal request and verifies it appears in the admin approval queue; keep expanding this into a browser-level approve-and-sign-in smoke as test tooling grows.
- **Daily operator path:** `/app/daily-desk` now gives church admins and pastors one daily surface for calls, notes, visits, calendar-related items, checkups, near-term events, and live operational signals.
- **ChurchAdmin weekly path:** `/app/church-admin/readiness` now provides the guided route through setup, people, event, children, volunteers, giving, communications, reports, and suggested workflows. Readiness links now open filtered target views for people, events, children's ministry, volunteers, giving/finance, communications, draft journals, and suggested workflows. The first shared `ReadinessSummary` contract is now in place for status, severity, issue count, recommended action, target route/query, and completion state. Setup, account request, people/household, weekend event, children's ministry, volunteer schedule, giving/finance, communications, and suggested workflow readiness now use module-owned builders. Continue tightening each item until every target route has a complete resolve flow and module-owned readiness loader.
- **Readiness resolution:** Children's Ministry, Giving/Finance, and draft-journal readiness views now include direct resolution actions or next-workflow buttons. Continue adding the same treatment to any remaining readiness target that still only reports a problem.
- **Empty/error states:** every admin module should explain whether it has no data, no backend, or insufficient permission.
- **Role access audit:** verify ChurchAdmin, Secretary / Office Admin, Pastor, Ministry Leader, Member, and Control Plane cannot see each other's restricted data.
- **Mobile sanity pass:** member routes and check-in/checkout routes must be usable on phone-sized screens.

## MVP Polish Queue

Priority 1:

- Make local Supabase demo smoke pass reliably from generated credentials.
- Expand the "ChurchAdmin weekly readiness" smoke path into a full route-by-route Playwright flow.
- Add query-aware readiness filters to the remaining money and children's ministry targets.
- Finish account-request invite edge cases and document the operator path.
- Add missing empty/error states for settings, people, events, children, giving, finance, reports, and workflows.

Priority 2:

- Group ChurchAdmin navigation.
- Add route-level breadcrumbs for deep admin pages.
- Tighten dashboard urgency styling.
- Add a lightweight in-app launch checklist for church admins, separate from the platform launch checklist.

Priority 3:

- Expand pastor and ministry-leader home surfaces.
- Add CSV people import.
- Add communications delivery provider integration.
- Add richer reporting drilldowns.

## MVP Definition

ChurchCore Ops is MVP-ready when a new evaluator can do this without help:

1. Start the app locally.
2. Sign in as the demo church admin.
3. Understand the church's current operational state from the dashboard.
4. Approve or reject a portal account request.
5. Update a person and household record.
6. Review a Sunday event roster and attendance path.
7. Open children's ministry and identify safety status.
8. Review giving exceptions and finance reports.
9. Find suggested ministry workflows.
10. Read the application guide and understand what is implemented versus planned.

That is the bar I would use for the next readiness pass.
