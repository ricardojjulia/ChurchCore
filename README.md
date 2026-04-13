# ChurchForge

ChurchForge is a secure multi-tenant church operations platform focused on role-based portals, ministry administration, donations, a working calendar, volunteer coordination, and guardrailed AI ministry tools. This repository is aligned to `DEVELOPMENT_PLAN.md` v1.5 and is now cut as the `1.0.0` foundation release.

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
- `SUPABASE_DB_URL` for local direct-database fallback when the local Supabase REST schema cache is unavailable
- `NEXT_PUBLIC_APP_URL` if you want explicit signup confirmation redirects outside the local default

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
- `/portal` dedicated churchgoer portal entry route that resolves to the member workspace
- `/app/church-admin/people` church-admin people-management route
- `/app/member/directory` member-facing directory route
- `/app/member/family` member-facing household route
- `/app/pastor/people` pastor-facing people route with the initial pastoral-care workflow
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
- The churchgoer portal now has a dedicated `/portal` entry route, enriched member data with family and directory context, and a stronger self-service screen foundation.
- The member experience is now split further into dedicated directory and household routes so people data is easier to manage without overloading the main member home screen.
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

## Documentation Discipline

Every significant change must keep these files current:

- `README.md`
- `CHANGELOG.md`
- `DEVELOPMENT_PLAN.md`
- `docs/UI-UPDATES.md` for visual-system decisions
- Relevant feature or architecture docs in `docs/`

Current tracked follow-up:

- See `docs/todo.md` for the remaining Supabase project hookup steps.
- See `docs/church-admin-people.md` for the current ChurchAdmin people-management scope.
- See `SUPABASE.md` for the active local Supabase reference values used during development.
- See `advanced_ministry_elder_pastor.md` for the advanced ministries, elders, and pastor-council feature direction.
- See `churchgoer_data.md` for the churchgoer data and self-service portal source of truth.
- See `docs/churchgoer-pastor-execution-plan.md` for the current execution sequence across churchgoer and pastor data work.
- See `docs/pastoral-care-foundation.md` for the current pastoral notes and care assignment scope.

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
