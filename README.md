# ChurchForge

ChurchForge is a secure multi-tenant church operations platform focused on role-based portals, ministry administration, voluntary donations, a working calendar, volunteer coordination, guardrailed AI ministry tools, and graphical stewardship reporting. This repository is aligned to `DEVELOPMENT_PLAN.md` v1.8 and is at release `2.7.0`, incorporating Ministry Forge (Phases 1–3), Elders Discernment Room, Pastor Council Forge, Communications Hub, voluntary Stripe donations, GDPR/CCPA data rights, a full pre-launch checklist, complete church-admin people management, the Sprint 2 attendance / roster / member-identity flow, the newly documented Advanced Ministry Forge specialization direction captured in `ministry-spec.md`, and the first reporting-suite foundation.

## Stack

- Next.js 16 App Router with TypeScript
- Tailwind CSS v4
- Mantine UI as the standard UI framework for ChurchForge surfaces
- Lucide React icons
- GitHub Actions for CI verification

Current plan target:

- Next.js App Router with TypeScript
- Tailwind CSS
- Mantine UI
- calendar tooling integrated into the Mantine shell
- separated control-plane and tenant data boundaries

## Current Plan Highlights

- Role-based portals with least-privilege enforcement for platform, church, ministry, and member workflows.
- The control plane and the tenant-facing church app are now explicitly different products with separate long-term data boundaries.
- Core product scope spanning member directory, ministries, pastoral profiles, giving, reporting, communications, and leadership collaboration.
- Sprint 1 is now explicitly focused on foundation, member portal data, ministries, pastoral titles, and a categorized calendar.
- A working calendar hub remains core, now with explicit event categories defined in the development plan.
- An AI ministry tools suite that stays assistive only, requires consent, and never replaces prayer, Scripture study, or pastoral judgment.
- Security and privacy expectations centered on sensitive-data classification, consent, auditing, and disciplined application security checks.
- Future Ministry Forge work is now explicitly documented around specialized tracks for men, women, children, youth, young adults, marriage, education, missions, and outreach, with deterministic stewardship metrics and tighter safety/confidentiality rules.
- Future reporting work is now explicitly documented as a multi-surface reporting suite spanning members, events, giving, ministries, communications, and outreach, with graphical dashboards and differentiated stewardship insights.

## Release 2.7.0 Highlights

- ChurchForge now includes a first reporting-suite foundation under `/app/reports`, `/app/reports/members`, `/app/reports/events`, and `/app/reports/giving` for pastor and church-admin roles, with graphical dashboards, range switching, and preview-safe data loading.
- Member reporting now surfaces attendance momentum, engagement mix, membership-status distribution, and a Shepherding Watchlist for quiet-drift visibility.
- Event reporting now surfaces turnout curves, category yield, weekday rhythm, check-in method usage, and volunteer pressure context on top events.
- Giving reporting now goes beyond totals into donor journey, gift mix, and fund breakdown, while preserving anonymous-giving protections.
- Tenant giving and communications dashboards no longer crash when Supabase env vars are missing; they now render safe empty states in preview or reduced-backend mode.

## Getting Started

Recommended runtime: Node `22.13.0` or newer.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

For Supabase execution, copy `.env.example` to `.env.local` and supply:

- Current repo runtime still uses the transitional single-backend environment variables below.
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` or `TENANT_SUPABASE_SERVICE_ROLE_KEY` if you want real auth invite delivery for church-admin invites and portal-request approvals
- `SUPABASE_DB_URL` for local direct-database fallback when the local Supabase REST schema cache is unavailable
- `NEXT_PUBLIC_APP_URL` if you want explicit signup confirmation redirects outside the local default

For voluntary donations (Sprint 7+), also supply:

- `STRIPE_SECRET_KEY` — Stripe secret key (`sk_live_…` or `sk_test_…`)
- `STRIPE_WEBHOOK_SECRET` — webhook signing secret (`whsec_…`) for payment confirmation
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — for Stripe Elements on the frontend
- When absent, donation actions return stub results so local dev is unaffected. ChurchForge takes **no platform fees** — 100% of every donation goes directly to the church.

For Communications Hub (Phase 6), also supply:

- `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` — outbound email via SendGrid
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` — outbound SMS via Twilio
- When these vars are absent the notification actions log to the console and return a stub result so local dev is unaffected.

