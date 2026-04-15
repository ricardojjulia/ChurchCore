# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Documentation

- Updated `DEVELOPMENT_PLAN.md` to version `1.7`, explicitly adding specialized ministry pathways for men, women, children, youth, young adults, marriage, education, missions, and outreach plus stronger stewardship-metric and safety/privacy guidance.
- Updated `advanced_ministry_elder_pastor.md` to version `1.1` so Ministry Forge planning now points to the specialized track architecture and its stricter confidentiality requirements.
- Added `ministry-spec.md` as the repo-level ministry source-of-truth summarizing approved pathways, deterministic metrics, security guardrails, and document precedence.
- Added `docs/advanced-ministry-forge-research-spec.md`, a detailed engineering-direction document reconciling the new Ministry Forge research spec with the repo's existing `ministries`, `profile_ministries`, burnout, and member-identity foundations.
- Updated `README.md` to reference the new advanced ministry research specification and the plan-version bump.

## [2.6.0] - 2026-04-14

### Added

- Added Sprint 2 tenant migration `20260420000000_sprint2_attendance_identity_flow.sql`, which decouples offline `profiles` from `auth.users`, adds `member_number`, `account_status`, and `is_roster_eligible`, extends `attendance` with `church_id` and `check_in_method`, creates `event_rosters` and `account_requests`, tightens attendance RLS to church-admin / pastor management scope, and attaches audit triggers for attendance, rosters, and account-request changes.
- Added public portal registration at `/portal/register` plus a public `/portal` landing page, backed by `list_portal_churches()` and `submit_account_request(...)` RPCs for church selection and request submission without exposing tenant profile tables directly.
- Added `/app/church-admin/accounts` with a church-admin approval queue for public portal requests, including existing-member linking, generated member numbers, and invite delivery when a tenant Supabase service-role key is configured.
- Added `/app/church-admin/events/[id]` for event-specific roster and attendance management, including roster assignment, confirmation toggles, quick member check-in, quick-add visitor + check-in, seven-day burnout warnings, and care-follow-up prompts with the standard AI disclaimer.
- Extended the member portal data model and `/app/member` home so members can view attendance history, upcoming serving assignments, and edit `preferred_contact_method` plus `interests`.

### Changed

- Changed `/portal` from an authenticated redirect-only entry into a public landing page with sign-in and request-access entry points.
- Changed the calendar event drawer so church-admin and pastor users can jump directly into the new event attendance / roster workspace.
- Changed `inviteUserAction` to use the tenant service-role client when available and to wire invited users back into church memberships and tenant profile records instead of sending an auth invite only.

### Fixed

- Fixed member profile updates to persist `interests` alongside preferred contact method and other self-service profile fields.
- Fixed the tenant profile-auth alignment model so new auth users can merge onto existing offline profiles by email instead of always creating a second record.

### Release Notes

This release closes the gap between church-admin people management and a usable member-facing identity flow.

Before `2.6.0`, ChurchForge could manage tenant people records and send direct invites, but the product did not yet support the more realistic church workflow where:

- someone is known to the church before they have an auth account
- a member requests portal access from a public page
- an admin reviews that request in tenant context
- the approved member receives a church-scoped invitation
- weekend event operations need rosters and check-in in the same place

`2.6.0` introduces that missing connective tissue.

The largest architectural shift in this release is the move from auth-coupled profiles to offline-capable profiles. `profiles.id` is no longer forced to equal `auth.users.id`; instead, `profiles.user_id` becomes the optional auth linkage. That lets ChurchForge create visitor and member records first, then attach an auth user later during invitation or first account activation. This is the foundation that makes public portal requests, event visitors, and roster-first operations practical.

The public portal is now a real product surface. `/portal` is no longer just a protected redirect. It is now a public landing page with a clear split between existing sign-in and new access requests. `/portal/register` submits church-scoped requests with only the minimum identity fields required for review. Those requests are stored in `account_requests` and optionally linked to an existing member profile by matching email within the church boundary.

On the church-admin side, `/app/church-admin/accounts` becomes the approval workspace for this new flow. Pending requests can be reviewed, approved, or rejected. Approval generates a collision-checked `member_number`, upgrades or creates the tenant profile, and sends a Supabase invitation when the tenant service-role key is available. In preview or reduced-backend mode, the record changes still occur but invite delivery is intentionally skipped with clear UI feedback.

