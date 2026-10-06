# ChurchCore HOWTO

This guide is the practical developer and operator path for running, verifying, and safely contributing to ChurchCore. For what the product is, start with the [README](README.md); for the plan and open work, [`DEVELOPMENT_PLAN.md` §0](DEVELOPMENT_PLAN.md#0-mvp-roadmap-to-november-6-2026-tracker).

**Contents:** [1. Run locally](#1-run-the-app-locally) · [2. Local Supabase](#2-local-supabase-full-backend) · [3. Environment variables](#3-environment-variables--configuration) · [4. Testing](#4-testing--verification) · [5. Scripts](#5-scripts-reference) · [6. Troubleshooting](#6-troubleshooting) · [7. Project structure](#7-project-structure) · [8. Routes and surfaces](#8-routes-and-application-surface) · [9. Crons and ShepherdAI](#9-crons-and-shepherdai-operations) · [10. Software factory](#10-ai-assisted-software-factory) · [11. Documentation and GitHub discipline](#11-documentation-and-github-discipline) · [12. PR flow](#12-pr--contribution-flow)

---

## 1. Run The App Locally

### Prerequisites

- Node.js `22.13.0` or newer (`.nvmrc`) and npm
- Docker, for local Supabase (not needed for preview mode)
- For the full e2e suite: `psql` (on macOS: `brew install libpq`), `python3`, `openssl` and `curl` — see [docs/testing.md](docs/testing.md#running-everything-locally)

### Preview mode (no backend)

```bash
npm ci
npm run dev
```

Open:

```text
http://localhost:4200
```

Without backend environment variables, the app runs in **preview mode** with in-memory demo data.

For automated verification beyond lint and build:

```bash
npm run test
npm run test:coverage
```

### Quick local evaluator path

```bash
npm run setup:local
npm run dev
```

In another terminal:

```bash
npm run smoke:preview
npm run smoke:local
npm run test:e2e:install
npm run test:e2e:readiness
```

The Playwright readiness check starts the Next.js dev server automatically, but it still expects the local Supabase demo setup and generated `.demo-credentials.local` from `npm run setup:local`.
That local setup generates tenant demo users for ChurchAdmin, Secretary / Office Admin, Pastor / Elder, Ministry Leader, and Member role-access checks.

Evaluation notes:

- Local credential material is not committed; demo credentials are generated locally by the bootstrap script and saved to gitignored `.demo-credentials.local`.
- Evaluator helpers: `npm run setup:local`, `npm run smoke:preview`, `npm run smoke:local`, `npm run test:e2e:readiness`, and `npm run test:e2e:member-mobile`.
- Spanish UI support uses cookie-backed English/Spanish selection; track rollout in [docs/plans/spanish-ui-coverage.md](docs/plans/spanish-ui-coverage.md).

---

## 2. Local Supabase (Full Backend)

For a fully operational local environment with real data:

```bash
npm run setup:local
```

`supabase/scripts/setup-local.sh` starts local Supabase, checks that `SUPABASE_SERVICE_ROLE_KEY` is set in `.env` / `.env.local` (and stops with instructions if not), resets the database, and runs `create-dev-users.sh`.

Equivalent manual flow:

```bash
# 1. Start Docker, then:
npx supabase start

# 2. Apply all migrations and seed demo data:
npx supabase db reset && ./supabase/scripts/create-dev-users.sh
```

If you pull a new schema migration, rerun the reset command before opening the new routes locally.

Your `.env.local` needs these four variables (use JWT-format keys from `npx supabase status --output env`):

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4201
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...   # ANON_KEY from supabase status --output env
SUPABASE_SERVICE_ROLE_KEY=eyJ...              # SERVICE_ROLE_KEY from supabase status --output env
SUPABASE_DB_URL=postgresql://postgres:<local-db-password>@127.0.0.1:4202/postgres
```

> **Important:** Use the `eyJ…` JWT key, not the `sb_publishable_*` key shown in the default `supabase status` output. The JWT key comes from `npx supabase status --output env`.
> **Optional:** Set `CHURCHCORE_OPS_DEV_PASSWORD` before running `./supabase/scripts/create-dev-users.sh` if you want deterministic demo credentials. Otherwise the script generates a password and writes it to `.demo-credentials.local`.
> The generated credentials file also includes `CHURCHCORE_OPS_DEMO_ADMIN_EMAIL` and `CHURCHCORE_OPS_DEMO_MEMBER_EMAIL` (plus the secretary, pastor, ministry-leader and church-admin addresses) for smoke-test automation.

### Local ports

| Service | URL |
| :--- | :--- |
| App | `http://localhost:4200` |
| Tenant API | `http://127.0.0.1:4201` |
| Tenant DB | `127.0.0.1:4202` |
| Studio | `http://127.0.0.1:4204` |
| Mailpit | `http://127.0.0.1:4205` |
| Control-plane API / DB (e2e stack) | `4211` / `4212` |

### Dev accounts after seeding

Created by `supabase/scripts/create-dev-users.sh`:

| Email | Role |
| :--- | :--- |
| `sarah@churchcoreops.app` | Church Admin + Platform Admin |
| `nora@graceharbor.church` | Church Admin only (not a platform admin) |
| `olivia@graceharbor.church` | Secretary / Office Admin |
| `miriam@graceharbor.church` | Pastor / Elder |
| `robert@graceharbor.church` | Ministry Leader |
| `david@graceharbor.church` | Member |

The control plane uses a separate local project (`supabase/control-plane`); `npm run setup:e2e` starts both stacks and registers the demo admin as platform staff.

See [docs/setup/local-supabase.md](docs/setup/local-supabase.md) for the complete local setup guide, seeded data reference, and troubleshooting.
For repository creation and GitHub-side hardening after the first push, use [docs/setup/private-repo-launch-checklist.md](docs/setup/private-repo-launch-checklist.md).
For the application-specific route, action, and domain coverage map, see [docs/testing-schema.md](docs/testing-schema.md).

---

## 3. Environment Variables & Configuration

The authoritative list is [`.env.example`](.env.example). The groups that matter most:

| Group | Variables | Notes |
| :--- | :--- | :--- |
| Tenant Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` (or the `TENANT_SUPABASE_*` / `TENANT_DB_URL` names) | Church runtime data |
| Control-plane Supabase | `CONTROL_PLANE_SUPABASE_URL`, `CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY`, `CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY`, `CONTROL_PLANE_DB_URL` | Platform data, `/control` |
| App | `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `NEXT_PUBLIC_DEMO_MODE` | Leave `NEXT_PUBLIC_DEMO_MODE` unset for a real church |
| Pastoral encryption | `PASTORAL_ENCRYPTION_KEY` | AES-256-GCM key for encrypted pastoral fields (`lib/crypto/pastoral.ts`) |
| Email / SMS | `RESEND_*`, `SENDGRID_*`, `TWILIO_*`, `UNSUBSCRIBE_SECRET` | See below |
| Payments | `STRIPE_*`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | See below |
| AI | `OPENROUTER_API_KEY` (primary), `ANTHROPIC_API_KEY` (backup), `AI_MODELS_<FEATURE>`, `AI_ANTHROPIC_MODEL_<FEATURE>` | Per-feature overrides in `.env.example` |
| Push, localization, observability | `VAPID_*`, `LOCGOV_*`, `GOOGLE_TRANSLATE_API_KEY`, `SENTRY_*` | Optional |

**AI gateway (ADR 0027):** every LLM call goes through one server-only gateway (`lib/ai/gateway.ts`) to OpenRouter, with per-feature ranked model fallbacks (`lib/ai/models.ts`), zero-data-retention routing that fails closed, PII scrubbing on every message, and token/cost logging. Set `OPENROUTER_API_KEY`; direct Anthropic (`ANTHROPIC_API_KEY`) is the backup when it is unset.

### Giving and payments

For voluntary donations, also supply:

- `STRIPE_SECRET_KEY` — Stripe **platform** secret key (`sk_live_…` or `sk_test_…`). It authenticates ChurchCore to Stripe for the Connect OAuth handshake and reading a connected account's status; it never receives a church's money.
- `STRIPE_WEBHOOK_SECRET` — webhook signing secret (`whsec_…`) for the platform's own webhook endpoint
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — for Stripe Elements on the frontend (loaded on the church's own connected account)
- `STRIPE_CONNECT_CLIENT_ID` — Connect OAuth client id (`ca_…`), from Stripe Dashboard → Connect → Settings → OAuth settings
- `STRIPE_CONNECT_WEBHOOK_SECRET` — signing secret for a **separate** webhook endpoint subscribed to events from connected accounts
- When absent, donation actions return stub results **outside production** (or with `NEXT_PUBLIC_DEMO_MODE=true`), so local dev is unaffected — a production deploy without these keys refuses to give, rather than recording gifts that were never actually charged (Council Review 22, S8). **Online card giving is live with `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` set, and the church connected** — the Give drawer's card step (Stripe Elements' Payment Element) collects the card and confirms the PaymentIntent in the browser, on the church's own Stripe account (G3.0, Council Review 34; G3.0b, Council Review 35, ADR 0025). **A paid event registration — from the public portal or a member — is paid by card the same way, on the church's own connected account** (G3.0c, Council Review 36): the registration form gives way to Stripe's card form right after registering, and leaving without paying cancels the PaymentIntent and the registration, freeing its place. An admin adding a walk-in doesn't take a card for them; the registration records the payment as due, to collect in person.
- **Each church connects its own Stripe account (Stripe Connect, Standard accounts, direct charges — G3.0b, ADR 0025) from `/app/church-admin/giving` ("Connect with Stripe").** Connect is required for live payments, with no platform fallback: until a church has connected and Stripe reports it can take charges, that church's online giving and paid event registration say payment isn't set up. Every Stripe call for that church's money carries `Stripe-Account`, so the church is merchant of record. ChurchCore takes **no platform fees** — 100% of every donation goes directly to the church (Stripe's own standard processing fees still apply). See `docs/adr/0025-stripe-connect-standard-direct-charges.md`. **Before live giving is announced, the platform needs its own Connect setup and one Stripe test-mode run with a real connected account (owner action O7, `DEVELOPMENT_PLAN.md` §0.3) — no automated test exercises real Stripe.**
- **Recurring giving (G3.1 + G3.2, Council Review 38, merged as PR #177):** a member sets up a recurring gift (amount, fund, weekly/biweekly/monthly, start date) as a Stripe subscription on the church's own connected account from `/app/member/giving`. Starting today charges the first installment immediately; a start date up to a year ahead saves the card now (a SetupIntent) and first charges at the church's own midnight on that day. Members change the amount, fund or frequency, pause, resume and cancel their own gift; church admins see a Recurring tab (never naming an anonymous giver) and can pause, resume or cancel, audited. Each installment (`invoice.paid`) is recorded as its own donation, keyed by its Stripe invoice so a provider retry can't double-record it, and is completed — ledger-posted and receipted — the same way a one-time gift is. A failed installment (`invoice.payment_failed`) notifies the donor once and marks the gift past due.
- **Year-end giving statements (G3.3, Council Review 40, pending merge):** on the Statements tab of `/app/church-admin/giving` an admin picks a date range (default: last calendar year), previews who will be emailed and why anyone is skipped, downloads a donor's PDF (`pdf-lib`), and sends an idempotent batch email whose body is the statement, with consent and suppression honored; a member downloads their own statement from `/app/member/giving`. Staff never see an anonymous giver (the admin PDF is named gifts only; anonymous gifts are one unattributed line), the donor's own statement includes their anonymous gifts, and statement send records carry no recipient. Migration `20261005000000` (a partial unique index) must be applied to the hosted database after merge (owner action O8).
- **Registration receipts (G3.3b, Council Review 42, merged as #184):** when a paid event registration's card payment succeeds, the Stripe webhook emails the registrant one ChurchCore receipt (church, event and its church-local time, amount, and a line saying the fee is not a tax-deductible donation). It is claimed before sending and marked sent only after the provider accepts, so a webhook retry never double-sends. Migration `20261007000000` (two nullable columns on `event_registration_payments`) must be applied to the hosted database after merge (owner action O11). **`sendEmail()` no longer reports a fake success in production:** with no `SENDGRID_API_KEY`/`SENDGRID_FROM_EMAIL` it returns `provider_not_configured` (stubs are still allowed locally and in demo); donation receipts, recurring failure notices and registration receipts then stay visibly unsent and the Stripe webhook still answers 200. Until an email provider is configured (G5.1), those receipts do not go out in production.
- **The public giving page, `/give/[slug]`, now takes real one-time gifts in production** (G3.1) — rate-limited, fund-validated, and cancellable while unpaid. Before this, in production it returned `notFound`, and in demo mode its "Thank you" confirmation didn't actually charge or record anything.
- **The Stripe webhook (`/api/webhooks/stripe`) is retry-safe (G3.2):** it answers 5xx on a handler failure, so Stripe retries, instead of always answering 200; every step (the ledger post, the receipt) is repeatable on retry, and the donation's `completed_at` marker is written last, after every other write succeeds. The platform's Connect webhook subscription needs three events for recurring giving beyond the one-time set: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated` (see `docs/setup/production-deployment.md` and owner action O7).
- `/api/webhooks/stripe` fails closed: with `STRIPE_WEBHOOK_SECRET` unset, every event is rejected, in every environment, and a signature older (or newer) than 5 minutes is rejected as a replay (S2, Council Review 29). Set the secret on every deploy that takes Stripe payments — without it, donations stop reconciling, silently. A connected church's events arrive separately, signed with `STRIPE_CONNECT_WEBHOOK_SECRET`.

> Status notes added when this section moved from the README (2026-10-06): G3.3 merged as PR #181; G5.1 (Resend live) merged as #188 and Resend is live in production, so receipts now go out through Resend when `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are set. Current status is always in [`DEVELOPMENT_PLAN.md` §0](DEVELOPMENT_PLAN.md#0-mvp-roadmap-to-november-6-2026-tracker).

### Communications

For the Communications Hub, also supply:

- `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` — outbound email via SendGrid
- `SENDGRID_WEBHOOK_VERIFICATION_KEY` — the Event Webhook's ECDSA public key, for verifying delivery/bounce/complaint webhooks
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` — outbound SMS via Twilio
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `RESEND_WEBHOOK_SECRET` — outbound email via Resend (ADR 0006's primary provider, chosen over SendGrid when the key and from-address are both set, on both the communications queue and the direct receipt path; G5.1, merged as #188; live in production since 2026-10-06)
- When these vars are absent, the adapters return a stub "sent" result **outside production** (or with `NEXT_PUBLIC_DEMO_MODE=true`), so local dev and demos are unaffected — a production deploy without them returns `provider_not_configured` instead of reporting a message as delivered that never was (Council Reviews 22 and 23; `lib/stub-mode.ts`). Volunteer assignment notifications (`DEVELOPMENT_PLAN.md` row G1.5) and the giving flow (row S8) both depend on this rule. Outbound links (e.g. a volunteer's confirm link) use `NEXT_PUBLIC_APP_URL`; in production without it, the send is skipped rather than mailing a dead `localhost` link.
- **Every delivery webhook fails closed too** (`/api/webhooks/sendgrid`, `/api/webhooks/twilio`, `/api/webhooks/resend`): with its secret unset, the route rejects every request rather than accepting it unverified. SendGrid and Twilio verify the providers' real signature schemes — ECDSA P-256 for SendGrid, HMAC-SHA1 over the exact called URL for Twilio. Twilio's signature check needs `NEXT_PUBLIC_APP_URL` to be the exact public URL Twilio calls; set it before relying on SMS bounce/STOP handling in production (S2, Council Review 29; see `docs/runbooks/communications.md`).

Operator runbook: [docs/runbooks/communications.md](docs/runbooks/communications.md). Production setup: [docs/setup/production-deployment.md](docs/setup/production-deployment.md).

---

## 4. Testing & Verification

Every change ships its test surfaces (see [docs/testing.md](docs/testing.md)). Before asking for review:

```bash
npm run test:surfaces   # coverage manifest: no unregistered, stale or untested surfaces
npm run lint
npm run build
npm run test            # Vitest unit suite
```

`npm run check` runs lint, typecheck and build in one go.

### End-to-end suite

```bash
npm run test:e2e:install                                  # Chromium, once
npm run test:e2e:local                                    # whole suite, as CI runs it
npm run test:e2e:local -- tests/e2e/api-cron.spec.ts      # one spec
npm run test:e2e:local -- -g "as pastor"                  # one identity's sweep
npm run setup:e2e -- --reset                              # start again from clean seed data
```

`scripts/e2e-local.sh` starts both local Supabase stacks (tenant and control plane), seeds demo users, keeps every provider in stub mode, builds the app and runs Playwright against `next start` on port 4200. It refuses to touch a non-local Supabase. Details and local notes: [docs/testing.md](docs/testing.md#running-everything-locally).

### Database and migrations

```bash
npm run lint:migrations   # static checks — no DB required
npm run check:schema      # phantom/orphan table detection — no DB required
npm run audit:rls         # live RLS coverage check — requires local Supabase
npm run test:db           # real-Postgres integration tests — requires local Supabase
```

Migration naming, required RLS patterns and the schema manifest are in [CONTRIBUTING.md](CONTRIBUTING.md#migration-workflow).

### CI

`.github/workflows/ci.yml` runs on every PR and push to `main`:

- **`verify`:** `test:surfaces`, lint, typecheck, build, unit tests, and the RLS audit and database tests against a freshly reset local Supabase.
- **`e2e`** (4 shards): both local Supabase stacks with seed data and demo users, then the full Playwright suite.

Both block merge. **Every change that adds or changes a page, API route, or server action ships its manifest entry and tests**; see [docs/testing.md](docs/testing.md). CodeQL (`codeql.yml`), gitleaks (`secret-scan.yml`) and dependency review (`dependency-review.yml`) also run on pull requests to `main`.

---

## 5. Scripts Reference

| Command | What it does |
| :--- | :--- |
| `npm run dev` | Starts the local development server on port 4200. |
| `npm run build` | Creates the production build. |
| `npm run start` | Serves the production build locally on port 4200. |
| `npm run lint` | Runs ESLint across the repo. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run check` | Lint, typecheck and production build. |
| `npm run test` / `test:watch` / `test:coverage` | Vitest unit suite (once, watch, with coverage). |
| `npm run test:db` | Real-Postgres integration tests (`vitest.db.config.ts`). |
| `npm run test:surfaces` | Checks that every page, API route, and server action is registered in `tests/coverage-manifest.json` with real tests. |
| `npm run test:surfaces:bootstrap` | Bootstraps manifest entries (`scripts/test-surfaces.mjs --bootstrap`). |
| `npm run test:e2e` | Playwright (starts `next dev` itself with the guarded env). |
| `npm run test:e2e:local` | Full Playwright suite against local Supabase, exactly as CI does. |
| `npm run test:e2e:install` | Installs Playwright Chromium. |
| `npm run test:e2e:readiness` / `:member-mobile` / `:onboarding` | Single journeys. |
| `npm run setup:local` | Local Supabase start, reset, and demo users. |
| `npm run setup:e2e` | Both local stacks for e2e (tenant and control plane). |
| `npm run smoke:preview` / `smoke:local` | Smoke checks against a running app. |
| `npm run lint:migrations` | Migration linter. |
| `npm run check:schema` | Schema alignment (phantom/orphan tables). |
| `npm run audit:rls` | RLS coverage audit (local Supabase). |
| `npm run generate:manifest` | Regenerates `supabase/schema-manifest.json`. |
| `npm run check:server-reference-manifest` | Checks locked-down server actions stay unexposed. |
| `npm run setup:demo` | Seeds a demo deployment (`scripts/seed-demo.mjs`). |
| `npm run provision:tenant` | Provisions a new church tenant (`scripts/provision-tenant.mjs`). |
| `npm run test:locgov:consumer` | Localization-governance packed-consumer test. |

---

## 6. Troubleshooting

If `npm run dev` exits unexpectedly, use the fast recovery checklist in [docs/setup/dev-startup-troubleshooting.md](docs/setup/dev-startup-troubleshooting.md).

Most common clean reset flow:

```bash
rm -rf node_modules .next
npm cache clean --force
npm cache verify
npm ci
npm run dev
```

Other common issues:

- **Signed out unexpectedly against local Supabase:** use the JWT (`eyJ…`) keys from `npx supabase status --output env`, not `sb_publishable_*`.
- **New routes error after a pull:** a migration landed; run `npx supabase db reset && ./supabase/scripts/create-dev-users.sh`.
- **e2e says "storageState looks stale":** sessions were invalidated by a re-seed; the `setup` project re-creates them on the next run.
- **Flaky local e2e:** see the local notes in [docs/testing.md](docs/testing.md#local-notes); CI is the judge.

---

## 7. Project Structure

```text
app/                  Next.js App Router entrypoints, layouts, pages, server actions and API routes
components/           Shared UI primitives plus marketing and application components
docs/                 Architecture notes, ADRs, runbooks, reviews and feature documentation
lib/                  Domain logic, data access, providers, AI gateway, crypto
lib/supabase/         Surface-aware Supabase clients (control plane and tenant)
supabase/             SQL migrations, seed data, local setup scripts, control-plane project
scripts/              Repo tooling (surface manifest, RLS audit, migrations lint, provisioning)
tests/                Coverage manifest, e2e (Playwright), database and API tests
public/               Static assets
.github/              CI workflows, issue and PR templates, CODEOWNERS
.claude/ .codex/ .gemini/   Software-factory agents and skills
```

---

## 8. Routes and Application Surface

The primary route list, the product-surface summary and the per-feature implementation notes that used to live in the README are in **[docs/application-surface.md](docs/application-surface.md)**. A guided product walkthrough is in [docs/application-guide.md](docs/application-guide.md), and the role-by-route access evidence is in [docs/security-role-access-matrix.md](docs/security-role-access-matrix.md).

---

## 9. Crons and ShepherdAI Operations

- Core module location: `lib/shepherd-ai/`
- Workflow operations module: `lib/ministry-workflows/`
- Church-admin workflow queue route: `/app/church-admin/workflows`
- Scheduled evaluation endpoint: `/api/cron/shepherd-ai`
- Data persistence tables: `ai_signals`, `ai_suggestions`, `workflows`, `workflow_actions`, `workflow_feedback`
- Product boundary: Ops-only data and logic; no Academy or Care cross-product inference

For recurring evaluation, configure `CRON_SECRET` and deploy `vercel.json` cron schedule. Every `/api/cron/*` route fails closed (S4, `lib/cron-auth.ts`): without `CRON_SECRET` it rejects every request on any built deploy (production, preview, demo), and only `next dev` runs it unauthenticated. Vercel Cron sends the secret as `Authorization: Bearer <CRON_SECRET>`; `x-cron-secret` also works for manual runs.
The endpoint supports scoped runs with `tenantId` and bounded runs with `maxTenants`.
Hosted rollout reference: [docs/setup/hosted-shepherdai-rollout.md](docs/setup/hosted-shepherdai-rollout.md).

See [docs/shepherd-ai-ops.md](docs/shepherd-ai-ops.md) for architecture and guardrails.

---

## 10. AI-Assisted Software Factory

ChurchCore includes a repo-local software factory for structured AI-assisted development:

- **Claude Code:** use `.claude/agents/`, `.claude/skills/feature-factory`, `.claude/skills/build-with-tests`, and `.claude/hooks/pre-commit.sh`.
- **Codex:** use `.codex/skills/churchcore-feature-factory`, `.codex/skills/churchcore-build-with-tests`, and `.codex/skills/churchcore-pr-review`.
- **Gemini (Antigravity):** use `.gemini/skills/gemini-feature-factory`, `.gemini/skills/gemini-build-with-tests`, and `.gemini/skills/gemini-pr-review`.

- **The Council (v2):** five read-only audit agents (Data & API, Routes & Pages, UX & Shell, Feature & Plan, Security) plus a Documenter run before every non-trivial merge to `main`; the synthesis opens with a RATIFIED/AMENDED/REJECTED recommendation. See [`improve-software.md`](improve-software.md) and [`docs/reviews/`](docs/reviews/).
- **Project HQ (`/hq`, platform staff only):** a register of tasks, risks and decisions plus an AI advisor and an in-app Council (five seats in parallel, then a synthesis). Prompts are PII-scrubbed inside the gateway; only register titles and statuses are sent. Portable spec: [`docs/council-and-hq-portable.md`](docs/council-and-hq-portable.md).

Start with [docs/software-factory.md](docs/software-factory.md) for the how-to and [docs/diagrams.md](docs/diagrams.md#claude-code-software-factory) for the visual workflow maps.

### Preferred Factory Workflow

ChurchCore is intentionally transparent: every meaningful change should leave enough documentation for a future maintainer, church evaluator, or security reviewer to understand what changed, why it changed, and how it was verified.

Use this workflow for non-trivial work in Claude Code, Codex, or Gemini:

1. Read `DEVELOPMENT_PLAN.md`, `AGENTS.md`, relevant docs, and relevant ADRs.
2. Run the factory research phase before implementation.
3. Write or confirm the user story and acceptance criteria.
4. Write or confirm the technical brief, including tenant boundaries, RBAC, sensitive data, tests, and documentation impact.
5. Implement in the smallest coherent vertical slice.
6. Update `README.md`, `CHANGELOG.md`, and the relevant document under `docs/`.
7. Run `npm run lint` and `npm run build` when feasible; run focused tests for touched behavior.
8. Use the validator or PR-review workflow before commit or PR handoff.
9. Commit on a feature branch, push the branch, open a pull request, merge through GitHub after required checks/review, then pull `main`.

Claude Code should run this through the `feature-factory` and `build-with-tests` skills. Codex should run the same sequence through `churchcore-feature-factory`, `churchcore-build-with-tests`, and `churchcore-pr-review`. Gemini (Antigravity) should run the sequence through `gemini-feature-factory`, `gemini-build-with-tests`, and `gemini-pr-review` (integrating the native Planning Mode).

---

## 11. Documentation and GitHub Discipline

Every significant change must keep these files current:

- `README.md` (and `HOWTO.md` when setup, scripts or env vars change)
- `CHANGELOG.md`
- `DEVELOPMENT_PLAN.md`
- `docs/UI-UPDATES.md` for visual-system decisions
- Relevant feature or architecture docs in `docs/`

Current tracked follow-up:

- See `docs/plans/reporting-implementation.md` for the reporting-suite implementation plan covering member, event, giving, ministry, communications, outreach, and executive dashboards.
- See `docs/plans/ministry-spec.md` for the repo-level ministry source-of-truth and doc index for Ministry Forge planning.
- See `docs/todo.md` for the remaining Supabase project hookup steps.
- See `docs/church-admin-people.md` for the current ChurchAdmin people-management scope.
- See `docs/church-admin-workspace.md` for the current ChurchAdmin operations, accounts, and event-management scope.
- See `docs/sprint2-attendance-identity-flow.md` for the detailed Sprint 2 engineering description covering schema, routes, actions, and current constraints.
- See `docs/advanced-ministry-forge-research-spec.md` for the reconciled engineering direction for specialized ministry tracks, stewardship metrics, children safety, mentorship visibility, and confidentiality guardrails.
- See `docs/setup/local-supabase.md` for the complete local Supabase setup guide, dev account credentials, seeded demo data reference, and troubleshooting.
- See `docs/plans/advanced-ministry-elders-pastor.md` for the advanced ministries, elders, and pastor-council feature direction.
- See `docs/plans/churchgoer-data.md` for the churchgoer data and self-service portal source of truth.
- See `docs/churchgoer-pastor-execution-plan.md` for the current execution sequence across churchgoer and pastor data work.
- See `docs/pastoral-care-foundation.md` for the current pastoral notes and care assignment scope.
- Live sends need an email provider (`RESEND_*`, the primary since G5.1, or `SENDGRID_*` as fallback) and `TWILIO_*` for SMS; see `.env.example` for the full list.

### GitHub Workflow Discipline

- Feature and bug issues should cite the relevant `DEVELOPMENT_PLAN.md` sections before implementation starts.
- Pull requests should explain plan alignment, validation performed, and any security, AI, or sensitive-data implications.
- Use the checked-in templates in `.github/` so planning and review stay consistent with the development plan.

---

## 12. PR & Contribution Flow

1. Never push directly to `main`.
2. Create a feature branch: `git checkout -b feat/your-feature-name`.
3. Add or update the `tests/coverage-manifest.json` entry and tests for every page, API route, or server action you touch.
4. Verify: `npm run test:surfaces`, `npm run lint`, `npm run build`, `npm run test`.
5. Run the Council before a non-trivial merge ([improve-software.md](improve-software.md)), with the Documenter close-out.
6. Commit with signed commits from a GitHub-verified email; push and open a pull request (`gh pr create`).
7. Merge through GitHub once required checks and review pass, then pull `main`.

Full rules: [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).
