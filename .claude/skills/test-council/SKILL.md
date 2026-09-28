---
name: test-council
description: Runs the ChurchCore Testing Council (v6, the Omni-Council protocol) — multi-persona behavior testing of the running app against local Supabase, with 20 mapped personas, on-the-fly personas, a SharedCouncilMemory ledger, spatial/functional/stress/RLS lenses, remediation proposals and the Master Governance Audit report. Use when asked to run the testing council, EXECUTE_OMNI_COUNCIL, or a behavior/E2E audit; required at milestones M3 and M5.
---

# ChurchCore Testing Council (v6)

The protocol is `docs/prompts/ai-council-of-testers-v6.md`. Read it in full before starting. It is the source of truth, and Part 0's ground rules override everything else.

This is the **behavior** council: it runs the app. The **code** council (the `council` skill) reads diffs. They complement each other.

## Before you start

1. Read `AGENTS.md` and `DEVELOPMENT_PLAN.md` §0 (the tracker, so findings map to rows). Then read the protocol.
2. **Environment.**
   - Bring up the local e2e environment the way `scripts/e2e-local.sh` does: both local Supabase stacks, dummy secrets, blank provider keys, a production build.
   - Confirm the local-only guard passes (`tests/e2e/fixtures/env.ts`).
   - **Never read or use `.env.local`.**
3. Re-count the surfaces in `tests/coverage-manifest.json`, and decide the mode:
   - `MAXIMALIST_EXHAUSTIVE`: every surface.
   - `TARGETED`: the manifest keys a PR touches.
4. Create the run folder `test-results/testing-council/<run-id>/` and start `ledger.jsonl`.
5. Create the second-church fixture for cross-tenant probes (protocol 1.1). Record its ids in the ledger so teardown removes exactly those rows.

## Running it

- **Split the work across parallel agents by lens and pathway.** Use `general-purpose` agents, because they need Bash and Playwright. A sensible split:
  1. security and RLS (all surfaces, all perimeter probes, DB-level role probes);
  2. functional pathways and hand-offs (protocol Part 2);
  3. spatial and visual at 375, 768 and 1440px, plus accessibility;
  4. boundary, load and concurrency;
  5. a sweep of the surface inventory: every manifest entry through the Part 3 cycle, feeding the other four.
- **Give each agent** the protocol path, its lens, the surfaces it covers, the persona identities it may use, and the run folder.
- **Agents may write only under `test-results/testing-council/<run-id>/`**, plus throwaway Playwright specs under `test-results/testing-council/<run-id>/specs/`. They never edit app code, tests in `tests/`, migrations, or docs. They may write rows to the *local* DB for fixtures, and must record each one in the ledger.
- **Any cross-tenant leak halts the run.** Record it as Critical with its evidence, and stop further probing on that surface.
- **Flaky results:** re-run once. A result that differs is reported as flaky, with both outcomes. Never report it as a pass.

## Synthesis

1. **Check the agents' claims against their evidence** before accepting them (the `feedback_council_synthesis_scrutiny` memory).
   - A defect without a trace, screenshot, query or ledger entry is re-checked or dropped.
   - A "pass" on a feature ChurchCore doesn't have goes under **Not Present**.
2. Write the report to `docs/reviews/YYYY-MM-DD-testing-council-<n>.md`, in exactly the Part 4 structure, including sections 5–7.
3. **Track every defect:** add a row to `DEVELOPMENT_PLAN.md` §0.3 (a `B-n` row, or the next ID in its gap or track), or a §0.5 entry with a reason.
4. Tear down the fixtures recorded in the ledger. Confirm the local DB is back to its seeded state for those rows.
5. **Ask the human** to approve the report and which remediation patches to build. Patches go through `feature-factory` / `build-with-tests`, the code Council, and a PR. **Never auto-merge**, and never weaken an existing test.

## When it's required

- A full run at milestone **M3** (2026-10-16), and a full run at **M5** (2026-10-30) as part of **R1**.
- A targeted run on a PR is optional, and recommended for security-sensitive changes.
