# Application Surface

This page holds the route map and the per-feature implementation notes that used to live in the root README (moved 2026-10-06 when the README was restructured; see [CHANGELOG](../CHANGELOG.md)). The notes accumulated release by release, so read them as a log: where a line conflicts with an ADR, [`DEVELOPMENT_PLAN.md` §0](../DEVELOPMENT_PLAN.md#0-mvp-roadmap-to-november-6-2026-tracker) or the [CHANGELOG](../CHANGELOG.md), those are authoritative. Lines known to be superseded are marked.

Related: [application guide](application-guide.md) (walkthrough) · [security role-access matrix](security-role-access-matrix.md) (who can reach what, with test evidence) · [architecture](architecture.md).

---

## Current Product Surface

- **Control plane:** `/control` for platform staff.
- **ChurchAdmin workspace:** people, households, accounts, ministries, events, readiness, giving ops, finance, communications, workflows, reports, and settings.
- **Church Operations:** `/app/church-admin/operations` for church documents (vision/mission, faith stance, policy, elder council notes encrypted at rest) and new-member onboarding workflow with task templates and progress tracking.
- **Communications:** `/app/communications` for compose/send email and SMS to segmented audiences, schedule delivery, manage templates, view delivery history and analytics, and retry failures.
- **Weekly readiness path:** shared readiness summaries now carry status, severity, issue count, recommended action, route target, query target, and completion state metadata for the operator path. Setup, account requests, people, events, children's ministry, volunteers, giving/finance, communications, reports, and suggested workflows now use module-owned readiness builders. The standardized target-state pattern is live for settings, account approvals, people readiness filters, event roster review, volunteer service plans, giving/finance exceptions, and suggested workflows.
- **Daily Desk:** `/app/daily-desk` for calls, notes, visits, calendar items, checkups, and operational signals.
- **Secretary portal:** `/app/secretary` for office work without full church-admin authority.
- **Member portal:** profile, family, directory, giving, schedule, groups, privacy/data rights, and preferences.
- **Member mobile shell:** phone-first bottom navigation now prioritizes home, calendar, groups, schedule, and family; member home includes quick-action cards for top tasks, and member calendar keeps bottom-nav continuity.
- **Public portal:** host-aware church resolution plus member account onboarding through `/portal/register`.
- **ShepherdAI workflow queue:** `/app/church-admin/workflows` for suggested ministry workflows generated from deterministic signals.
- **AI Ministry Tools:** `/app/pastor/bible-study` for AI-assisted Bible Study Q&A; Council Forge extended with AI Suggest for sermon outline and series plan generation. All AI interactions are server-side, consent-gated, and logged to `ai_interactions`.
- **AI gateway (ADR 0027):** every LLM call goes through one server-only gateway (`lib/ai/gateway.ts`) to OpenRouter, with per-feature ranked model fallbacks (`lib/ai/models.ts`), zero-data-retention routing that fails closed, PII scrubbing on every message, and token/cost logging. Set `OPENROUTER_API_KEY`; direct Anthropic (`ANTHROPIC_API_KEY`) is the backup when it is unset. Per-feature overrides (`AI_MODELS_<FEATURE>`, `AI_ANTHROPIC_MODEL_<FEATURE>`) are in `.env.example`.
- **Localization Governance:** `/app/church-admin/localization` for governed translation lifecycle (draft → validated → reviewed → approved → active → stale); CLI via `locgov` binary; runtime fallback to hardcoded i18n catalog.

---

## Primary Routes

- `/` marketing and product-direction overview
- `/sign-in` preview sign-in and protected-route entry
- `/control` platform control plane for ChurchCore staff
- `/controll` compatibility redirect to `/control`
- `/app` tenant-facing church application entry
- `/app/[role]` church role workspace
- `/app/church-admin` church-admin home — live tenant summary cards for people, ministries, events, and giving plus operations lanes for live care, weekend, communications, and giving work
- `/app/calendar` tenant-facing working calendar hub backed by Supabase event reads when configured
- `/portal` public member-portal landing page with sign-in and request-access entry points
- `/portal/register` public member portal request form
- `/portal/events/register` public event registration: a church's public events open for registration, for signed-out visitors
- `/app/church-admin/settings` church-admin setup profile — tenant church name, legal name, timezone, website, contact, mailing address, and public summary
- `/app/church-admin/people` church-admin people-management — search, filter, household/account/request visibility, edit, role management, bulk update, add person (offline record), invite user (Supabase auth email), deactivate
- `/app/church-admin/accounts` church-admin account-request approval queue
- `/app/church-admin/events/[id]` event-specific attendance and roster workspace with quick check-in, burnout warnings, and visitor add flow
- `/app/church-admin/ministry` Ministry Forge index — grid of all ministries with health-band indicators, type badges, and member counts
- `/app/church-admin/ministry/[id]` Ministry Forge detail dashboard — health score, vision board, volunteer matcher, and type-specific track panel for all ten ministry kinds (worship, men's, women's, marriage, missions, children's, youth, young adults, education/discipleship, outreach)
- `/app/church-admin/finance` Financial Management hub — redirects to dashboard
- `/app/church-admin/finance/dashboard` Finance dashboard — income/expense summary cards, budget utilization, recent journals
- `/app/church-admin/finance/accounts` Chart of accounts — hierarchical account list grouped by type; add/edit accounts
- `/app/church-admin/finance/accounts/[id]` Account ledger — all journal lines for the selected account
- `/app/church-admin/finance/journals` Journal list — status badges (draft / posted / voided), journal type indicators
- `/app/church-admin/finance/journals/new` New journal entry — debit/credit line editor with live balance checker
- `/app/church-admin/finance/journals/[id]` Journal detail — edit draft lines, post, void, or view read-only
- `/app/church-admin/finance/budgets` Budget list — all budget versions by fiscal year
- `/app/church-admin/finance/budgets/[id]` Budget detail — per-account budgeted vs. actual vs. variance
- `/app/church-admin/finance/import` Import wizard — CSV, Excel, QuickBooks IIF, OFX/QFX, plain text
- `/app/church-admin/finance/reports` Financial reports — Income Statement, Balance Sheet, Budget Variance tabs
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
- `/app/communications` communications for pastor, church-admin and secretary — redirects to `history` (message log, cancel, retry); `compose` sends email/SMS to a segment (role, ministry, membership status, recent attendance) with per-recipient consent and suppression checks; `templates` manages reusable messages; `suppressions` lists who is suppressed and why (S11: church admin, pastor and secretary view; church admin adds, and lifts bounce and manual entries with an audited reason; unsubscribe and spam-complaint entries are locked)
- `/app/member/giving` member donor portal — giving history, active recurring, Give drawer (voluntary, anonymous option)
- `/app/member/data-rights` member data rights — GDPR/CCPA export and deletion request
- `/app/giving` giving reporting dashboard for pastors and church-admins (fund breakdown, totals, recurring count)
- `/control/launch-checklist` interactive pre-launch checklist for platform operators (47 items across 8 sections)
- `/workspace` compatibility redirect to the new split entry
- `/calendar` compatibility redirect to the new split entry
- `/plan` development-plan summary
- `/adr/backend-platform` backend ADR summary

---

## Plan Highlights

- Role-based portals with least-privilege enforcement for platform, church, ministry, and member workflows.
- Explicit separation between the ChurchCore control plane and tenant-facing church app.
- Sensitive-data posture for PII, PHI-adjacent pastoral data, donations, child safety, care records, and audit logs.
- Categorized calendar, RSVP, volunteer scheduling, burnout guardrails, and ministry stewardship metrics.
- Giving, double-entry finance, reporting, communications, and ministry pathway intelligence.
- Assistive AI only, with consent, auditability, theological guardrails, and human approval where ministry content is generated.

---

## Design System

ChurchCore follows the ChurchCore Design System: dark-first slate surfaces, an indigo primary, Inter type, and `rounded-2xl`/`rounded-xl` radii — adopted ecosystem-wide for visual parity with sister apps ChurchCore LMS and Orthos, through the Mantine theme rather than a stack rewrite ([ADR 0026](adr/0026-churchcore-design-system-parity.md)).

- **Theme:** `components/theme-provider.tsx` maps the spec's slate/indigo roles onto Mantine's `dark` palette and forces the dark scheme. `app/globals.css` carries the matching CSS variables.
- **Rule for new screens:** colours come from the theme (`c="dimmed"`, `color="indigo"`, etc.) or a CSS variable in `app/globals.css` — never a new hard-coded colour literal.
- **Enforced in CI:** `components/theme-provider.test.ts` is a ratchet — the count of colour literals in `app/` and `components/` may only go down from its recorded baseline, and the pre-ADR-0026 light theme's palette is banned outright, so a copied light-theme snippet fails the build instead of rendering unreadable.

---

## Demo Feedback

- Demo-mode users can report bugs, errors, unexpected results, and improvement
  ideas from the global feedback button.
- Unhandled React errors are captured without blocking the current UI.
- The server derives authenticated identity, validates bounded context, computes
  normalized fingerprints, and writes through the control-plane service role.
- Control-plane Postgres atomically deduplicates reports, tracks hit counts,
  reopens repeated issues, and enforces 20 submissions per session per minute.
- Platform staff review and resolve reports at `/control/demo-feedback`.
- Replication guide: [docs/prompts/replicate-demo-feedback-system.md](prompts/replicate-demo-feedback-system.md).

---

## Current Application Surface (implementation notes)

- Service planning now includes a song library and setlist builder, role taxonomy and a team roster, and a rotation planner — Stories 1–3 of a 5-story split closing the top-ranked "no setlist builder, song library, or volunteer-role matching" competitive gap (Story 3 merged via PR #152). Church-admin, pastor, and ministry-leader roles can search or create songs into a church-wide catalog, add them to a service plan, drag-and-drop reorder the setlist alongside the existing move-up/down controls, and see a non-blocking warning when a song was used within the church's configurable repeat window (default 12 weeks). They can also define church-specific role types (with required skills) at `/app/church-admin/volunteers/role-types`, see a consolidated roster view of every position on a service plan with unassigned slots flagged, and get skill-matched volunteer suggestions when filling a role. The rotation planner adds ranked, fatigue- and history-aware volunteer suggestions per position, a reviewable whole-plan auto-fill, and a per-volunteer monthly service limit. Volunteers can now also mark days they can't serve (blockout dates) — signed in on `/app/member/schedule`, from their emailed confirm link without a login, or entered by an admin in the volunteer directory — and the roster flags anyone assigned on a day they've since blocked (PR #156). A service plan now always has its own staff-only event, so it can always be staffed: a new plan gets one at creation, and an older plan gets one the first time someone is assigned to it (G1.11, Council Review 25). Rehearsal scheduling and the remaining event-required schema work (backfilling old plans and adding the `NOT NULL` constraint) remain future stories in the same split.
- The landing page (`/`) is now a full marketing overview again ("Sacred Clarity" layout; its palette moved to the design system's dark theme under ADR 0026: hero with live-product preview cards, a platform capability grid, a product-family ecosystem section, and a closing CTA), reversing the 1.0.0-era decision to keep it a minimal entry surface now that the product has enough shipped to show. All copy is localized (`en`/`es`/`es-PR`) via the existing `publicHome` namespace in `lib/i18n.ts`.
- The sign-in route is intentionally minimal and now chooses the control-plane or tenant Supabase auth surface from the requested redirect target, with preview auth retained only as a local fallback.
- The control-plane routes provide a protected platform-operator surface for tenant lifecycle, billing, support, and provisioning.
- The church-app routes provide protected role-based portals for ChurchAdmin, Secretary / Office Admin, Pastor / Elder, MinistryAdmin / Leader, and Volunteer / Member flows.
- Auth sessions now resolve an explicit app context from control-plane access plus church membership data, so actor identity and active product surface are no longer conflated.
- The backend access layer is now split in code between control-plane and tenant wrappers under `lib/supabase/control-plane.ts` and `lib/supabase/tenant.ts`, with the old single-project local Supabase setup retained only as transitional fallback.
- Shared Supabase helper boundaries are now explicit as well: browser/SSR helpers require a named surface, and local direct-DB fallback pooling lives only behind the control-plane or tenant wrappers instead of a generic shared pool.
- `proxy.ts`, `/sign-in`, and session hydration now refresh and resolve auth against explicit surface-aware Supabase clients instead of a generic shared selector, which keeps `/control` and `/app` aligned to ADR 0002 even while shared local env vars remain supported.
- Tenant launch from `/control` is now registry-driven, with the control plane resolving the tenant runtime target through `tenants` and `tenant_connections` before entering `/app`.
- Control-plane routing now resolves the tenant runtime church target from `tenant_connections.metadata.runtime_church_id`, which keeps platform tenant IDs separate from tenant-runtime church IDs.
- Platform admins can now launch an explicit tenant view from the control plane and return to ChurchCore Control without implicit cross-over.
- When Supabase is configured, the control plane now reads live church and membership counts plus recent tenant-view audit events from database records instead of relying only on mock tenant lists.
- Local development can now fall back to direct Postgres reads and writes for app-owned Supabase tables when the local REST schema cache is unavailable.
- The church app session now hydrates from real `profiles` rows when available, so `/app` and the app shell resolve live church-scoped user data instead of relying only on preview profile templates.
- The member portal under `/app/member` now reads real profile, ministry-assignment, and upcoming-event data from Supabase instead of using only the generic preview workspace.
- Tenant membership reads now resolve from the active church-scoped `profiles.id`, which keeps member and ministry data aligned across merged-profile cleanup, local SQL fallback, and live Supabase relation reads.
- The church-admin side now includes a real `/app/church-admin/people` screen for church-scoped record management and status updates.
- ChurchAdmin people management now includes bulk updates for membership status, directory visibility, and contact permission across selected records.
- ChurchAdmin people management now includes household reassignment and duplicate-profile merge tooling, with merged profiles retired from downstream member and pastor views.
- The church-admin side now includes `/app/church-admin/accounts` for reviewing public portal requests, approving them with generated member numbers, and sending member invites when the tenant service-role key is configured.
- The church-admin and pastor flows now include `/app/church-admin/events/[id]`, an event-specific attendance and roster workspace with quick check-in, visitor capture, roster confirmation, and seven-day burnout warnings.
- The church-admin events list now shows live roster counts in both direct SQL fallback mode and the normal Supabase tenant path.
- Tenant write actions for calendar events, event rosters/check-ins, registration settings, and ministry membership now explicitly validate church ownership on incoming record IDs before writing, instead of relying on implicit downstream constraints alone.
- Church leadership roles now also have `/app/reports`, `/app/reports/members`, `/app/reports/events`, and `/app/reports/giving`, a first reporting-suite foundation with graphical stewardship dashboards and preview-safe fallback behavior.
- The churchgoer portal now has a public `/portal` landing page plus `/portal/register`, where prospective members can request portal access and be linked to an existing profile by email when possible. Account requests go only through the `submit_account_request` database function (Council Review 33 dropped the direct anon insert).
- Public event registration (`/portal/events/register`) runs on the server (S10): the page reads a church's own public events open for registration, and `submitPublicEventRegistrationAction` checks the event's church, visibility, deadline, capacity, waitlist and required custom fields (a required checkbox needs a real tick) before writing with the church-scoped admin client. Signed-out visitors can't write to `event_registrations` directly (the anon insert policy is gone), the database refuses a registration row whose church differs from its event's, and each address is limited to 10 submissions a minute. Event times are shown in the church's time zone. Members see only their own registrations' payments.
- The member experience is now split further into dedicated directory and household routes, and the main member home now includes attendance history, upcoming serving assignments, and interest / contact-preference self-service.
- The pastor role now resolves to a pastor-specific workspace backed by tenant profile, ministry, and follow-up data instead of the generic role shell.
- The pastor experience now includes a dedicated people view with search, status filtering, household context, contact visibility, and last-attendance signals.
- The pastor people route now includes a first pastoral-care workflow with pastor-only notes, church-scoped care assignments, and assignment status updates.
- *(Superseded by ADR 0026: the app is now dark-first.)* The protected shell now uses a light-only Mantine direction with less chrome, less copy, and a simpler hierarchy across control-plane and church-app surfaces.
- The protected shell now exposes an explicit visible logout action in the header instead of hiding sign-out only inside the profile menu.
- *(Superseded by [ADR 0026](adr/0026-churchcore-design-system-parity.md).)* The current UI direction is now formally documented in `docs/UI-UPDATES.md`, with a blue-neutral palette, higher-contrast hierarchy, and dark mode intentionally deferred until token work is complete.
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
- Communications at `/app/communications` (pastor, church-admin, secretary) has four pages: `history`, `compose` (by segment, with per-recipient consent and suppression checks via `notification_preferences` and `communication_suppressions`), `templates`, and `suppressions` (S11), with a full `communication_logs` audit trail. Hand-picked recipients aren't in the UI yet (tracker row S15); the server action for them, `broadcastMessageAction`, reads each recipient's contact on the server from their id (S6). The suppressions page (S11) merged as #190: only church admins add or remove, only bounce and manual entries can be lifted, and unsubscribe and spam-complaint entries are locked.
- The member portal bottom nav now includes a Ministries tab alongside Home, Calendar, Directory, and Family, with all five routes pre-cached by the service worker for offline access.
- The voluntary donations system at `/app/member/giving` lets members give one-time or recurring gifts with fund designation and anonymous option. ChurchCore takes no platform fee — 100% goes to the church. Receipt emails sent via SendGrid. *(Since G5.1, #188, receipts go out through Resend, with SendGrid as the fallback.)*
- Members can download a full JSON export of their personal data or request account deletion with a 30-day grace period from `/app/member/data-rights` (GDPR/CCPA aligned).
- Pastors and church-admins have a giving reporting dashboard at `/app/giving` with fund breakdown, monthly and all-time totals, and recurring-gift counts. Anonymous donations are never de-anonymised in the UI.
- Platform operators have a `/control/launch-checklist` with 47 interactive verification items across RLS, donations, AI guardrails, communications, data rights, security, mobile/PWA, and role access.
- Church admins now have a full double-entry accounting system at `/app/church-admin/finance` for internal bookkeeping, 501(c)(3) reporting, and annual audits. The finance module is isolated from Stripe donations and is accessible to the church-admin role only. It includes a chart of accounts, journal entries (draft → posted → voided), annual budgets with per-account lines, actuals vs. budget reporting, a multi-step import wizard supporting CSV/Excel/QuickBooks IIF/OFX/QFX, and three financial report views.
- Ministry Forge now covers all ten ministry track kinds with dedicated management panels. In addition to the original five (worship, men's, women's, marriage, missions), v2.10.0 adds: Children's (safety index with real-time ratio alerts, background check expiry tracking, check-in log), Youth (graduation readiness tracker with milestone-completion progress), Young Adults (career-kingdom mentorship map), Education (doctrinal blueprint showing per-member theological coverage), and Outreach (neighborhood density heatmap and event log). Stewardship metrics include Discipleship Velocity (avg days to first leader role) and Burnout Guardian (members active across > 3 track kinds).
- Children's sensitive data (pickup codes, medical alerts, authorized guardians) is stored in an isolated table with `can_manage_church`-only RLS and a write-audit trigger. Marriage pulse entries are schema-level anonymous — no profile ID column exists. All new track panels carry the canonical AI assistive disclaimer.