Architectural note:

- ADR 0002 now makes separate control-plane and tenant databases the target architecture.
- The current single-project local Supabase setup is transitional and must not be treated as the final model.

For the current local Supabase development endpoints, keys, and service URLs, see `SUPABASE.md`.

Primary routes:

- `/` marketing and product-direction overview
- `/sign-in` preview sign-in and protected-route entry
- `/control` platform control plane for ChurchForge staff
- `/controll` compatibility redirect to `/control`
- `/app` tenant-facing church application entry
- `/app/[role]` church role workspace
- `/app/calendar` tenant-facing working calendar hub backed by Supabase event reads when configured
- `/portal` public member-portal landing page with sign-in and request-access entry points
- `/portal/register` public member portal request form
- `/app/church-admin/people` church-admin people-management — search, filter, edit, bulk update, add person (offline record), invite user (Supabase auth email), deactivate
- `/app/church-admin/accounts` church-admin account-request approval queue
- `/app/church-admin/events/[id]` event-specific attendance and roster workspace with quick check-in, burnout warnings, and visitor add flow
- `/app/church-admin/ministry/[id]` Ministry Forge dashboard (health score, vision board, volunteer matcher)
- `/app/reports` graphical reporting suite overview for pastor and church-admin
- `/app/reports/members` member intelligence dashboard with attendance, engagement, and drift reporting
- `/app/reports/events` event intelligence dashboard with turnout, staffing pressure, and visitor-touch reporting
- `/app/reports/giving` giving intelligence dashboard with fund, donor-journey, and generosity-mix reporting
- `/app/member/directory` member-facing directory route
- `/app/member/family` member-facing household route
- `/app/member/ministries` member-facing ministry assignments route
- `/app/pastor/people` pastor-facing people route with the initial pastoral-care workflow
- `/app/elders/discernment` Elders Discernment Room — pastor-only private session and notes workspace
- `/app/elders/discernment/[sessionId]` per-session prayer wall, elder notes, and AI Wisdom Prompt
- `/app/council/forge` Pastor Council Forge — versioned collaborative notes for pastor and church-admin
- `/app/communications` Communications Hub — consent-aware email/SMS broadcast for pastor and church-admin
- `/app/member/giving` member donor portal — giving history, active recurring, Give drawer (voluntary, anonymous option)
- `/app/member/data-rights` member data rights — GDPR/CCPA export and deletion request
- `/app/giving` giving reporting dashboard for pastors and church-admins (fund breakdown, totals, recurring count)
- `/control/launch-checklist` interactive pre-launch checklist for platform operators (47 items across 8 sections)
- `/workspace` compatibility redirect to the new split entry
- `/calendar` compatibility redirect to the new split entry
- `/plan` development-plan summary
- `/adr/backend-platform` backend ADR summary

## Scripts

- `npm run dev` starts the local development server.
- `npm run lint` runs ESLint across the repo.
- `npm run build` creates the production build.
- `npm run start` serves the production build locally.
- `npm run check` runs lint plus production build.

## Project Structure

```text
app/                  Next.js App Router entrypoints, layouts, and pages
components/           Shared UI primitives plus marketing and application components
docs/                 Architecture notes, ADRs, and feature documentation
lib/                  Shared utilities, site configuration, and portal mock data
lib/supabase/         Supabase SSR client and configuration helpers
supabase/             SQL migrations and backend foundation assets
public/               Static assets
.github/workflows/    CI automation
```

## Current Application Surface

