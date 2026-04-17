# Contributing

ChurchForge is currently a private evaluation repository. Treat every change as production-adjacent because the codebase touches finance, child-safety workflows, and other sensitive church data.

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
