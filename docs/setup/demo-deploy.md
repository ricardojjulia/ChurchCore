# Demo Environment Deployment Guide

Step-by-step runbook for deploying or re-deploying the ChurchCore hosted demo.
Written from production experience — every gotcha below was hit in real deployment.

**Estimated time: 20–30 minutes for a first-time setup. Under 10 minutes for a re-seed.**

---

## Overview

The demo uses two Supabase projects and one Vercel project:

| Layer | Project | Purpose |
|---|---|---|
| Tenant runtime | `xsmcurhmgmnxxppkorpq` | Church data (profiles, events, finance, etc.) |
| Control plane | `iopydttovnyjgikprvol` | Platform ops, demo feedback, staff login |
| Hosting | Vercel `church-core-ops` | Next.js deployment at `church-core-ops.vercel.app` |

---

## Prerequisites

- `supabase` CLI installed and logged in (`supabase login`)
- `node` 20+ and `npm` available
- GitHub repo access
- Vercel account with a personal access token (vercel.com/account/tokens)
- Access to both Supabase project dashboards (or use `supabase projects api-keys`)

---

## Step 1 — Apply migrations

### Tenant project (church data)

```bash
supabase link --project-ref xsmcurhmgmnxxppkorpq
supabase db push
```

This applies all migrations in `supabase/migrations/`. The CLI authenticates with
your logged-in Supabase account — no DB password needed if already linked.

### Control-plane project

```bash
supabase link --project-ref iopydttovnyjgikprvol --workdir supabase/control-plane
supabase db push --workdir supabase/control-plane
```

The control-plane has its own `supabase/control-plane/config.toml` and migrations
directory. Always use `--workdir supabase/control-plane` for all CP commands.

**If the control-plane project is paused (Supabase free tier):** Go to
`https://supabase.com/dashboard/project/iopydttovnyjgikprvol` and click
**Restore project** before running migrations.

### Verify migrations applied

```bash
supabase db push --workdir supabase/control-plane
# Should print: "Remote database is up to date."
```

---

## Step 2 — Set Vercel environment variables

Get the API keys first:

```bash
# Tenant keys
supabase projects api-keys --project-ref xsmcurhmgmnxxppkorpq

# Control-plane keys
supabase projects api-keys --project-ref iopydttovnyjgikprvol
```

Set all of the following in **Vercel → church-core-ops → Settings → Environment Variables**,
or use the API script below.

### Complete env var table

