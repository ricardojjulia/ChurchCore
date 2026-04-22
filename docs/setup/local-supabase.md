# ChurchForge — Local Supabase Setup

This document covers how to start, seed, and reset the local Supabase instance for ChurchForge development.

---

## Prerequisites

- Node.js 18+ and npm
- Docker Desktop running
- Supabase CLI available via `npx supabase`

## Quick Reference

| Tool | URL |
| --- | --- |
| Project URL | `http://127.0.0.1:54321` |
| Studio | `http://127.0.0.1:54323` |
| Mailpit | `http://127.0.0.1:54324` |
| REST | `http://127.0.0.1:54321/rest/v1` |
| GraphQL | `http://127.0.0.1:54321/graphql/v1` |
| Edge Functions | `http://127.0.0.1:54321/functions/v1` |
| App | `http://localhost:3000` |

---

## First-Time Setup

### 1. Start Supabase

```bash
npx supabase start
```

This launches the local stack: Postgres, Auth, REST API, Studio, and Mailpit. Services bind to `127.0.0.1`.

| Service   | URL                        |
|-----------|----------------------------|
| API       | http://127.0.0.1:54321     |
| Studio    | http://127.0.0.1:54323     |
| Mailpit   | http://127.0.0.1:54324     |
| DB (psql) | postgresql://postgres:<local-db-password>@127.0.0.1:54322/postgres |

### 2. Configure `.env.local`

Your `.env.local` should contain values derived from `npx supabase status --output env`:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Local Supabase
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...   # ANON_KEY from supabase status --output env
SUPABASE_SERVICE_ROLE_KEY=eyJ...              # SERVICE_ROLE_KEY from supabase status --output env
SUPABASE_DB_URL=postgresql://postgres:<local-db-password>@127.0.0.1:54322/postgres
```

> **Note:** The publishable key is the JWT `eyJ…` format. The `sb_publishable_*` format shown in `supabase status` (non-`--output env`) is NOT compatible with `@supabase/ssr`.
> To get the JWT keys, run: `npx supabase status --output env`

### 3. Apply migrations and seed

```bash
npm run setup:local
```

Equivalent manual flow:

```bash
# Apply all migrations (wipes and recreates the DB)
npx supabase db reset

# Create auth users and seed data
./supabase/scripts/create-dev-users.sh
```

> `db reset` wipes `auth.users`. You must run `create-dev-users.sh` after every reset.
> When `CHURCHFORGE_DEV_PASSWORD` is not set, the script generates a local password and writes it to the gitignored `.demo-credentials.local`.

---

## Development Accounts

| Email | Role |
|-------|------|
| `sarah@churchforge.app` | Church Admin + Platform Admin |
| `david@graceharbor.church` | Member |

The password is either:

- the value of `CHURCHFORGE_DEV_PASSWORD`, if you set it before running the script
- or a generated password printed by the script and saved to `.demo-credentials.local`

The generated file also includes:

- `CHURCHFORGE_DEMO_ADMIN_EMAIL`
- `CHURCHFORGE_DEMO_MEMBER_EMAIL`

Sarah can access:
- `/app` — Church admin workspace
- `/control` — Control plane (platform admin)

David can access:
- `/app` — Member portal

---

## Seeded Demo Data

The seed creates **Grace Harbor Church** with the following:

### Ministries (10 total)

| Ministry | Type | Track Panel |
|----------|------|-------------|
| Worship Team | `worship` | Worship tab: rehearsal schedule + song library |
| Men's Ministry | `men` | Men's tab: mentorship pairs + discipleship groups |
| Women's Ministry | `women` | Women's tab: life-stage circles + support pairings |
| Marriage Ministry | `marriage` | Marriage tab: mentor couples + enrichment cohorts |
| Global Missions | `missions` | Missions tab: partners + trip roster with impact |
| Community Outreach | `outreach` | Outreach tab: events + zones |
| Children's Church | `children` | CCM dashboard + services + check-in/check-out |
| Youth Ministry | `youth` | Youth tab: milestones + readiness tracking |
| Young Adults | `young_adult` | Young adults tab: mentorship pairs |
| Discipleship Classes | `education` | Education tab: course coverage |

### Profiles

| Name | Email | Role |
|------|-------|------|
| Sarah Mitchell | sarah@churchforge.app | church_admin |
| David Chen | david@graceharbor.church | member_volunteer |
| James Ortega | james@graceharbor.church | member_volunteer |
| Aisha Thompson | aisha@graceharbor.church | member_volunteer |
| Robert James | robert@graceharbor.church | member_volunteer |
| Marcus Williams | marcus@graceharbor.church | member_volunteer |
| Linda Nguyen | linda@graceharbor.church | member_volunteer |
| Grace Adeyemi | grace@graceharbor.church | member_volunteer |

### Track data

- **Worship:** 7 songs (hymns + contemporary), 2 upcoming rehearsals
- **Men's:** 2 mentorship pairs, 2 discipleship groups
- **Women's:** 3 life-stage circles, 2 support pairings
- **Marriage:** 2 mentor couples, 2 enrichment cohorts
- **Missions:** 3 partner organizations, 2 trips (1 completed, 1 confirmed)
- **Outreach:** 5 events and 5 neighborhood zones
- **CCM:** 1 open service, 3 check-in sessions, volunteer assignments, pickups, and 1 incident
- **Youth:** milestone and graduation-readiness demo data
- **Young Adults:** career mentorship demo data
- **Education:** 7 discipleship courses with enrollment coverage data

---

## Day-to-Day Commands

```bash
# Start local Supabase (if Docker is running but supabase is stopped)
npx supabase start