Weekend and event operations also deepen significantly in this release. `/app/church-admin/events/[id]` is a dedicated event workspace that combines roster management and attendance tracking instead of leaving those tasks spread across generic calendar editing and people screens. Church-admins and pastors can add roster entries with custom role titles, confirm assignments, check members in quickly, and create a visitor profile while logging attendance in the same action. The event drawer in the calendar now links directly into this deeper workspace for the roles that can manage it.

Member self-service expands as well. The main member home now exposes attendance history, upcoming serving assignments, member-number visibility, and richer profile updates including `interests`. This keeps the member portal aligned with the new identity and roster model instead of making attendance and serving admin-only concepts.

Security and tenant separation remain the controlling constraints across the release. Public request submission is mediated through explicit RPCs rather than raw table reads, attendance and roster access are narrowed to self or church-admin / pastor scope, and every new write-heavy table introduced by the release is attached to the existing audit trigger pattern. The implementation also continues to respect ADR 0002 by keeping these flows entirely in the tenant app and tenant data plane instead of crossing back into control-plane tables for day-to-day church operations.

## [2.5.0] - 2026-04-14

### Added

- Added **Add person** modal to the church-admin People page — creates an offline churchgoer record (name, email, phone, membership status, role) without requiring a Supabase auth account; suitable for walk-in visitors and paper-roll imports. Gracefully stubs in preview mode.
- Added **Invite user** modal — sends a Supabase auth invite email to a specified address so the recipient can sign in with a pre-assigned role (`member`, `ministry-leader`, `pastor`, `church-admin`). Displays an informational toast in preview mode when no backend is running.
- Added **Deactivate person** action inside each person's edit modal, under a "Danger zone" divider. Sets `membership_status = inactive`, hides from directory and contact lists, and deactivates all `church_memberships` rows for that person. Requires a confirm step before executing.
- Expanded the church-admin sidebar nav on both the home dashboard (`/app/church-admin`) and the People page (`/app/church-admin/people`) to include direct links to: Communications Hub, Giving Dashboard, and Ministry Forge.
- Added `addChurchgoerAction`, `inviteUserAction`, and `deactivateChurchAdminPersonAction` server actions in `app/app/actions.ts` with full local-DB and Supabase path support and church-admin session guards.

### Fixed

- Corrected `shouldUseLocalControlPlaneDbFallback` to guard `hasControlPlaneSupabaseEnv()` before calling `getControlPlaneSupabaseEnv()`, preventing a crash when no Supabase env vars are set.
- Added early null-return to `resolveTenantViewTarget` when no control-plane backend is configured (preview mode), eliminating a runtime 500 in `launchTenantViewAction`.
- Converted `TenantViewLauncher` and `ReturnToControlPlaneButton` from `<form action={...}>` to `useTransition` + try/catch + `notifications.show()` so server action errors surface as toasts instead of crashing the page.
- `TenantViewLauncher` now accepts `isPreview` from `ControlPlaneDashboard` (derived from `session.source === "preview"`) and disables the launch button with an explanatory tooltip when Supabase is not running locally.

## [2.0.0] - 2026-04-19

### Added