| Variable | Target | Value source |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All | Tenant project URL (`https://xsmcurhmgmnxxppkorpq.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | All | Tenant `default` (sb_publishable_…) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview | Tenant `service_role` JWT |
| `CONTROL_PLANE_SUPABASE_URL` | All | CP project URL (`https://iopydttovnyjgikprvol.supabase.co`) |
| `CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY` | All | CP `default` (sb_publishable_…) key |
| `CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY` | Production, Preview | CP `service_role` JWT |
| `NEXT_PUBLIC_DEMO_MODE` | Production | `true` |
| `NEXT_PUBLIC_DEMO_VERSION` | Production | `3.3.0` (or current) |
| `NEXT_PUBLIC_APP_URL` | Production | `https://church-core-ops.vercel.app` |

> **Use `NEXT_PUBLIC_SUPABASE_URL` (not `TENANT_SUPABASE_URL`)** for the tenant Supabase
> connection. The browser-side Supabase client needs a `NEXT_PUBLIC_` prefixed URL.
> The named `TENANT_SUPABASE_*` vars work server-side only.

> **Never set `TENANT_DB_URL` or `CONTROL_PLANE_DB_URL` in production.** Setting either
> activates the local SQL fallback (`shouldUseLocalTenantDbFallback()` returns true),
> bypassing Supabase entirely.

### One-shot API script (requires Vercel token)

```bash
TOKEN="your_vercel_personal_access_token"
PID="prj_EenEe6VGiwNOgK2FyMpWO8jFCRAH"
TID="team_NeSmoYaK8Ipt4aIP6PAW42Mi"

# Get current env var IDs first, then PATCH each one:
curl -s "https://api.vercel.com/v9/projects/${PID}/env?teamId=${TID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  | python3 -c "import sys,json; [print(e['key'], '->', e['id']) for e in json.load(sys.stdin).get('envs',[])]"
```

Use the IDs from the output to PATCH each var:

```bash
curl -X PATCH "https://api.vercel.com/v9/projects/${PID}/env/{ID}?teamId=${TID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"value":"your_value_here"}'
```

---

## Step 3 — Run the seed script

```bash
TENANT_SUPABASE_URL=https://xsmcurhmgmnxxppkorpq.supabase.co \
TENANT_SUPABASE_SERVICE_ROLE_KEY=<tenant_service_role_jwt> \
node scripts/seed-demo.mjs
```

Or set the vars in your shell first and run `npm run setup:demo`.

**The script is fully idempotent** — re-running is safe. It deletes and re-inserts
finance data on each run to avoid stale duplicate keys from prior runs.

### Expected output

```
Seed summary
============
  profiles                     15
  events                        4
  finance_accounts              4
  finance_journal_lines         5
  care_assignments              2
  ai_suggestions                2
  workflows                     2
  ... (36 tables total)
```

The following WARNs are non-critical and expected on re-runs:

| WARN | Reason | Impact |
|---|---|---|
| `church_settings: Could not find table` | Table not in schema | None — skipped safely |
| `service_attendance: duplicate key` | Already seeded | None — idempotent skip |
| `attendance: service_date column not found` | Schema mismatch | None — skipped safely |

Any other WARN on profiles, finance, or FK tables is a real error — stop and investigate.

---

## Step 4 — Deploy to Vercel

### Normal path (GitHub auto-deploy)

Merging to `main` triggers Vercel automatically. After merging:

1. Go to `https://vercel.com/church-core/church-core-ops/deployments`
2. Confirm a new deployment appears and reaches **READY** state

If no deployment appears within 2 minutes, the Vercel GitHub App may have lost
repo access. Use the manual path below.

### Manual deploy (GitHub App unavailable)

```bash
# Ensure local main is up to date
git checkout main && git reset --hard origin/main

# Deploy directly from local
npx vercel@latest --prod --token "$TOKEN" --yes
```

This uploads the local working tree to Vercel, bypasses the GitHub integration,
and deploys directly to production. Use this as the fallback only — the GitHub
integration is preferred for traceability.

---

## Step 5 — Validate the deployment

1. Open `https://church-core-ops.vercel.app` in a private browser window
2. Sign in with `admin@graceharbor.church` / `ChurchCoreDemo2026!`
3. Confirm the Weekly Readiness panel loads with colored tiles
4. Sign out and sign in as `member@graceharbor.church` — member portal should load
5. Click the floating **Feedback** button (bottom-right) — should open a modal
6. Submit a test feedback item — confirm the toast appears

---

## Demo credentials

All five accounts use the same password: **`ChurchCoreDemo2026!`**

| Email | Role |
|---|---|
| admin@graceharbor.church | Church Administrator |
| member@graceharbor.church | Member / Volunteer |
| secretary@graceharbor.church | Secretary / Office Admin |
| pastor@graceharbor.church | Pastor / Elder |
| leader@graceharbor.church | Ministry Leader |

Demo church: **Grace Harbor Church** (Brighton, MI)

---

## Lessons learned (hard stops that were hit in real deployment)

### 1. Vercel Hobby plan: cron job frequency limit

**What happened:** Every build failed from day one. The error message was hidden
behind a vague "deployment failed" status. The actual error: the `vercel.json`
cron schedules (`0 */6 * * *` and `*/15 * * * *`) run more than once per day,
which is a Pro-only feature.

**Fix:** All cron schedules in `vercel.json` must be once-daily (`0 N * * *`) for
Hobby-plan deployments.

**Lesson:** Check Vercel plan limits before adding cron jobs. The failure message is
only visible if you actually run `vercel --prod` locally — the GitHub integration
silently errors.

---

### 2. Tenant Supabase URL must use `NEXT_PUBLIC_SUPABASE_URL`

**What happened:** Setting `TENANT_SUPABASE_URL` and `TENANT_SUPABASE_PUBLISHABLE_KEY`
in Vercel didn't enable the browser-side Supabase client.

**Why:** Variables without a `NEXT_PUBLIC_` prefix are server-only in Next.js.
The browser-side auth client needs `NEXT_PUBLIC_SUPABASE_URL`. The code's fallback
chain (`getTenantSupabaseEnv()`) checks named `TENANT_*` vars first, then falls
back to `NEXT_PUBLIC_SUPABASE_*`. Always set the `NEXT_PUBLIC_SUPABASE_*` vars.

---

### 3. Env vars were empty strings, not absent

**What happened:** All Vercel env vars had been created (keys existed) but with
empty string values `""`. The build appeared configured but nothing worked.

**Fix:** Always verify VALUES not just key names when auditing Vercel env vars.
Use the API with `?decrypt=true` to see actual values.

---

### 4. Seed: profiles require `is_pastoral: false`

**What happened:** All 10 directory-only profiles in `seedProfiles()` were missing
the `is_pastoral` field. The profiles table has a `NOT NULL` constraint on it.
One NULL row failed the entire batch, cascading FK failures to every table that
references `profiles.id`.

**Fix:** Every profile object — auth-linked or directory-only — must include
`is_pastoral: false` (or `true` for pastor_elder role).

**Lesson:** When a seed has a batch upsert failure, trace the dependency chain
upward. The real error is almost always in the first inserted table (profiles), not
in the 20 tables that fail downstream.

---

### 5. Seed: UUID prefixes must be valid hex

**What happened:** Profile and entity IDs like `jl100000-...`, `bl100000-...`,
`ar100000-...`, `wf100000-...`, `ai100000-...` failed with
`invalid input syntax for type uuid`. The characters `j`, `l`, `r`, `w`, `i`
are not valid hexadecimal (valid: `0-9`, `a-f`).

**Fix:** Use only `0-9` and `a-f` in UUID constants. Replace invalid chars:
`jl → f1`, `bl → b1`, `ar → a3`, `wf → cf`, `ai → a4`.

**Lesson:** Visually readable UUID prefixes (initials, words) are a common trap.
Always verify all fixed UUID constants parse as valid hex before seeding.

---

### 6. Seed: schema column names diverge from intuition

Several tables had column names that differ from what you'd guess:

| Table | Wrong column | Correct column |
|---|---|---|
| `service_plans` | `title` | `name` |
| `service_plan_positions` | `service_plan_id`, `role_title`, `is_required` | `plan_id`, `role_name`, `quantity_needed` |
| `communication_suppressions` | `email`, `suppressed_at` | `contact`, *(no suppressed_at)* |
| `care_assignments` status | `'completed'` | `'closed'` (valid: `open`, `in_progress`, `closed`) |
| `workflows` | `church_id`, `assigned_to`, `title`, etc. | `tenant_id`, `assigned_to_user_id`, *(no title)* |
| `ai_suggestions` | `church_id`, `body`, `suggestion_type` | `tenant_id`, `summary`, `workflow_code` |

**Lesson:** Always read the migration file for a table before seeding it. Check
column names, NOT NULL constraints, and valid values for check constraints.

---

### 7. Seed: ai_suggestions must be seeded before workflows

**What happened:** `workflows` has a `suggestion_id FK → ai_suggestions.id`.
The seed function seeded workflows first, then ai_suggestions.

**Fix:** In any seed function with FK dependencies, seed parent tables before child
tables. Rename/reorder if the function was written in reverse.

---

### 8. Seed: finance upsert conflict key must be `id`, not composite

**What happened:** `finance_accounts` was upserting with `onConflict: 'church_id,account_code'`.
PostgreSQL generates `ON CONFLICT (church_id,account_code) DO UPDATE SET id=EXCLUDED.id,...`.
Even when the id value doesn't change, including `id=EXCLUDED.id` in the UPDATE SET
triggers the FK check from `finance_journal_lines`, which fails.

**Fix:** Use `onConflict: 'id'` (the default). The UPDATE clause then only sets
non-key columns and never touches the primary key.

---

### 9. Seed: finance tables need cleanup on re-run

**What happened:** If a previous seed run left `finance_journal_lines` rows pointing
to `finance_accounts` rows that have since been deleted (or replaced with different IDs),
re-seeding fails with FK violations.

**Fix:** The seed script now calls `deleteFinanceData()` before re-inserting finance
tables, deleting in FK-safe order:
`finance_budget_lines → finance_budgets → finance_journal_lines → finance_journals → giving_fund_accounts → finance_accounts`

---

### 10. Supabase free tier: projects auto-pause after 1 week of inactivity

**What happened:** The control-plane project was paused and migrations couldn't be applied.

**Fix:** Unpause at `https://supabase.com/dashboard/project/iopydttovnyjgikprvol`.
The project resumes in about 30 seconds.

**Lesson:** If you're on the free tier, check both projects are active before
starting a demo deployment. Projects pause after 1 week without traffic.

---

### 11. Vercel GitHub App access can be lost

**What happened:** Merging to `main` didn't trigger Vercel deployments. The GitHub
integration was configured correctly but the Vercel GitHub App had lost write access
to the repository.

**Diagnosis:** Run `npx vercel@latest inspect <deployment-url> --token $TOKEN` to
see the real error from the Vercel CLI, which shows more detail than the dashboard.

**Fix:** Use `npx vercel@latest --prod --token $TOKEN --yes` to deploy directly
from local. Investigate and re-authorize the GitHub App when you have time.

---

## Resetting demo data

Run the seed script again at any time — it deletes and re-inserts all demo data:

```bash
TENANT_SUPABASE_URL=https://xsmcurhmgmnxxppkorpq.supabase.co \
TENANT_SUPABASE_SERVICE_ROLE_KEY=<tenant_service_role_jwt> \
node scripts/seed-demo.mjs
```

---

## Viewing demo feedback

Platform staff can review feedback submitted via the Feedback button at:

```
https://church-core-ops.vercel.app/control/demo-feedback
```

Log in with a control-plane staff account (configured separately — not the
demo church credentials).

---

## Reference: Supabase project details

| Project | Ref | URL |
|---|---|---|
| Tenant (church data) | `xsmcurhmgmnxxppkorpq` | `https://xsmcurhmgmnxxppkorpq.supabase.co` |
| Control plane | `iopydttovnyjgikprvol` | `https://iopydttovnyjgikprvol.supabase.co` |

Retrieve API keys at any time:

```bash
supabase projects api-keys --project-ref xsmcurhmgmnxxppkorpq
supabase projects api-keys --project-ref iopydttovnyjgikprvol
```

## Reference: Vercel project details

| Field | Value |
|---|---|
| Project name | `church-core-ops` |
| Project ID | `prj_EenEe6VGiwNOgK2FyMpWO8jFCRAH` |
| Team ID | `team_NeSmoYaK8Ipt4aIP6PAW42Mi` |
| Production URL | `https://church-core-ops.vercel.app` |
| Plan | Hobby (crons: once-daily max) |
