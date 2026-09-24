# Testing

ChurchCore ships three layers of tests. CI runs all of them on every PR, and all of them block merge.

| Layer | Command | What it covers |
|---|---|---|
| Unit | `npm run test` | Vitest: actions, data loaders, components, scripts |
| Surface coverage | `npm run test:surfaces` | Every page, API route, and server action is registered in `tests/coverage-manifest.json` with real tests behind it |
| End to end | `npm run test:e2e:local` | Playwright against a production build and local Supabase: every page × every role, every API route, and the key journeys |

Real-Postgres integration tests (`npm run test:db`) and migration checks stay manual release gates; see `RELEASE_CHECKLIST.md`.

## The rule: every change ships its test surfaces

Any PR that adds or changes a **page**, **API route**, or **server action** must:

1. Add or update its entry in `tests/coverage-manifest.json`.
2. Ship the tests that entry points to.
3. Pass `npm run test:surfaces` and the CI `e2e` job.

This is in `AGENTS.md`, in all three factory skill sets (`.claude`, `.codex`, `.gemini`), and in the PR template. The Council Documenter withholds sign-off until it holds.

## Running everything locally

Prerequisites: Docker running, `npm ci`, and `npm run test:e2e:install` (Chromium) once.

```bash
npm run test:e2e:local                                    # whole suite
npm run test:e2e:local -- tests/e2e/api-cron.spec.ts      # one spec
npm run test:e2e:local -- -g "as pastor"                  # one identity's sweep
```

`scripts/e2e-local.sh` does what the CI job does:

1. Runs `supabase/scripts/setup-e2e.sh`, which:
   - starts both local Supabase stacks: tenant (API 4201, DB 4202) and control plane (API 4211, DB 4212);
   - creates the demo users;
   - registers the admin as a platform admin in the control plane;
   - encrypts the seeded pastoral fields.
2. Exports the same dummy secrets CI uses, with every provider API key empty so SendGrid, Twilio, Resend, Stripe, and Anthropic stay in stub mode.
3. Builds the app and runs Playwright against `next start` on port 4200.

To start from clean seed data, run `npm run setup:e2e -- --reset` first.

### Safety: the suite only ever touches local Supabase

Your `.env.local` may point at hosted projects. The suite cannot reach them, for three reasons:

- `setup-e2e.sh` refuses to continue if either stack reports a non-local URL.
- The runner exports local values, which override `.env.local`: real process env wins over `.env` files in Next.js.
- `tests/e2e/fixtures/env.ts` aborts the whole run if any Supabase URL or DB URL is not `127.0.0.1`/`localhost`. The escape hatch is `E2E_ALLOW_REMOTE_SUPABASE=1`; don't use it against production.

`supabase/scripts/create-dev-users.sh` also lets explicitly exported values win over `.env.local`, so it can't be redirected at a hosted project by accident.

### Local notes

- Local runs cap Playwright at 4 workers. Past that, the local auth containers run out of Postgres connections and sessions read as signed out.
- `npm run test:e2e` on its own uses `next dev` and your current env. That's fine for iterating on one spec with a dev server already running, but use `test:e2e:local` for anything broad.
- If a run fails with "storageState looks stale", the saved sessions were invalidated (for example by a re-seed). The `setup` project re-creates them on the next run.

## What the e2e suite checks