- The landing page is now a minimal entry surface instead of a feature-heavy marketing preview.
- The sign-in route is intentionally minimal and routes through Supabase SSR auth when configured, with preview auth retained only as a local fallback.
- The control-plane routes provide a protected platform-operator surface for tenant lifecycle, billing, support, and provisioning.
- The church-app routes provide protected role-based portals for ChurchAdmin, Pastor / Elder, MinistryAdmin / Leader, and Volunteer / Member flows.
- Auth sessions now resolve an explicit app context from control-plane access plus church membership data, so actor identity and active product surface are no longer conflated.
- The backend access layer is now split in code between control-plane and tenant wrappers under `lib/supabase/control-plane.ts` and `lib/supabase/tenant.ts`, with the old single-project local Supabase setup retained only as transitional fallback.
- Tenant launch from `/control` is now registry-driven, with the control plane resolving the tenant runtime target through `tenants` and `tenant_connections` before entering `/app`.
- Control-plane routing now resolves the tenant runtime church target from `tenant_connections.metadata.runtime_church_id`, which keeps platform tenant IDs separate from tenant-runtime church IDs.
- Platform admins can now launch an explicit tenant view from the control plane and return to ChurchForge Control without implicit cross-over.
- When Supabase is configured, the control plane now reads live church and membership counts plus recent tenant-view audit events from database records instead of relying only on mock tenant lists.
- Local development can now fall back to direct Postgres reads and writes for app-owned Supabase tables when the local REST schema cache is unavailable.
- The church app session now hydrates from real `profiles` rows when available, so `/app` and the app shell resolve live church-scoped user data instead of relying only on preview profile templates.
- The member portal under `/app/member` now reads real profile, ministry-assignment, and upcoming-event data from Supabase instead of using only the generic preview workspace.
- The church-admin side now includes a real `/app/church-admin/people` screen for church-scoped record management and status updates.
- ChurchAdmin people management now includes bulk updates for membership status, directory visibility, and contact permission across selected records.
- ChurchAdmin people management now includes household reassignment and duplicate-profile merge tooling, with merged profiles retired from downstream member and pastor views.
- The church-admin side now includes `/app/church-admin/accounts` for reviewing public portal requests, approving them with generated member numbers, and sending member invites when the tenant service-role key is configured.
- The church-admin and pastor flows now include `/app/church-admin/events/[id]`, an event-specific attendance and roster workspace with quick check-in, visitor capture, roster confirmation, and seven-day burnout warnings.
- Church leadership roles now also have `/app/reports`, `/app/reports/members`, `/app/reports/events`, and `/app/reports/giving`, a first reporting-suite foundation with graphical stewardship dashboards and preview-safe fallback behavior.
- The churchgoer portal now has a public `/portal` landing page plus `/portal/register`, where prospective members can request portal access and be linked to an existing profile by email when possible.
- The member experience is now split further into dedicated directory and household routes, and the main member home now includes attendance history, upcoming serving assignments, and interest / contact-preference self-service.
- The pastor role now resolves to a pastor-specific workspace backed by tenant profile, ministry, and follow-up data instead of the generic role shell.
- The pastor experience now includes a dedicated people view with search, status filtering, household context, contact visibility, and last-attendance signals.
- The pastor people route now includes a first pastoral-care workflow with pastor-only notes, church-scoped care assignments, and assignment status updates.
- The protected shell now uses a light-only Mantine direction with less chrome, less copy, and a simpler hierarchy across control-plane and church-app surfaces.
- The protected shell now exposes an explicit visible logout action in the header instead of hiding sign-out only inside the profile menu.
- The current UI direction is now formally documented in `docs/UI-UPDATES.md`, with a blue-neutral palette, higher-contrast hierarchy, and dark mode intentionally deferred until token work is complete.
- The pastoral-care workflow is documented in `docs/pastoral-care-foundation.md` so future confidentiality and governance work has a concrete baseline.
- The church-app calendar route now reads live categorized `events` rows from Supabase and presents them as a simple upcoming-events board with category filters and a detail drawer.
- Church management roles can now create, edit, and delete categorized events from the tenant calendar route, and all church users can persist RSVP responses against live `event_rsvps` rows.
- The tenant calendar now renders full Month, Week, and Day calendar views with an event-kind filter that can target a single category or show all categories.
- The ChurchAdmin workspace uses segmented operation lanes with slide-over detail drawers, while the heavier preview metrics and promo-style copy have been removed.
- The repo now includes Supabase SSR auth foundations, a root proxy, and an initial SQL schema scaffold for multi-tenant church data.
- Preview auth remains available only as a fallback when Supabase environment variables are not configured locally.
- Ministry Forge (Phases 1–3) adds per-ministry health scoring, vision boards, scriptural anchors, kingdom impact logging, and a rule-based AI Volunteer Matcher with human-gated approve/reject and a Burnout Guardian.
- The Elders Discernment Room at `/app/elders/discernment` is a pastor-only workspace with open/prayer/voting session tracking, a per-session prayer wall with "I Prayed" acknowledgements, elder notes with confidentiality controls, and a theological guardrail AI Wisdom Prompt that surfaces Scripture and reflection questions only — never decisions.
- The Pastor Council Forge at `/app/council/forge` provides versioned collaborative notes (auto-incrementing version on each save) across five note types: general, sermon outline, series plan, council minutes, and sabbath reflection.
- The Communications Hub at `/app/communications` enables pastors and church-admins to compose and broadcast email or SMS to congregation members, with per-member consent checking via `notification_preferences`, full `communication_logs` audit trail, and graceful local-dev stubs when SendGrid/Twilio are not configured.
- The member portal bottom nav now includes a Ministries tab alongside Home, Calendar, Directory, and Family, with all five routes pre-cached by the service worker for offline access.
- The voluntary donations system at `/app/member/giving` lets members give one-time or recurring gifts with fund designation and anonymous option. ChurchForge takes no platform fee — 100% goes to the church. Receipt emails sent via SendGrid.
- Members can download a full JSON export of their personal data or request account deletion with a 30-day grace period from `/app/member/data-rights` (GDPR/CCPA aligned).
- Pastors and church-admins have a giving reporting dashboard at `/app/giving` with fund breakdown, monthly and all-time totals, and recurring-gift counts. Anonymous donations are never de-anonymised in the UI.
- Platform operators have a `/control/launch-checklist` with 47 interactive verification items across RLS, donations, AI guardrails, communications, data rights, security, mobile/PWA, and role access.