# Stop
npx supabase stop

# Full reset (wipes DB, re-runs all migrations, re-seeds)
npx supabase db reset && ./supabase/scripts/create-dev-users.sh

# One-command setup helper
npm run setup:local

# Preview-mode smoke checks (requires app server running)
npm run smoke:preview

# Local seeded-mode smoke checks (requires app server running)
npm run smoke:local

# Open Studio (database browser)
open http://127.0.0.1:54323

# Open Mailpit (email preview — catches all outgoing email locally)
open http://127.0.0.1:54324

# Check status + get API keys
npx supabase status --output env
```

---

## App URLs

```
Sign in:         http://localhost:3000/sign-in
App (member):    http://localhost:3000/app
Control plane:   http://localhost:3000/control
Calendar:        http://localhost:3000/app/calendar
Ministry Forge:  http://localhost:3000/app/church-admin/ministry
CCM Dashboard:   http://localhost:3000/app/church-admin/children/dashboard
```

---

## Architecture Notes

### Auth flow (local)

The app detects local Supabase by checking if `NEXT_PUBLIC_SUPABASE_URL` contains `127.0.0.1:54321`. When true and `SUPABASE_DB_URL` is set, it activates a **local DB fallback** path that executes raw SQL against Postgres directly (bypassing RLS). This is intentional for development — it means pages load even when RLS would deny the request.

### Key env variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Transitional shared Supabase API endpoint for local single-project development |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Anon key for `@supabase/ssr` client |
| `SUPABASE_SERVICE_ROLE_KEY` | Transitional shared admin key for tenant-side server actions in local single-project development |
| `SUPABASE_DB_URL` | Transitional shared Postgres connection for local fallback queries |

For production, these should be split into `CONTROL_PLANE_SUPABASE_URL` + `TENANT_SUPABASE_URL`, `CONTROL_PLANE_DB_URL` + `TENANT_DB_URL`, and matching service-role keys where needed. The current shared local variables are retained only as a transitional fallback. See `lib/supabase/config.ts` for the full resolution logic.

### Migrations fixed

Two schema bugs were discovered during local setup and fixed in follow-up migrations:

| Migration | Fix |
|-----------|-----|
| `20260422000000_fix_platform_admins_fk.sql` | `platform_admins.user_id` now references `auth.users(id)` instead of `profiles(id)` — the RLS function `is_platform_admin()` compares against `auth.uid()` which is an auth user UUID |
| `20260423000000_fix_membership_fks.sql` | `church_memberships.user_id` now references `auth.users(id)` for the same reason |
| `20260424000000_fix_audit_trigger.sql` | `audit_mentorship_pairs()` trigger used wrong column name `changed_by`; corrected to `actor_id` |

---

## Troubleshooting

**"Dev auth users not found" in seed output**
Run `./supabase/scripts/create-dev-users.sh` — `db reset` wipes `auth.users`.

**Sign-in fails / redirect loop**
Check that `.env.local` has all four variables set (URL, publishable key, service role key, DB URL).

**"sb_publishable_* key" format error**
The app uses `@supabase/ssr` which requires JWT keys (`eyJ…`). Get them with:
```bash
npx supabase status --output env
```
Use `ANON_KEY` as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SERVICE_ROLE_KEY` as `SUPABASE_SERVICE_ROLE_KEY`.

**Track panel tab not showing**
The specialized tabs appear only when `ministry.ministry_type` is one of: `worship`, `men`, `women`, `marriage`, `missions`, `children`, `youth`, `young_adult`, `education`, `outreach`. The seed sets these correctly for the 10 demo ministries.

**RLS blocking queries in dev**
The local fallback path uses raw SQL (bypassing RLS) when `SUPABASE_DB_URL` is set and the URL includes `127.0.0.1`. If you're seeing empty data, check that `SUPABASE_DB_URL` is set in `.env.local`.

## Local Dev Security Notice

- All local Supabase services are development-only and should not be treated as production-safe.
- Local JWT keys, storage credentials, and service-role access are shared local values. Keep them out of git and derive them from your own `npx supabase status --output env`.
- Studio, pgMeta, and other local admin surfaces are for local development only and should not be exposed publicly.