- Added Sprint 7+ Launch Readiness migration (`20260419000000_launch_readiness_sprint7.sql`): `donations` table (voluntary-only, Stripe-backed, full RLS, audit trigger); `ai_interactions` audit table (feature, disclaimer_shown, model; management-only RLS); `stripe_customers` lookup table; `data_export_requested_at`, `data_delete_requested_at`, `data_delete_approved_at` columns on `profiles` for GDPR/CCPA self-service.
- Added `lib/stripe/` module: `client.ts` (lightweight Stripe API caller, no heavy SDK dependency until church opts in) and `donations.ts` (`createPaymentIntent`, `createOrGetStripeCustomer`, `cancelStripeSubscription`) — all with graceful local-dev stubs when `STRIPE_SECRET_KEY` is absent.
- Added `lib/donations-data.ts`: `getDonorPortalData` (member giving history + total) and `getGivingDashboardData` (leader report by fund, monthly/all-time totals, recurring count).
- Added `app/app/donations-actions.ts`: `initiateDonationAction` (creates PaymentIntent + pending donations row), `confirmDonationAction` (marks succeeded + sends thank-you receipt email), `cancelRecurringDonationAction` (cancels Stripe subscription + marks cancelled). All giving uses voluntary language — no platform fee.
- Added Donor Portal at `/app/member/giving` — giving history table, active recurring gifts with cancel flow, and a Give drawer with fund designation, anonymous option, receipt email, and voluntary-language notice.
- Added Giving Dashboard at `/app/giving` (pastor and church-admin only) — this-month / all-time / recurring summary cards, recent gifts table, and fund breakdown with ring-progress allocation.
- Added `lib/compliance/data-rights-actions.ts`: `requestDataExportAction`, `requestAccountDeletionAction`, `cancelDeletionRequestAction`, `generateDataExportAction` (builds JSON export of profile, memberships, donations, consent logs, notification preferences). Staff accounts blocked from self-service deletion.
- Added `DataRightsPanel` component at `components/portal/data-rights-panel.tsx` — Download My Data (request + JSON download), Privacy Rights notice, Request Account Deletion with 30-day grace-period cancellation.
- Added Data Rights route at `/app/member/data-rights` — member-only; surfaces `DataRightsPanel` with current export/delete request state.
- Added Launch Checklist at `/control/launch-checklist` — interactive pre-launch verification checklist for platform operators covering RLS, donations, AI guardrails, communications, data rights, security, mobile/PWA, and role access (8 sections, 47 items, progress ring).
- Added Stripe env vars to `.env.example` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`).

## [1.5.0] - 2026-04-18

### Added

- Added Phase 6 — Communications & Polish: `notification_preferences` table (per-member, per-church opt-in for email/sms/push/in-app channels) and `communication_logs` table (append-only outbound audit trail with channel, status, external provider ID, and body preview); both with RLS and audit triggers.
- Extended `consent_logs` with an optional `communication_type` column so consent records can be scoped to a specific channel.
- Added `lib/notifications/` module: `send-email.ts` (SendGrid Mail Send API wrapper with local-dev stub), `send-sms.ts` (Twilio Messages API wrapper with local-dev stub), `queue-communication.ts` (consent-aware dispatcher — checks `notification_preferences`, dispatches to the correct provider, writes a `communication_logs` audit row).
- Added Communications Hub at `/app/communications` — compose and broadcast messages to members by channel (email or SMS), filter recipients by role, bulk-select, preview consent/opt-out warnings before sending, schedule for a future time, and view the full message log with status badges. Visible to pastor and church-admin roles only.
- Added `broadcastMessageAction` and `updateNotificationPreferencesAction` in `app/app/communications-actions.ts`.
- Added `getCommunicationsHubData` data loader in `lib/communications-data.ts` with local-DB SQL and Supabase client paths.
- Added `NotificationPreferencesForm` reusable component for members to opt in/out of each notification channel from their profile.
- Added `/app/member/ministries` to the `MemberBottomNav` tab bar (Home, Calendar, Directory, Ministries, Family) and to the PWA offline cache list in `public/sw.js`.
- Added SendGrid and Twilio env var stubs to `.env.example` (`SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`).
- Added Phase 4 — Elders Discernment Room foundations: `elder_notes`, `discernment_sessions`, `prayer_requests`, `prayer_acknowledgements` tables with stricter-than-admin RLS via new `can_access_elder_data()` helper (pastor / elder role only — church admins explicitly excluded per `advanced_ministry_elder_pastor.md §9`).
- Added `council_notes` table for Pastor Council Forge with `note_type` enum (`general`, `sermon_outline`, `series_plan`, `council_minutes`, `sabbath_reflection`) and auto-incrementing version trigger; accessible by pastor and church-admin via `can_access_council_data()`.
- Added `prayer_acknowledgements` table with a unique `(prayer_request_id, profile_id)` constraint and a trigger that keeps `prayer_requests.prayed_count` in sync — full "I Prayed" audit trail without in-place counter mutation.
- Added full audit trigger coverage for all four Phase 4 tables via the existing `audit_log_changes()` function.
- Added Elders Discernment Room at `/app/elders/discernment` — private, pastor-only workspace with open / in-prayer / voting session list, elder notes panel, and create-session and add-note drawers.
- Added Discernment Session detail page at `/app/elders/discernment/[sessionId]` — per-session prayer wall with "I Prayed" one-tap acknowledgement, elder notes sidebar, live status controls (open → prayer → voting → closed), and AI Wisdom Prompt button.
- Added `PrayerWall` component: add-request modal with anonymous option, per-request "I Prayed" button with optimistic count update, purple heart indicator for acknowledged requests.
- Added `AiWisdomPrompt` component: theological guardrail modal that surfaces Scripture references and reflection questions only — never recommendations or decisions. Disclaimer shown before and after every AI output per `§6`. Only the topic text is sent — no member data, notes, or PII.
- Added `DiscernmentSessionCard` component with status badge, date, prayer-request count, and "Enter room" link.
- Added Pastor Council Forge at `/app/council/forge` — collaborative versioned notes workspace for pastor and church-admin roles with tabbed views by note type, create and edit drawers, version badge on every save.
- Added `CouncilForge` component with per-type tabs, note cards with version history, and a stubbed liturgical calendar integration note (Phase 5).
- Added `lib/elders-types.ts` with shared types (`DiscernmentSession`, `PrayerRequest`, `ElderNote`, `CouncilNote`), status colour/label maps, and `ELDER_AI_DISCLAIMER` constant.
- Added `lib/elders-data.ts` with `getDiscernmentRoomData`, `getDiscernmentSessionDetail`, and `getCouncilForgeData` data loaders (local SQL + Supabase paths; role assertions at application layer in addition to DB RLS).
- Added six server actions in `app/app/elders-actions.ts`: `createDiscernmentSessionAction`, `updateDiscernmentSessionStatusAction`, `addPrayerRequestAction`, `markPrayedAction`, `addElderNoteAction`, `generateWisdomPromptAction` (stubbed with approved theological guardrail prompt template in code comments), `createCouncilNoteAction`, `updateCouncilNoteAction`.
- Added Ministry Forge Phase 3 — AI Volunteer Matcher and Burnout Guardian: `volunteer_match_suggestions` and `burnout_alerts` tables with strict RLS; `profiles.current_ministry_load` denormalised counter kept in sync by a PostgreSQL trigger on `profile_ministries`.
- Added `suggestVolunteersAction`: rule-based volunteer scorer (0–100 match score) using spiritual gift alignment, ministry type mapping, and serving-load penalty. Architecture prepared for LLM replacement with an approved guardrail prompt template in code comments.
- Added `reviewVolunteerMatchAction`: human-gated approve/reject flow — approval writes to `profile_ministries` and records reviewer identity and timestamp; rejection only marks the suggestion, never touches memberships.
- Added `calculateBurnoutAlertsAction`: re-evaluates member load for a ministry, persists `burnout_alerts` rows (deduplicated within a 7-day window), threshold: >3 ministries = medium, >5 = high.
- Added `acknowledgeBurnoutAlertAction`: marks a burnout alert as acknowledged.
- Added `VolunteerMatcherPanel` component: interactive Burnout Guardian section (severity-sorted alerts with acknowledge) and Volunteer Matcher section (pending suggestions with score ring, gifts, approve/reject).
- Added `MatchSuggestionCard` and `BurnoutAlertCard` sub-components with per-card optimistic removal on review.
- Added `AiDisclaimer` component rendering the canonical AI-assistive disclaimer on every AI-generated surface.
- Added "Volunteer Matcher" tab to `MinistryForgeDashboard` — visible to church-admin and pastor roles only; panel is empty-state friendly ("No suggestions yet — pray and try matching").
- Added `AI_ASSISTIVE_DISCLAIMER`, `burnoutSeverity()`, `BURNOUT_THRESHOLD_MEDIUM`, `BURNOUT_THRESHOLD_HIGH` constants to `lib/ministry-forge-types.ts` for shared use across server and client code.
- Added `getVolunteerMatcherData` data loader in `lib/ministry-forge-data.ts` with both local-DB SQL and Supabase client paths.
- Added `computeMinistryBurnoutAlerts` pure function for in-memory burnout detection without DB writes.
- Added Ministry Forge Phase 1 and Phase 2 foundations: `ministry_type`, `vision_statement`, and `scriptural_anchor` columns on `ministries`; new `profile_ministries` join table with composable RLS; `ministry_health_history` for trend tracking; `kingdom_impacts` quick-log table for spiritual outcomes.
- Added Ministry Forge dashboard at `/app/church-admin/ministry/[id]` with Overview, Members & Volunteers, Impact Log, and Vision & Anchors tabs for church admins and pastors.
- Added `HealthScoreCard` component with color-coded health bands (green ≥ 7.5, yellow 5–7.4, red < 5), trend arrow, and recent history.
- Added `VisionBoard` component with editable vision statement and scriptural anchor chips.
- Added `KingdomImpactLogModal` floating action button for logging prayer answers, disciples made, salvations, and restored relationships — visible to management roles only.
- Added `BurnoutGuardianBanner` component warning leaders when any volunteer serves in more than 3 ministries, with AI-assistive disclaimer.
- Added `MinistryCard` component with health score ring, ministry type badge, and member count.
- Added member-facing ministries route at `/app/member/ministries` listing the calling member's ministry assignments and all church ministries.
- Added seven new server actions in `app/app/actions.ts`: `createMinistryAction`, `updateMinistryAction`, `deleteMinistryAction`, `assignMembersToMinistryAction`, `removeMemberFromMinistryAction`, `updateMinistryHealthScoreAction`, `logKingdomImpactAction`, `updateMinistryVisionAction`.
- Added `lib/ministry-forge-data.ts` with `getMinistryForgeList`, `getMinistryForgeDetail`, and `getMemberMinistriesData` data loaders with both Supabase and local-DB fallback paths.
- Added rule-based Health Score formula as Phase 2 foundation (attendance × 0.4 + engagement × 0.3 + retention × 0.2 + impact × 0.1); Phase 3 will make it AI-assisted.
- Added `advanced_ministry_elder_pastor.md` to document the advanced ministries, elders, and pastor-council feature direction and its AI guardrails.
- Added `churchgoer_data.md` to document the churchgoer data model, directory rules, and self-service portal direction.
- Added `docs/churchgoer-pastor-execution-plan.md` to define the current implementation sequence for churchgoer and pastor data work.
- Added `docs/UI-UPDATES.md` to document the approved blue-neutral UI direction, component rules, and the current dark-mode deferral.
- Added dedicated member routes for `/app/member/directory` and `/app/member/family`, plus a pastor people route at `/app/pastor/people`.
- Added `/app/church-admin/people` and `docs/church-admin-people.md` for tenant-backed ChurchAdmin people management.
- Added bulk ChurchAdmin people actions for selected records, covering membership status and privacy visibility updates.
- Added ChurchAdmin household reassignment and duplicate-profile merge foundations, including the merge SQL function and relationships UI.
- Added `docs/pastoral-care-foundation.md` to document the new pastoral notes and care assignment scope.
- Added ADR 0002 in [docs/adr/0002-control-plane-and-tenant-separation.md](/Users/rjulia/ChurchForge/docs/adr/0002-control-plane-and-tenant-separation.md) to make control-plane and tenant separation the approved architecture.
- Added a control-plane tenant-registry migration for `tenants` and `tenant_connections`, including bootstrap data copied from existing church records.
- Added runtime-routing metadata backfill for `tenant_connections.metadata.runtime_church_id` and `runtime_slug`.
- Added server actions for tenant calendar event create, update, and delete flows, including local direct-Postgres fallback support.
- Added tenant calendar RSVP mutation actions backed by `event_rsvps` records.
- Added custom Mantine-based month, week, and day calendar rendering in the tenant calendar surface with smooth navigation and category filtering.
- Added animated hero icon component (`ChurchForgeHeroIcon`) to the landing page with pulsing rings and community-focused visual design.
- Added `/portal` as the dedicated churchgoer portal entry route and added a pastor-specific workspace backed by tenant people data.
- Added `consent_logs`, profile interests, profile spiritual gifts, and attendance online support in a new tenant people-foundation migration.
- Added a tenant migration for member-safe family self-service policies and aligned self-profile updates to `user_id` semantics.
- Added a tenant pastoral-care migration with `pastoral_notes`, `care_assignments`, and pastor-only RLS through `can_access_pastoral_data`.

### Changed

- Changed pastor portal home so each led-ministry card links directly to the Ministry Forge dashboard.
- Retired `churchgoer_implement.md` so `churchgoer_data.md` is now the only churchgoer data source-of-truth document.
- Changed the member portal data layer to include family and directory context instead of only profile, ministries, and upcoming events.
- Changed the member home screen to a lighter overview and moved directory and household detail into dedicated routes.
- Changed the pastor data layer to expose a fuller people list for dedicated directory and follow-up screens.
- Changed the pastor people screen from a read-only directory into a real care workspace with confidential notes, active care assignments, and status updates.
- Changed the ChurchAdmin role from a preview-only operations surface into a mixed mode with a real tenant-backed people-management route and editable churchgoer records.
- Changed member, pastor, and ChurchAdmin people queries to retire merged profiles from normal directory and care views.
- Changed control-plane entry so unauthorized or wrong-account access now forces a visible sign-in flow instead of silently redirecting away from `/control`.
- Changed the protected-shell header to show a visible `Log out` action instead of requiring sign-out through the profile dropdown.
- Updated the Mantine theme and global UI tokens to a blue-neutral, higher-contrast system aligned to the new UI guidance.
- Restyled the shared application shell, session controls, landing page, and `/control` around the updated palette and a simpler visual hierarchy.
- Documented the current UI direction in the README so future visual changes have an explicit repo-level reference.
- Updated the development plan, README, `.env.example`, and TODOs so the repo no longer treats one shared control-plane-plus-tenant database as the target architecture.
- Split the backend access layer in code into control-plane and tenant wrappers, and moved the session, audit, control-plane, and tenant data loaders onto those scoped paths while retaining transitional shared-env fallback.
- Changed control-plane tenant launch to resolve from registry `tenantId` records and `tenant_connections` instead of posting church runtime IDs directly from the UI.
- Changed control-plane routing, session tenant-view hydration, and dashboard resolution to use `tenant_connections.metadata.runtime_church_id` instead of relying on `tenants.external_tenant_id` during launch.
- Extended the live tenant calendar board to include quick-add event creation, in-drawer event editing and deletion, and user RSVP controls.
- Extended tenant calendar data hydration to include each viewer's current RSVP status per event.
- Changed the tenant calendar to open day details directly from calendar cells and week slots, improved agenda snapshot usefulness, widened the calendar data window, and refreshed the event mutation flow so create, update, delete, and RSVP actions give immediate feedback.
- Upgraded the tenant calendar board from a list-only surface to an interactive month/week/day calendar with category filtering including an "all" option.
- Replaced FullCalendar dependency with custom Mantine-based calendar implementation for improved control and styling consistency.
- Updated landing page hero section: improved tagline to "Clarity for the mission you lead" and renamed action buttons to "ChurchForge App" and "ChurchForge Tenant Control" for better clarity.

## [1.0.0] - 2026-04-11

### Added

- Added a `/controll` compatibility redirect to `/control`.
- Added `SUPABASE.md` to document the current local Supabase development URLs, keys, storage settings, and app env mapping.
- Added Supabase SSR foundations including browser and server helpers, a root `proxy.ts`, and an auth confirmation route.
- Added `.env.example` plus an initial Supabase SQL migration for profiles, churches, memberships, ministries, events, RSVPs, and volunteer shifts with RLS foundations.
- Added preview sign-in scaffolding with cookie-backed protected-route flow for the workspace and calendar modules.
- Added a role-based workspace preview under `app/workspace/` with distinct portal views for SuperAdmin, ChurchAdmin, Pastor / Elder, MinistryAdmin / Leader, and Volunteer / Member workflows.
- Added a protected working calendar module under `/calendar` for all-events breakdowns, volunteer load watch, approvals, and resource conflict visibility.
- Added a deeper ChurchAdmin portal board with care queue, weekend readiness, communications, and giving snapshot sections.
- Added `docs/auth-foundation.md` and `docs/working-calendar.md` to document the new protected shell and calendar module.
- Added `docs/church-admin-workspace.md` to document the first role-specific deep workspace.
- Added `docs/portal-foundation.md` to document the scope and intentional backend constraints of the new application slice.
- Added `docs/control-plane.md` to document the new platform-side control plane boundary and routes.
- Added `docs/todo.md` to track the remaining Supabase project hookup tasks after ADR 0001 approval.
- Added Mantine as the primary application-facing UI system for the landing page, sign-in flow, app shell, workspace, and calendar surfaces.
- Added membership-aware app-context resolution plus explicit tenant-view actions so control-plane users can intentionally enter and exit a church-app context.
- Added a second Supabase migration for `tenant_view_audit_logs` so platform-side tenant view entry and exit can be audited.
- Added a live church-calendar data loader backed by Supabase `events` records, category counts, and approval-queue derivation.

### Changed

- Updated the source-of-truth plan and README so Mantine is the standard UI framework for ChurchForge going forward.
- Merged `DEVELOPMENT_PLAN.md` v1.4 with the new sprint roadmap, Sprint 1 schema priorities, categorized calendar direction, and updated source-of-truth structure.
- Updated the README to reference the v1.4 development plan and its Sprint 1 priorities.
- Started Sprint 1 execution by aligning the local Supabase schema toward member-portal profiles, ministry assignments, and categorized events, and by hydrating church-app sessions from live `profiles` rows when available.
- Added the first real member portal slice under `/app/member`, backed by live `profiles`, `profile_ministries`, and categorized `events` data.
- Accepted ADR 0001 in favor of Supabase and updated the repo copy to reflect an approved backend path instead of an undecided one.
- Updated the sign-in flow to use Supabase SSR auth when configured, with the original preview identities retained only as a local fallback.
- Aligned package metadata naming on `ChurchForge` by updating the npm lockfile package name from the old bootstrap identifier to `churchforge`.
- Updated the landing page to route into sign-in, workspace, and calendar entry points so the repo now includes a protected application surface alongside the marketing shell.
- Redesigned the protected application UI with a premium dashboard shell, stronger sidebar navigation, denser metric cards, and more intentional ChurchAdmin and calendar operating surfaces.
- Redesigned the landing page and sign-in route to match the stronger product direction, and added stateful dashboard interactions for role switching, queue views, and calendar filtering.
- Added segmented operation lanes, detail drawers, and local mutation flows to the ChurchAdmin workspace and calendar board so those surfaces behave more like real application modules.
- Added cookie-backed preview persistence with server actions for ChurchAdmin and calendar mutations so state now survives refresh and navigation before Supabase records are connected.
- Rebuilt the primary product surfaces on Mantine with a lighter, more restrained interaction model and reduced visual clutter across the landing, sign-in, workspace, and calendar experiences.
- Split the product into a real platform control plane under `/control` and a tenant-facing church app under `/app`, with legacy `/workspace` and `/calendar` routes retained only as compatibility redirects.
- Changed church-app navigation and route guards to resolve from the active app context instead of letting roles and product surfaces blur together.
- Changed the control plane to read live church, membership, and tenant-view audit data from Supabase when configured, while preserving preview fallback locally.
- Simplified the main control-plane and church-app shells into a lighter, light-only Mantine experience with reduced copy, flatter surfaces, and less visual chrome.
- Simplified the role workspaces and ChurchAdmin surface further by removing the promo-style metrics, heavier explainer copy, and extra dashboard chrome.
- Simplified the sign-in flow into a single focused card and removed the extra explainer panels and preview-heavy copy.
- Rebuilt the landing page as a minimal entry screen and removed the heavy preview grids, role boxes, metrics, and marketing sections.
- Added a local direct-Postgres fallback for app-owned Supabase table reads and writes when the local PostgREST schema cache is unavailable.
- Replaced the preview calendar board with a live categorized event board backed by Supabase reads.
- Removed the unused `next-themes` dependency and kept the app on a light-only Mantine configuration.
- Replaced the placeholder development plan with a fully expanded v1.3 source-of-truth document covering project vision, RBAC portals, core features, AI ministry tools, calendar and volunteer workflows, security, SDLC discipline, and maintenance expectations.
- Updated the README and in-app development-plan references to align with the revised plan language and scope.
- Updated the pull request template and added feature and bug issue templates that require plan-section references, documentation impact notes, and security or AI review context.

### Fixed

- Fixed a Mantine theme-toggle hydration mismatch by deferring client color-scheme resolution until after the initial render, so SSR and client hydration stay aligned.

## [0.1.0] - 2026-04-09

### Added

- Bootstrapped the ChurchForge frontend with Next.js App Router, TypeScript, and Tailwind CSS.
- Established a disciplined repo structure with `app`, `components`, `lib`, and `docs`.
- Added a polished landing page aligned with the ministry platform vision.
- Added shared UI primitives, theme support, and CI verification.
- Added project documentation baseline including the development plan and initial ADR scaffolding.