## Documentation Discipline

Every significant change must keep these files current:

- `README.md`
- `CHANGELOG.md`
- `DEVELOPMENT_PLAN.md`
- `docs/UI-UPDATES.md` for visual-system decisions
- Relevant feature or architecture docs in `docs/`

Current tracked follow-up:

- See `Reports-implementation.md` for the reporting-suite implementation plan covering member, event, giving, ministry, communications, outreach, and executive dashboards.
- See `ministry-spec.md` for the repo-level ministry source-of-truth and doc index for Ministry Forge planning.
- See `docs/todo.md` for the remaining Supabase project hookup steps.
- See `docs/church-admin-people.md` for the current ChurchAdmin people-management scope.
- See `docs/church-admin-workspace.md` for the current ChurchAdmin operations, accounts, and event-management scope.
- See `docs/sprint2-attendance-identity-flow.md` for the detailed Sprint 2 engineering description covering schema, routes, actions, and current constraints.
- See `docs/advanced-ministry-forge-research-spec.md` for the reconciled engineering direction for specialized ministry tracks, stewardship metrics, children safety, mentorship visibility, and confidentiality guardrails.
- See `SUPABASE.md` for the active local Supabase reference values used during development.
- See `advanced_ministry_elder_pastor.md` for the advanced ministries, elders, and pastor-council feature direction.
- See `churchgoer_data.md` for the churchgoer data and self-service portal source of truth.
- See `docs/churchgoer-pastor-execution-plan.md` for the current execution sequence across churchgoer and pastor data work.
- See `docs/pastoral-care-foundation.md` for the current pastoral notes and care assignment scope.
- Phase 6 Communications Hub requires `SENDGRID_*` and `TWILIO_*` env vars for live sends; see `.env.example` for the full list.

## GitHub Workflow Discipline

- Feature and bug issues should cite the relevant `DEVELOPMENT_PLAN.md` sections before implementation starts.
- Pull requests should explain plan alignment, validation performed, and any security, AI, or sensitive-data implications.
- Use the checked-in templates in `.github/` so planning and review stay consistent with the development plan.

## Architecture Notes

- ADR 0001 is now accepted in favor of Supabase with Postgres, Auth, Realtime, and Storage.
- ADR 0002 is now accepted in favor of separating control-plane and tenant data boundaries, including separate databases.
- The current repo establishes the frontend shell, Supabase SSR auth foundation, boundary-aware control-plane and tenant data access wrappers, member portal, live calendar read path, initial multi-tenant schema scaffold, design system baseline, and release discipline expected for future feature work across RBAC portals, ministry operations, calendar workflows, and AI-assisted features.

## CI

The repository includes a GitHub Actions workflow that installs dependencies, lints, and builds on pushes and pull requests.
