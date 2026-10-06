# Contributing to ChurchCore

Thank you for helping build ChurchCore. Treat every change as production-adjacent: the codebase touches finance, giving, child-safety workflows, pastoral care and other sensitive church data. Contributions must preserve tenant isolation, role boundaries and the release discipline described here.

---

## Before You Start

1. Read [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md) — the source of truth for scope, stack and release discipline. Open work is a row in its [§0 tracker](DEVELOPMENT_PLAN.md#0-mvp-roadmap-to-november-6-2026-tracker); take the next item from §0.
2. Read [`AGENTS.md`](AGENTS.md) (repository rules), the [README](README.md), the [HOWTO](HOWTO.md), [docs/architecture.md](docs/architecture.md) and [docs/testing.md](docs/testing.md).
3. Confirm the work aligns with the current plan sections, and check whether docs or an ADR need to move with the change. Use an ADR before introducing anything unusual; favor mainstream, well-supported dependencies.
4. Keep the repo aligned with the documented directory structure. Do not add ad hoc folders.
5. Search existing issues and pull requests, and keep each pull request scoped to one logical change.

---

## Development Setup

```bash
git clone https://github.com/ricardojjulia/ChurchCore.git
cd ChurchCore
npm ci
npm run dev            # preview mode on http://localhost:4200
```

For the local Supabase backend, environment variables and the e2e stack, follow [HOWTO.md](HOWTO.md).

---

## Branches, Commits and Pull Requests

- **Never push directly to `main`.** Work from a feature or bugfix branch, push the branch, open a pull request, merge through GitHub after required checks and review, then pull `main`.
- Keep pull requests scoped and explain the user-facing or architectural impact.
- Call out any PII, finance, child-safety, communications or AI implications directly in the PR.
- Update `README.md`, `CHANGELOG.md` and the relevant docs in `docs/` whenever behavior changes (and `HOWTO.md` when setup, scripts or environment variables change).
- Document meaningful factory runs transparently — intent, architecture impact, verification commands and results, residual risk and follow-up work — in committed docs ([`docs/factory-runs/`](docs/factory-runs/)) or handoff notes, not only in chat.

### Verified commit signatures

`main` requires verified commit signatures. Set up commit signing locally (`git config commit.gpgsign true`, `git config gpg.format ssh` + `user.signingkey`, or the GPG equivalent) **and** make sure `git config user.email` is an address that is actually verified on your GitHub account. A signed commit from an unverified or placeholder email (for example a default `your-email@example.com`) still shows as unverified and blocks merge.

Before opening or updating a PR, check each commit:

```bash
gh api repos/<owner>/<repo>/commits/<sha> --jq '.commit.verification'
```

It should report `"verified": true`. If it reports `"reason": "unverified_email"`, rewrite that commit's author and committer to a verified address (for example the GitHub-issued `<id>+<user>@users.noreply.github.com`) with `--author` / `GIT_COMMITTER_EMAIL` on the affected commits. A green CI run does not imply signature verification.

### The Council

**The Council runs before every non-trivial merge to `main`.** Council v2 is five read-only audit seats (data/API, routes/pages, UX/shell, feature/competitive, security) plus a Documenter that updates the plan, CHANGELOG, README/docs and ADRs once verification is clean. A PR for non-trivial work references its council synthesis in [`docs/reviews/`](docs/reviews/) and confirms Documenter sign-off in its description. Scope and exceptions: [`improve-software.md`](improve-software.md) §0.

After the Council, read GitHub's automated review comments on the PR before merging, fix what is real, and resolve the threads — conversation resolution is required.

---

## Engineering Standards

- **Tenant isolation (non-negotiable):** every tenant table carries `church_id` and has Row-Level Security in the same migration that creates it. Never rely on application-level filtering alone. See [docs/tenant-data-segmentation.md](docs/tenant-data-segmentation.md).
- **Control plane vs. tenant app:** `/control` and `/app` are separate surfaces with separate data ([ADR 0002](docs/adr/0002-control-plane-and-tenant-separation.md)). Cross-boundary access must be explicit and audited.
- **`server-only` vs. `"use server"`:** a module whose exports take a trusted session or tenant id is `import "server-only"`. Only a module whose exports authenticate their own caller (session plus role check) may be `"use server"` ([ADR 0022](docs/adr/0022-communications-compliance-lookups-admin-client.md)).
- **`SECURITY DEFINER` functions** take their actor from `auth.uid()`, never an argument ([ADR 0024](docs/adr/0024-security-definer-actor-from-auth-uid.md)).
- **Fail closed:** webhooks reject every request when their secret is unset; crons require `CRON_SECRET`; provider stubs may report success only outside production or in demo mode (`lib/stub-mode.ts`).
- **One AI gateway:** every LLM call goes through `lib/ai/gateway.ts` ([ADR 0027](docs/adr/0027-openrouter-ai-gateway.md)).
- **Design system:** colours come from the Mantine theme or a CSS variable in `app/globals.css`, never a new hard-coded colour literal; `components/theme-provider.test.ts` enforces it ([ADR 0026](docs/adr/0026-churchcore-design-system-parity.md)).

---

## Every Change Ships Its Test Surfaces

A PR that adds or changes a page, API route or server action must update its entry in [`tests/coverage-manifest.json`](tests/coverage-manifest.json) — allowed roles read from the code's real gates, never guessed — and ship the tests that entry points to. A new server-action export must be named in a test that imports or mocks its module, or be listed in that module's `untestedExports` with a reason. The rule applies to small changes too. Details: [docs/testing.md](docs/testing.md).

## Local Verification

Run the standard verification before asking for review:

```bash
npm run test:surfaces
npm run lint
npm run build
npm run test
```

`npm run check` runs lint, typecheck and build together. For a change that touches pages, roles or API routes, also run the e2e suite locally (`npm run test:e2e:local`); CI runs it on every PR.

If your work depends on local Supabase data, also verify the local seeded workflow:

```bash
npx supabase db reset
./supabase/scripts/create-dev-users.sh
```

## Security Expectations

- Do not commit live credentials, copied local tokens or machine-specific config.
- Keep demo data safe, obviously fictional and non-production.
- Prefer env-driven local setup over hardcoded values in scripts or docs.
- Surface any sensitive-data or access-control uncertainty before merging.
- Report vulnerabilities privately, as described in [SECURITY.md](SECURITY.md).

---

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

A merged migration still has to be applied to the hosted database; record that as an owner action in the PR and the CHANGELOG.

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

---

## Software Factory

Claude Code, Codex and Gemini sessions use the repo-local skills in `.claude/skills/`, `.codex/skills/` and `.gemini/skills/` (feature factory, build-with-tests, PR review, Council, Testing Council). Keep all three surfaces aligned when changing the workflow. How-to: [docs/software-factory.md](docs/software-factory.md).

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
