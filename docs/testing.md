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

## Fixture layout

Third-party file fixtures live in `tests/fixtures/imports/{planning-center,breeze}/` (G4.1): synthetic CSVs only, never a real export, each labelled VERIFIED template, PARTIAL (third-party corroborated) or UNVERIFIED in `tests/fixtures/imports/README.md`, because neither vendor publishes its export header row. They are read by `lib/import-vendor-fixtures.test.ts` (unit) and `tests/e2e/import-vendor-fixtures.spec.ts` (journey). Add a fixture there, with its label, whenever an importer learns a new vendor format; do not hand-write a fixture from the adapter's own assumptions. This is separate from `tests/e2e/fixtures/`, which holds the e2e harness (env guard, auth setup).

The same journey also checks reconciliation (G4.2): after each fixture is committed, `/app/church-admin/imports/<batch>` must show zero mismatches with counts that match the fixture. Negative cases force a failed row (a staged row that points at another church's profile) and edit a gift after import: the first must show as a mismatch, the second only under "Changed since import". The report page and its CSV route are manifest surfaces (church admin only); the database tests for the outcome columns, the bulk function and the immutability trigger are in `tests/database/import-staging-rls.test.ts` ([ADR 0029](adr/0029-import-row-outcomes-column-grant-invoker-function-trigger.md)).

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
2. Exports the same dummy secrets CI uses, with every provider API key empty so SendGrid, Twilio, Resend, Stripe, Anthropic, and OpenRouter stay in stub mode.
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

- **`tests/e2e/fixtures/auth.setup.ts`:** signs in once per identity and saves the session: `super-admin` (control plane), `church-admin`, `secretary`, `pastor`, `ministry-leader`, `member`. `super-admin` is `sarah@churchcoreops.app`, a control-plane platform admin. **`church-admin` is `nora@graceharbor.church` (S1/Council Review 28)** — a church admin with no `platform_admins` row, so church-admin checks see exactly what a real church admin sees. Before S1, sarah played both identities, so every church-admin check passed through the platform-admin RLS bypass.
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
- **Journeys:** `church-admin-readiness`, `member-mobile-foundation` (390×844 viewport), `onboarding-flow` (uses Mailpit on 4205), `service-plan-build` (G1.11/Council Review 25: builds a service plan from scratch through the UI — creates the plan, adds a song not yet in the library and again from the library, adds a position, assigns a volunteer by hand and by auto-fill — checking the database at each step, including that the plan's shifts share the plan's own staff-only auto-created event and that Remove on a just-assigned volunteer really deletes the shift), `service-plan-rotation` (the rotation planner: suggestions, auto-fill review and apply, monthly limits; since G1.4/Council Review 20 it also covers confirming a shift by its public token link and blocking a date from the volunteer-link schedule page, using real generated tokens; since G1.5/Council Review 23 it also covers assigning a volunteer, the messaged link, and declining, checking `confirmation_status = 'declined'` in the DB rather than just UI text), `member-self-service` (S7/Council Review 21: as a real signed-in member, `/app/member/schedule` shows and confirms the member's own shift, and the member saves an unavailable date — both pinned end to end against `session.churchProfileId`, not just a rendered page), and `member-writes` (S8/Council Review 22: giving, group join, RSVP and full-event registration as a real signed-in member, proving the business-rule writes that RLS alone doesn't grant actually succeed). DB tests for blockout dates (RLS scoping, cross-church planting) are in `tests/database/volunteer-blocked-dates-rls.test.ts`; the member-JWT harness proving direct writes to `donations`/`attendance`/`group_members`/`event_registrations` stay denied even though the server-side admin-client path succeeds is in `tests/database/member-writes-rls.test.ts` (S9/Council Review 26 adds a DB test there pinning `profiles.user_id`'s uniqueness — a login can't have a second profile, so a self policy that picks a profile with `where user_id = auth.uid() limit 1` can't land on another church's row); the DB test proving a member can read a shift's other columns but not its `confirmation_token` (G1.5/Council Review 23) is in `tests/database/volunteer-shift-token.test.ts`; the DB tests proving `merge_duplicate_profile` takes its actor from `auth.uid()` — an admin can merge, a member can't even passing an admin's login or profile id, and `anon` can't execute the function at all (S9/Council Review 26, ADR 0024) — are in `tests/database/profile-merge-auth.test.ts`, which also now covers `erase_profile_pii` the same way (S5/Council Review 27: an admin erases, a member naming an admin can't, `anon` has no execute privilege); the DB tests proving a member can't change their own `role`, `church_id`, `user_id`, `membership_status`, data-rights approval columns, `is_pastoral`, `safety_clearance_date` or `family_id` — but can still edit their own contact details — and that `current_user_role()` reads `church_memberships` rather than `profiles.role` (S5/Council Review 27) are in `tests/database/profiles-self-edit-lock.test.ts`; the DB tests proving `communication_logs`, `communication_delivery_events` and `communication_suppressions` select/insert follow `can_manage_communications` (church admin, pastor, secretary can read and write; ministry leader and member cannot) (S1/Council Review 28) are in `tests/database/communication-logs-access.test.ts`.
- **`tests/database/column-references.test.ts` (S4, Council Review 31):** checks every `.update()`/`.insert()`/`.upsert()` and `.select()` call in `app/` and `lib/` whose table and columns are string literals (~204 writes, ~397 selects as of S4) against the real schema read from `information_schema.columns`. It skips writes built from a variable payload (`.update(patch)`), `.rpc()` calls and raw SQL — those aren't checked by this test (tracked as the S14 "sweep for ignored Supabase write errors" row, `DEVELOPMENT_PLAN.md` §0.3). This is how S4 found two real bugs that every unit test (which mocks the Supabase client) missed: a write to `event_registrations.updated_at`, a column that doesn't exist, and a write of emergency-contact fields to `profiles`, which has no such columns.

### Phone-first layout checks (G2.1)

`tests/e2e/fixtures/mobile-layout.ts` holds the shared phone-layout helpers; `member-phone-first.spec.ts` applies them to member home, schedule, giving and family at 390x844 (and 360px for overflow). The rules a member page must keep:

- **No horizontal scroll:** `scrollWidth <= innerWidth + 1`.
- **Touch targets:** every link, button, input, select, textarea, tab, switch and checkbox inside `<main>` is at least 44x44 CSS px (`collectTouchViolations(page, root?)`). Pass a root locator such as `page.getByRole("dialog")` to check a modal or drawer, which renders in a portal outside `<main>`; the spec opens the family edit, profile edit and (where seeded) recurring-gift dialogs and runs the collector inside each. Inline text links inside a sentence are exempt; a visually hidden checkbox or switch input is measured by its label. Wrap member content in `className="touch-44"` (and give any Drawer or Modal the class, since it renders in a portal); never use it on staff pages.
- **One column:** no two top-level cards share vertical space side by side (`findSideBySideCards`). The home quick actions are buttons, not cards.
- **Primary action in the first screen:** the first `[data-primary-action]` sits between the header's bottom edge and the bottom nav's top edge without scrolling.
- **Bottom nav:** five items, each at least 44px tall, and `aria-current="page"` on the current one.

The spec inserts a pending shift for the member (60 days out, marked, deleted afterwards; the Confirm locator is scoped to that shift) because the seed has none. The direct-database helpers in `tests/e2e/fixtures/env.ts` refuse a non-loopback host unless `CI=true`. To check the helper can fail, switch `.touch-44` off (or remove the class from a dialog) and confirm it flags the 30 and 36 px controls.

### Kiosk tablet checks (G2.2)

`tests/e2e/ccm-kiosk.spec.ts` runs the family self check-in journey at 1024x768 and 768x1024 (plus one Spanish run), against the seeded Rivera Household (code `HK7M2QX9`, phone `(555) 019-9`; Ana is listed, Mateo needs a greeter, Leo and Zoe are not listed).

- **Targets:** `collectTouchViolations` (44px) and `collectPrimaryViolations` (64px, `[data-primary-action]`) in `mobile-layout.ts`, plus `expectNoHorizontalOverflow`. Modals render in portals, so scope them with `page.getByRole("dialog", { name })`.
- **Serial, self-cleaning:** the whole file is one serial group (both viewports check in the same child). Each test starts its own kiosk session, which is its own rate-limit "device". `afterEach` deletes kiosk check-ins (`checkin_source = 'kiosk'`), `ccm_kiosk_sessions` and `ccm_kiosk_lookup_attempts` for the seeded church, so reruns pass.
- **Idle:** driven with `page.clock` (`install()` then `fastForward()`), because the e2e server is a production build and `KIOSK_IDLE_MS_OVERRIDE` is honoured only when `NODE_ENV !== 'production'`.
- **Exit:** uses the seeded church admin's password (`CHURCHCORE_OPS_DEV_PASSWORD`) through the real sign-in check.
- **Stuck device:** a forged `cc_kiosk` cookie with no session row shows the locked screen; "Release this device" clears it. The refusal while a valid kiosk exists is unit-tested (`app/kiosk/children/actions.test.ts`).
- **QR:** a single-frame `.y4m` of the code, generated in the test from the `qrcode` module matrix, is fed to Chromium with `--use-file-for-fake-video-capture`, in a browser launched inside the test. The camera-denied path runs in the default browser (no camera). Real iPad camera behaviour is not covered.
- `/kiosk/children` is in the manifest as `public: true` (the sweep loads it signed out and expects the locked screen); its real gate is the kiosk session row.
- `lib/kiosk-scanner.test.ts` fails if `public/vendor/zxing_reader.wasm` differs from the installed `zxing-wasm` copy, and decodes a generated QR with it.

### A local Supabase image fault: an `anon`-denied function call crashes Postgres instead of denying it

In the local Supabase Docker image, calling a `SECURITY DEFINER` function through the PostgREST/`pg` connection as a role that has no `EXECUTE` grant on it (for example `anon`, after a fix like S5/Council Review 27's `erase_profile_pii` revokes `anon`'s grant) crashes the local Postgres backend into recovery mode instead of returning the expected "permission denied for function" error. This is a fault in the local image, not in ChurchCore's code or migrations — the hosted Supabase service is not affected. **DB tests that need to prove a role can't execute a function check the grant through the catalog instead of calling the function as that role:**

```sql
select has_function_privilege('anon', 'public.erase_profile_pii(uuid, uuid)', 'execute') as can;
```

See `tests/database/profile-merge-auth.test.ts` and `tests/database/volunteer-pool-functions.test.ts` for examples. If a new DB test needs to assert `anon` (or any role) can't run a `SECURITY DEFINER` function, use `has_function_privilege()`, not a live call that's expected to fail with a permission error.
- **`npm run check:server-reference-manifest`:** after `next build`, fails if `queueCommunicationAction`, `logAuditEvent`, or `pruneAuditLogsAction` is exposed as a callable server action (ADR 0022).

### Session fixtures: use a login id distinct from the church profile id

A session carries two ids that must never be equal in a test fixture: `session.profile.id`/`session.userId` (the auth/login user id) and `session.churchProfileId` (the person's `public.profiles.id` in the church in context, `FK`-referenced by most write columns). Council Review 21 (2026-09-28) found that 115 mechanically updated fixtures set these equal, so the whole unit-test suite passed whichever id a piece of code actually used — it proved nothing about which id a switched code path read. Give a test fixture's login id and church profile id **different, realistic values**; a test that writes to a `profiles`-referencing column and then asserts on that id would otherwise pass even if the code used the wrong one. See `arch_session_profile_ids` in the project's memory for which id feeds which column.

## Adding a new page, API route, or server action

1. Build the surface.
2. Run `npm run test:surfaces`. It names what's missing. `npm run test:surfaces:bootstrap` writes skeleton entries with `TODO` markers, which fail the strict check until filled in.
3. Fill in the entry:
   - **Page:**
     - Set `allowedRoles` from the page's real gates: `requireChurchSession`, inline `roleId` checks, and every `layout.tsx` above it. Never guess.
     - Set `public: true` for signed-out pages and `controlPlane: true` for `/control` pages. Set `platformAdminOnly: true` for a page no church role renders at all, gated only by `is_platform_admin()` outside `lib/auth.ts` (e.g. `/hq`) — this, not a church role, is what justifies an empty `allowedRoles`.
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
      "platformAdminOnly": false,                    // true only for a page no church role renders, e.g. /hq (S5/S1)
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
- **59 server-action exports are waived in `untestedExports`** (62 when Council Review 18 set the list, P2; three retired since), not tested. `test:surfaces` makes this list explicit instead of hiding it; close it starting with child safety and pastoral, since those carry the highest risk:
  - `app/app/actions.ts` (19), `app/app/elders-actions.ts` (8, pastoral/elder council), `app/app/ccm-actions.ts` (6, child safety), `app/app/church-admin-actions.ts` (6), `app/app/groups-actions.ts` (6), `app/app/finance-actions.ts` (4), `app/calendar/actions.ts` (3), `app/app/church-admin/operations/actions.ts` (2), `app/app/volunteer-actions.ts` (2), `app/control/actions.ts` (2), `app/app/communications-actions.ts` (1), `app/portal/actions.ts` (1), `app/portal/children/actions.ts` (1, child safety), `lib/compliance/data-rights-actions.ts` (1, GDPR export).
  - Each export's specific reason is in the manifest entry's `untestedExports` value, not repeated here — read `tests/coverage-manifest.json` for the current, authoritative list; it can only shrink.
- **An intermittent React #418 hydration error on `/app/member`** (member role only, found by the sweep, Council Review 18). Narrowly tolerated and annotated in the spec (`a741b76`) rather than retried away; not yet root-caused.