- **`tests/e2e/fixtures/auth.setup.ts`:** signs in once per identity and saves the session: `super-admin` (control plane), `church-admin`, `secretary`, `pastor`, `ministry-leader`, `member`.
- **`tests/e2e/page-role-sweep.spec.ts`:** visits every manifest page as each identity and signed out.
  - Allowed identities: the page renders on its own URL with no 5xx, no error screen ("Something went wrong" / "Application error"), no not-found UI, and no console errors outside `tests/e2e/fixtures/console-allowlist.ts`.
  - Denied identities: land exactly on their own home path (tenant roles on `/control` land on `/sign-in` to switch accounts; a page's `deniedRedirectsTo` overrides), never shown a 5xx.
  - Signed-out visitors: land on `/sign-in` unless the page is public.
  - Dynamic pages use real seeded ids. A `$sql:` value resolves an id at run time for seed rows with random ids; a query that returns nothing fails the run.
  - Pages whose record type has no seed rows are visited with a nonexistent id and must not crash.
  - Known app bugs are listed in `KNOWN_BUGS` and run under `test.fail()`, so fixing one makes the suite report it.
- **`tests/e2e/api-*.spec.ts`:** contract tests for all 15 API routes. They check rejection paths (missing or wrong cron secret, missing or bad webhook signatures, bad unsubscribe tokens, signed-out session routes) and safe happy paths (a valid cron run, a valid unsubscribe writing one suppression row, idempotent re-calls).
- **Journeys:** `church-admin-readiness`, `member-mobile-foundation` (390×844 viewport), and `onboarding-flow` (uses Mailpit on 4205).
- **`npm run check:server-reference-manifest`:** after `next build`, fails if `queueCommunicationAction`, `logAuditEvent`, or `pruneAuditLogsAction` is exposed as a callable server action (ADR 0022).

## Adding a new page, API route, or server action

1. Build the surface.
2. Run `npm run test:surfaces`. It names what's missing. `npm run test:surfaces:bootstrap` writes skeleton entries with `TODO` markers, which fail the strict check until filled in.
3. Fill in the entry:
   - **Page:**
     - Set `allowedRoles` from the page's real gates: `requireChurchSession`, inline `roleId` checks, and every `layout.tsx` above it. Never guess.
     - Set `public: true` for signed-out pages and `controlPlane: true` for `/control` pages.
     - Set `dynamicParams` to seeded ids, or a `$sql:` query if the seed ids are random.
     - Set `sweepMode` to `redirect` for pages that only redirect, or `invalid-token` for token links.
     - Add a `note` for anything unusual.
   - **API route:** `methods`, `auth` (`cron` / `webhook` / `hmac` / `session` / `public` / `control`), and a contract spec under `tests/e2e/api-*.spec.ts`.
   - **Server action module:** list its `exports` and point `tests` at a unit test that actually exercises the module. A mock of the module elsewhere doesn't count.
4. Pages are swept automatically once the entry exists. Add a journey spec when the feature is a multi-step workflow.
5. Run `npm run test:e2e:local` and make sure it passes before opening the PR.

### Manifest fields

```jsonc
{
  "pages": {
    "/app/church-admin/events/[id]": {
      "path": "/app/church-admin/events/[id]",
      "file": "app/app/church-admin/events/[id]/page.tsx",
      "allowedRoles": ["church-admin", "pastor"],   // super-admin | church-admin | secretary | pastor | ministry-leader | member
      "public": false,
      "controlPlane": false,
      "dynamicParams": { "id": "77777777-0000-0000-0000-000000000001" },  // or "$sql:select id from ..."
      "envGated": null,                              // "stripe" | "ai" | "vapid" | null
      "sweepMode": "render",                         // render | redirect | invalid-token
      "deniedRedirectsTo": null,                     // set when denied roles land somewhere other than their homePath
      "tests": ["tests/e2e/page-role-sweep.spec.ts"]
    }
  },
  "routes":  { "/api/unsubscribe": { "path": "...", "file": "...", "methods": ["GET"], "auth": "hmac", "tests": ["tests/e2e/api-unsubscribe.spec.ts"] } },
  "actions": { "app/app/communications-actions.ts": { "module": "...", "exports": ["..."], "tests": ["app/app/communications-actions.test.ts"] } }
}
```

## CI

`.github/workflows/ci.yml`:

- **`verify`:** `test:surfaces`, lint, typecheck, build, unit tests, RLS audit.
- **`e2e`** (needs `verify`, 4 shards): `setup-e2e.sh --reset`, build, the server-reference check, then `playwright test --shard=N/4`. On failure it uploads the HTML report and traces.

**Manual step for a repo admin:** make the checks required. In GitHub, go to Settings → Branches → `main` → Require status checks, and add `verify` plus the four `e2e (shard N/4)` checks. This can't be set from the workflow file.

## Known gaps

- The seed has a single tenant, so the sweep can't assert cross-tenant isolation in the browser. RLS isolation is covered by `npm run audit:rls` and the real-Postgres tests.
- Several record types have no seed rows (budgets, journals, groups, documents, onboarding instances and templates, service plans, templates, discernment sessions). Their detail pages are only checked with a nonexistent id. Seeding them would let the sweep render real records.
- Workflow journeys for newer features (communications scheduling, retry and dead-letter queue, song library, role taxonomy) are Story B.
