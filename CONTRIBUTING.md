# Contributing

ChurchCore is currently a private evaluation repository. Treat every change as production-adjacent because the codebase touches finance, child-safety workflows, and other sensitive church data.

## Before You Change Anything

1. Read `DEVELOPMENT_PLAN.md`.
2. Confirm the work aligns to the current plan sections.
3. Check whether docs or an ADR need to move with the code change.

## Branch and PR Expectations

- Work from a feature or bugfix branch.
- Keep pull requests scoped and explain the user-facing or architectural impact.
- Call out any PII, finance, child-safety, communications, or AI implications directly in the PR.
- Update `README.md`, `CHANGELOG.md`, and relevant docs in `docs/` whenever behavior changes.

## Local Verification

Run the standard verification before asking for review:

```bash
npm run check
```

If your work depends on local Supabase data, also verify the local seeded workflow:

```bash
npx supabase db reset
./supabase/scripts/create-dev-users.sh
```

## Security Expectations

- Do not commit live credentials, copied local tokens, or machine-specific config.
- Keep demo data safe, obviously fictional, and non-production.
- Prefer env-driven local setup over hardcoded values in scripts or docs.
- Surface any sensitive-data or access-control uncertainty before merging.

## Migration Workflow

All schema changes for the tenant database go in `supabase/migrations/` as timestamped SQL files.

### Naming convention

Files must match: `YYYYMMDDHHmmss_short_description.sql`
- 14-digit timestamp (to-the-second precision)
- Lowercase slug with underscores
- Example: `20260615120000_add_giving_campaigns.sql`

### Required patterns for tenant tables

Every `CREATE TABLE` that includes a `church_id` column must have, in the same file:
```sql
alter table public.your_table enable row level security;
create policy "your_table_select" on public.your_table ...;
-- (insert/update/delete policies as needed)
```
The migration linter will fail if this pattern is missing.

### Pre-push checklist

Before opening a PR that includes a migration:
```bash
npm run lint:migrations   # static checks — no DB required
npm run check:schema      # phantom/orphan table detection — no DB required
npm run audit:rls         # live RLS coverage check — requires local Supabase
```

### Schema manifest

If your migration adds or removes a table or column, regenerate the manifest:
```bash
npm run generate:manifest
git add supabase/schema-manifest.json
```
Commit the updated manifest in the same PR as the migration.

### Destructive operations

`DROP TABLE` and `DROP COLUMN` must be preceded by a SQL comment explaining why:
```sql
-- Removing legacy table superseded by event_registrations (see ADR 0003)
drop table if exists old_rsvps;
```
