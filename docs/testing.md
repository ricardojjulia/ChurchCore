# Testing

ChurchCore ships four layers of tests. CI runs all of them on every PR. They block merge once a repo admin marks them as required status checks (see [CI](#ci)).

| Layer | Command | What it covers |
|---|---|---|
| Unit | `npm run test` | Vitest: actions, data loaders, components, scripts |
| Surface coverage | `npm run test:surfaces` | Every page, API route, and server action is registered in `tests/coverage-manifest.json` with real tests behind it |
| Database | `npm run test:db` | Vitest against real local Postgres (`tests/database/`): SQL functions, constraints, migration logic. Each test runs in a rolled-back transaction |
| End to end | `npm run test:e2e:local` | Playwright against a production build and local Supabase: every page × every role, every API route, and the key journeys |

CI runs `npm run test:db` in the `verify` job, after migrating a fresh local Supabase (added with Service Planning Story 3; before that it was a manual release gate). A change that adds a SQL function, trigger or non-trivial constraint ships a `tests/database/` test for it. Migration checks (`npm run lint:migrations`) stay a manual release gate; see `RELEASE_CHECKLIST.md`.

## The rule: every change ships its test surfaces

Any PR that adds or changes a **page**, **API route**, or **server action** must:

1. Add or update its entry in `tests/coverage-manifest.json`.
2. Ship the tests that entry points to. For a server action, every exported function must be named in a test file that imports or mocks its module. An export that can't be tested yet goes in the module's `untestedExports`, with a reason.
3. Pass `npm run test:surfaces` and the CI `e2e` job.

`npm run test:surfaces` enforces this. It fails when:
- a page, route, or action module has no entry;
- an entry points at a missing file or test;
- a module's exports differ from its entry (so adding an action to an existing module fails until the manifest catches up);
- an action's test doesn't import or mock the module;
- an export is neither tested nor waived;
- a waiver is stale because the export is now tested or gone. The waiver list can only shrink.

This is in `AGENTS.md`, in all three factory skill sets (`.claude`, `.codex`, `.gemini`), and in the PR template. The Council Documenter withholds sign-off until it holds.

## Running everything locally

Prerequisites:
- Docker, with enough memory for two Supabase stacks;
- `npm ci`, then `npm run test:e2e:install` (Chromium) once;
- `psql` (on macOS: `brew install libpq`), `python3`, `openssl` and `curl`;
- free ports 4200–4205 (app, tenant stack, Mailpit) and 4211–4213 (control-plane stack).

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
   - encrypts the seeded pastoral fields. Locally it uses a test-only key kept in the gitignored `.e2e-pastoral-key.local`, which is created on first run and survives `npm ci`.
2. Exports the same dummy secrets CI uses, with every provider API key empty so SendGrid, Twilio, Resend, Stripe, and Anthropic stay in stub mode.
3. Builds the app and runs Playwright against `next start` on port 4200.

To start from clean seed data, run `npm run setup:e2e -- --reset`, then `npm run test:e2e:local`.

### Safety: the suite only ever touches local Supabase

Your `.env.local` may point at hosted projects. The suite cannot reach them, for three reasons:

- `setup-e2e.sh` refuses to continue if either stack reports a non-local URL.
- The runner exports local values, which override `.env.local`: real process env wins over `.env` files in Next.js.
- `tests/e2e/fixtures/env.ts` aborts the whole run if any Supabase URL or DB URL is not `127.0.0.1`/`localhost`. The escape hatch is `E2E_ALLOW_REMOTE_SUPABASE=1`; don't use it against production.

`supabase/scripts/create-dev-users.sh` also lets explicitly exported values win over `.env.local`, so it can't be redirected at a hosted project by accident.

### Local notes

- Local runs use 3 workers and 1 retry. Every page load calls the auth `/user` endpoint on both local stacks. On a busy Docker host (several Supabase stacks running), the auth containers intermittently fail to open Postgres connections, and the session reads as signed out. A test that passes on retry is reported as **flaky** in the summary, not hidden. In CI, `failOnFlakyTests` makes any flaky test fail the run.
- The control-plane stack is addressed as `localhost` and the tenant stack as `127.0.0.1`, so they get different auth cookie names, as two hosted projects would. With one shared name, the app sent every tenant session to both auth servers, and a control-plane login looked like a tenant login.
- The suite never attaches to a server it didn't start: an already-running `next dev` reads `.env.local`, which may point at a hosted project. Stop your dev server first, or run `npm run test:e2e` (which starts `next dev` itself with the guarded env) for quick iteration on one spec.
- If a run fails with "storageState looks stale", the saved sessions were invalidated (for example by a re-seed). The `setup` project re-creates them on the next run.

## What the e2e suite checks

- **`tests/e2e/fixtures/auth.setup.ts`:** signs in once per identity and saves the session: `super-admin` (control plane), `church-admin`, `secretary`, `pastor`, `ministry-leader`, `member`.
- **`tests/e2e/page-role-sweep.spec.ts`:** visits every manifest page as each identity and signed out.
  - Allowed identities on redirect-only pages land exactly on `redirectsTo`: a path, or `$homePath`, with per-identity overrides in `redirectsToByRole`.
  - Allowed identities: the page renders on its own URL with no 5xx, no error screen ("Something went wrong" / "Application error"), no not-found UI, and no console errors outside `tests/e2e/fixtures/console-allowlist.ts`.
  - Denied identities: land exactly on their own home path (tenant roles on `/control` land on `/sign-in` to switch accounts; a page's `deniedRedirectsTo` overrides), never shown a 5xx.
  - Signed-out visitors: land on `/sign-in` unless the page is public.
  - Dynamic pages use real seeded ids. A `$sql:` value resolves an id at run time for seed rows with random ids; a query that returns nothing fails the run.
  - Pages whose record type has no seed rows are visited with a nonexistent id. The allowed role must stay on the page (seeing its not-found state), or land on `missingRecordRedirectsTo`, and must not crash.
  - Invalid-token pages must show their graceful `expectText`.
  - Pages that deny inline (`INLINE_DENIAL` in the spec) must show the denial and not the page's own heading.
  - Known app bugs are listed in `KNOWN_BUGS` with their **exact current symptom** (landing page or text). A blanket `test.fail()` would stay green on any failure; a pinned symptom fails as soon as the bug changes, so the entry gets removed when it's fixed.
  - `/app/[role]` is also checked cross-role: each church identity visiting another role's workspace is sent home.
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
   - **Server action module:** list its `exports` and point `tests` at unit tests that import (or `vi.mock`) the module and name each export. A mock of the module inside some other module's test doesn't count. Waive an export in `untestedExports` only with a reason.
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
      "sweepMode": "render",                         // render | redirect | invalid-token
      "redirectsTo": null,                           // redirect pages: target path or "$homePath"
      "redirectsToByRole": null,                     // per-identity override, e.g. { "super-admin": "/control" }
      "deniedRedirectsTo": null,                     // where denied roles land when it isn't their homePath
      "missingRecordRedirectsTo": null,              // where a nonexistent record redirects, if not a not-found page
      "expectText": null,                            // invalid-token pages: the graceful text they must show
      "note": "…",
      "tests": ["tests/e2e/page-role-sweep.spec.ts"]
    }
  },
  "routes":  { "/api/unsubscribe": { "path": "...", "file": "...", "methods": ["GET"], "auth": "hmac", "tests": ["tests/e2e/api-unsubscribe.spec.ts"] } },
  "actions": {
    "app/app/communications-actions.ts": {
      "module": "app/app/communications-actions.ts",
      "exports": ["..."],                                        // must match the module's exports exactly
      "tests": ["app/app/communications-actions.test.ts"],       // each must import or vi.mock the module
      "untestedExports": { "someAction": "Why it isn't tested yet" }  // optional; the list can only shrink
    }
  }
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
- **62 server-action exports are waived in `untestedExports`** (Council Review 18, P2), not tested. `test:surfaces` makes this list explicit instead of hiding it; close it starting with child safety and pastoral, since those carry the highest risk:
  - `app/app/actions.ts` (19), `app/app/elders-actions.ts` (8, pastoral/elder council), `app/app/ccm-actions.ts` (6, child safety), `app/app/church-admin-actions.ts` (6), `app/app/groups-actions.ts` (6), `app/app/finance-actions.ts` (4), `app/calendar/actions.ts` (3), `app/app/church-admin/operations/actions.ts` (2), `app/app/volunteer-actions.ts` (2), `app/control/actions.ts` (2), `app/app/communications-actions.ts` (1), `app/portal/actions.ts` (1), `app/portal/children/actions.ts` (1, child safety), `lib/compliance/data-rights-actions.ts` (1, GDPR export).
  - Each export's specific reason is in the manifest entry's `untestedExports` value, not repeated here — read `tests/coverage-manifest.json` for the current, authoritative list; it can only shrink.
- **An intermittent React #418 hydration error on `/app/member`** (member role only, found by the sweep, Council Review 18). Narrowly tolerated and annotated in the spec (`a741b76`) rather than retried away; not yet root-caused.
