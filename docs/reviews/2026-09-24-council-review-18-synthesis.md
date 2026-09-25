# Council Review 18 — Synthesis

**Date:** 2026-09-24
**Branch audited:** `feat/e2e-testing-foundation` (draft PR #150, through commit `0ea9c62`)
**Base branch:** `main` (`50d919b`)
**Scope:** Diff-scoped. Story A of the E2E testing foundation: the coverage manifest and `test:surfaces`, the page×role sweep, API contract tests, the two-stack local e2e environment, the CI `e2e` job, and the "every change ships its test surfaces" rule across `AGENTS.md` and the factory skills.

## §0 Scope Note

This is a large branch: 56 files and ~6.5k lines, most of them tests and scripts. It changes CI, the release process, and the agent instructions. A full Council pass was required. Before the Council, it went through the feature-factory chain (research → story → brief → builders → implementation-validator). The validator's two important findings were fixed before this review: exact denied-landing assertions, and signed-in optional-env route tests. The first CI runs surfaced and fixed three more problems: a committed test key, per-file sharding that put every test in shard 1, and a chained-redirect expectation that made two tests flaky.

## 1. Cross-Agent Consensus

- **No agent found a disagreement between the manifest's `allowedRoles` and the code.** Agent 2 checked gate lines on all 117 pages and read ~35 in full. Agents 1 and 4 confirmed the route `auth` kinds and the action test pointers they sampled.
- **Agents 3 and 4 independently found that `test:surfaces` never validates action `exports`.** A new server action added to an existing module passes with no manifest change. Verified in `scripts/test-surfaces.mjs`: `exports` is collected (lines 211, 274) but never compared. This undercuts the process rule this branch exists to create.
- **Agents 1 and 4 independently found that module-level test pointers overstate coverage.** Agent 4 counted **49 of 199 exported actions (25%) named in no test file**, including child-safety, pastoral/elders, invite, GDPR export, finance writes, and the control-plane tenant-view boundary.
- **Agents 1 and 3 independently found safety holes in the local-only guard.** See §2.
- **Agents 2 and 4 found that the sweep checks reachability and authorization, not behavior.** No form or workflow is driven. That is Story B's job, and both agents rank comms and child safety first.

## 2. Corrections and verifications during synthesis

1. **Agent 1, H1–H3: the "local only" guarantee had three holes. Verified, and fixed immediately** (uncommitted at the time of writing; lands with P1):
   - **H1.** `env.ts` skipped a variable only when it was truthy. The runner's intentionally blank provider keys were therefore refilled from `.env.local` and passed to the server. Fixed with `key in process.env`, and proved: an exported empty value now stays empty.
   - **H2.** The local-host guard ran before `.env.local` was loaded, so `CI=1` locally would have loaded hosted URLs unchecked. Fixed by moving the check after loading, and proved: `CI=1` with the hosted `.env.local` now aborts.
   - **H3.** `reuseExistingServer` could attach the suite to a `next dev` reading the hosted `.env.local`. Fixed: the suite never reuses a server it didn't start.

   None of the three had actually touched a hosted project. The runs in this session all used the runner with explicit local env and no reused servers. But the design promised safety that the code didn't deliver.
2. **Agent 2: "`/hq` known bug's stated cause is wrong." Verified.** `supabase/seed.sql` sets Olivia's profile role to `secretary`, but the local DB has `member_volunteer`, so something after seeding rewrites it. The underlying design flaw (`/hq` reads `profiles.role` while the app reads membership roles) is real. The `KNOWN_BUGS` text must be corrected, and the drift is a follow-up to trace.
3. **Agent 2: "super-admin on tenant pages may land on `/sign-in` only locally." Verified correct during P3/P4.** Both local stacks ran on 127.0.0.1 and shared the `sb-127-auth-token` cookie name, so every tenant session was also sent to the control-plane auth server. Addressing the control plane as `localhost` gives each stack its own cookie name, as hosted projects have. With that change, super-admin on tenant pages lands on `/control`, the production behavior, and `/hq` does not admit super-admin (its layout reads the tenant session). The sweep's `/sign-in` expectation and the `/hq` entry had both encoded the local artifact, and both are corrected. The change also halved local auth traffic.
4. **Agent 2: "ministry-leader can read all `communication_logs` via RLS although the UI denies her." Verified.** `communication_logs_select_management` uses `can_manage_church`, which includes `ministry_leader`. This is the inverse of the secretary gap, and it widens follow-up F7 into a real access-control finding: over-exposure, not just under-exposure.
5. **Agent 4's MVP +1 (69/100)** is accepted. This branch adds no user capability, but it puts a real, blocking regression net over authorization and route contracts.

## 3. ADR Assessment

**No new ADR.** The branch applies existing conventions: Supabase local stacks, Playwright, CI jobs. The "every change ships its test surfaces" rule is a process mandate recorded in `AGENTS.md` and `docs/testing.md`, the same way the Council mandate is. If P2's waiver mechanism is approved, it should also be documented in `docs/testing.md`.

## 4. Implementation Prompts

### In this branch (proposed; needs human approval)

- **P1 — Safety and backfill hardening.**
  - Commit the H1–H3 fixes.
  - `backfill-pastoral-encryption.mjs`:
    - paginate with `.order("id").range()`;
    - guard updates on the original value (lost-update race);
    - abort when a value looks like ciphertext but won't decrypt with the given key (wrong-key signal);
    - print the target host and row counts;
    - default to a dry run and require `--apply`;
    - also cover `church_documents.body` for encrypted elder council notes.
  - Correct `docs/setup/production-deployment.md` §12, which claims the script doesn't exist and that plaintext is returned safely.
- **P2 — Make the rule enforceable.**
  - `test:surfaces` fails on export drift (scanned exports ≠ manifest `exports`).
  - For actions, it requires every listed export to be referenced in at least one of the entry's `tests[]` files, which must import or mock-path the module. Otherwise the export is listed under an explicit `untestedExports` with a reason.
  - That records the 49 known gaps explicitly instead of hiding them.
  - Derive `counts` at run time and drop the stored `counts` / `generated_at` (merge conflicts).
  - Fix the manifest to list `song-library-actions.test.ts` and `service-plan-role-type-actions.test.ts` under `volunteer-actions.ts`.
- **P3 — Close sweep false greens.**
  - `missingRecord` pages assert the allowed role stayed on the URL (or saw not-found UI).
  - Add `redirectsTo` for `/app`, `/calendar`, `/workspace`, and assert it.
  - Invalid-token pages assert their graceful text.
  - `KNOWN_BUGS` entries assert the specific symptom instead of a blanket `test.fail()`.
  - `INLINE_DENIAL` also asserts the page's data is absent.
  - Add a cross-role `/app/[role]` denial case.
  - Correct the `/hq` and `/app` notes and the `finance/journals/[id]` note.
  - Remove the no-op final test.
  - Set CI `failOnFlakyTests` so retries can't hide an intermittent gate bug. Both CI flakes so far were real logic bugs.
- **P4 — Developer experience and process text.**
  - Check `PASTORAL_ENCRYPTION_KEY` first in `setup-e2e.sh`, and keep the local key in a gitignored repo-root file so `npm ci` can't lose it.
  - Surface `supabase status` errors and `curl` failures.
  - Document the prerequisites (`psql`, `python3`, `openssl`, `curl`, ports, Docker memory).
  - Fix the 3-vs-4 workers mismatch.
  - Drop the unused `envGated` from the docs and document `redirectsTo`.
  - `AGENTS.md`: the checks are blocking *once a repo admin enables them as required*.
  - Documenter: open a draft PR to get the `e2e` result.
  - Add the rule to the `.claude/agents` builder and reviewer files (frontend-builder, backend-builder, test-verifier, implementation-validator, pr-reviewer).
  - Fix `improve-software.md:199`.
- **P5 — API contract gaps.**
  - `/api/reports/custom` role tests (member and secretary are rejected, pastor gets the CSV; assert whatever the handler really does).
  - `/api/control/*` as a tenant role.

### Follow-ups (separate branches), in priority order

1. **F7 (now High): `communication_logs` RLS vs page gates.** Secretary is under-exposed and ministry-leader is **over-exposed** via RLS. Align the RLS and the gates, and add a pure church-admin (non-platform-admin) fixture so the sweep stops passing through the platform-admin RLS bypass.
2. **Webhook fail-open when a provider secret is unset** (all four; Stripe also has no replay window). This is dangerous in production. It belongs with F4 (webhooks under ADR 0022) before F2.
3. **`/api/reports/custom`:** move `requireChurchSession` out of the `try`, and replace `queryTenantLocalDb` (which bypasses RLS).
4. **`/hq`:** the role source (`profiles.role` vs membership roles), the missing `church_id` on the `hq_*` tables, and the traced cause of the profile-role drift.
5. **Story B journeys** in Agent 4's order (comms, child safety, service planning, pastoral, giving/finance, people). Seed the missing record types, add a second tenant, and add an axe accessibility pass inside the sweep.
6. **Close the untested-exports list** P2 makes explicit, starting with child safety and pastoral.
7. CI build-once artifact; verify the super-admin landing on a hosted preview; demo-route 403 outside demo mode.

## 5. MVP Readiness

**69/100 (+1)** (Agent 4). The branch adds no new capability. It lowers pilot risk with a blocking net over authorization and route contracts, and it surfaced six real bugs.

## 6. Agent Reports

- [agent-1-database-api](2026-09-24-council-review-18-agent-1-database-api.md)
- [agent-2-route-page](2026-09-24-council-review-18-agent-2-route-page.md)
- [agent-3-ux-shell](2026-09-24-council-review-18-agent-3-ux-shell.md)
- [agent-4-feature-competitive](2026-09-24-council-review-18-agent-4-feature-competitive.md)

## §7 Execution & Documenter sign-off

The human approved P1–P5. All five landed:

- `19aea6a` — P1: the H1–H3 local-only-guard fixes; `backfill-pastoral-encryption.mjs` hardened (pagination, dry-run default, per-row value guard, decrypt-guard abort, elder council note coverage); local pastoral key moved to the gitignored `.e2e-pastoral-key.local`; `docs/setup/production-deployment.md` §12 corrected.
- `a5e00f0` — P2: `test:surfaces` fails on export drift and on an action export that is neither tested nor waived; 62 exports recorded under `untestedExports` with reasons; `counts`/`generated_at` derived at run time; `envGated` removed.
- `7125e3b` — P3–P5: sweep false greens closed (exact redirect landings, missing-record/invalid-token assertions, pinned `KNOWN_BUGS` symptoms, a cross-role `/app/[role]` case); CI `failOnFlakyTests`; control plane addressed as `localhost` (corrects the super-admin `/control` landing and confirms `/hq` excludes super-admin); process text updated across `AGENTS.md`, the 5 `.claude/agents` files, the Documenter draft-PR note, `improve-software.md`, `docs/testing.md`; API role tests for `/api/reports/custom` and `/api/control/*`.
- `a741b76` — the intermittent React #418 `/app/member` hydration error (member only) tolerated narrowly, annotated, and recorded as a follow-up rather than hidden by a retry.

**CI result (head `a741b76`, PR #150, draft):** all checks green — `verify`, CodeQL (actions + javascript-typescript), gitleaks, dependency-review, and `e2e` shards 1–4 (202 + 203 + 202 + 202 = **809 e2e tests, 0 flaky**, `failOnFlakyTests` on). Independently re-run locally by the Documenter: `npx vitest run` **1707/1707 passed** (144 files), `npm run test:surfaces` clean (117 pages / 15 routes / 30 actions, scanned = manifest), `npm run lint` (0 errors, 7 pre-existing unrelated warnings), `npx tsc --noEmit` clean.

**Documenter sign-off:** given. `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, and `docs/testing.md` are updated to match the state above, including the corrected `/hq` cause, the `/control` super-admin landing, the widened F7 (secretary under-exposure and ministry-leader over-exposure), and the 62-item untested-exports list now made explicit by P2. No surface was added without a manifest entry and tests — `test:surfaces` (P2) is itself the enforcement of that rule, and it passes. Residual risk carried forward, not resolved here: F7 (`communication_logs` RLS, now High), webhook fail-open when a provider secret is unset (High in production, belongs with F4 before F2), `/api/reports/custom`'s `try`-swallowed redirect and RLS-bypassing `queryTenantLocalDb`, the untraced `/hq` profile-role drift, the missing `church_id` on `hq_*` tables, the 62 waived exports, and the intermittent `/app/member` hydration error. Story B (the journeys the sweep doesn't drive) is next, after the security follow-ups above.
