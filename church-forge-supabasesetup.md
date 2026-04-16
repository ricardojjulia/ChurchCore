# ChurchForge — Local Supabase Setup

This document covers how to start, seed, and reset the local Supabase instance for ChurchForge development.

---

## Prerequisites

- Node.js 18+ and npm
- Docker Desktop running
- Supabase CLI available via `npx supabase`

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
| DB (psql) | postgresql://postgres:postgres@127.0.0.1:54322/postgres |

### 2. Configure `.env.local`

Your `.env.local` should contain:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Local Supabase
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

> **Note:** The publishable key is the JWT `eyJ…` format. The `sb_publishable_*` format shown in `supabase status` (non-`--output env`) is NOT compatible with `@supabase/ssr`.
> To get the JWT keys, run: `npx supabase status --output env`

### 3. Apply migrations and seed

```bash
# Apply all migrations (wipes and recreates the DB)
npx supabase db reset

# Create auth users and seed data
./supabase/scripts/create-dev-users.sh
```

> `db reset` wipes `auth.users`. You must run `create-dev-users.sh` after every reset.

---

## Development Accounts

| Email | Password | Role |
|-------|----------|------|
| `sarah@churchforge.app` | `Password123!` | Church Admin + Platform Admin |
| `david@graceharbor.church` | `Password123!` | Member |

Sarah can access:
- `/app` — Church admin workspace
- `/control` — Control plane (platform admin)

David can access:
- `/app` — Member portal

---

## Seeded Demo Data

The seed creates **Grace Harbor Church** with the following:

### Ministries (all 6, including all 5 track panel types)

| Ministry | Type | Track Panel |
|----------|------|-------------|
| Worship Team | `worship` | Worship tab: rehearsal schedule + song library |
| Men's Ministry | `men` | Men's tab: mentorship pairs + discipleship groups |
| Women's Ministry | `women` | Women's tab: life-stage circles + support pairings |
| Marriage Ministry | `marriage` | Marriage tab: mentor couples + enrichment cohorts |
| Global Missions | `missions` | Missions tab: partners + trip roster with impact |
| Community Outreach | `outreach` | No track tab (general type) |

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

---

## Day-to-Day Commands

```bash
# Start local Supabase (if Docker is running but supabase is stopped)
npx supabase start

# Stop
npx supabase stop

# Full reset (wipes DB, re-runs all migrations, re-seeds)
npx supabase db reset && ./supabase/scripts/create-dev-users.sh

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
Ministry Forge:  http://localhost:3000/app/church-admin/ministry/overview
```

---

## Architecture Notes

### Auth flow (local)

The app detects local Supabase by checking if `NEXT_PUBLIC_SUPABASE_URL` contains `127.0.0.1:54321`. When true and `SUPABASE_DB_URL` is set, it activates a **local DB fallback** path that executes raw SQL against Postgres directly (bypassing RLS). This is intentional for development — it means pages load even when RLS would deny the request.

### Key env variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API endpoint (shared for control plane + tenant) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Anon key for `@supabase/ssr` client |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key for server actions (invite user, etc.) |
| `SUPABASE_DB_URL` | Direct Postgres connection for local fallback queries |

For production, these can be split into `CONTROL_PLANE_SUPABASE_URL` + `TENANT_SUPABASE_URL` etc. to use separate Supabase projects. See `lib/supabase/config.ts` for the full resolution logic.

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
The tab appears only when `ministry.ministry_type` is one of: `worship`, `men`, `women`, `marriage`, `missions`. The seed sets these correctly for the 5 demo ministries.

**RLS blocking queries in dev**
The local fallback path uses raw SQL (bypassing RLS) when `SUPABASE_DB_URL` is set and the URL includes `127.0.0.1`. If you're seeing empty data, check that `SUPABASE_DB_URL` is set in `.env.local`.
