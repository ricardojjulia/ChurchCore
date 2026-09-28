---
name: churchcore-test-council
description: Runs the ChurchCore Testing Council (v6, the Omni-Council protocol) — multi-persona behavior testing of the running app against local Supabase, with 20 mapped personas, on-the-fly personas, a SharedCouncilMemory ledger, spatial/functional/stress/RLS lenses, remediation proposals and the Master Governance Audit report. Required at milestones M3 and M5.
---

# ChurchCore Testing Council (v6)

Follow `docs/prompts/ai-council-of-testers-v6.md`. It is the source of truth, and its Part 0 ground rules override everything else. The run steps match the Claude entrypoint, `.claude/skills/test-council/SKILL.md`:

1. **Set up.** Read `AGENTS.md` and `DEVELOPMENT_PLAN.md` §0, then the protocol. Bring up the local e2e environment (`scripts/e2e-local.sh`). The local-only guard must pass, and **`.env.local` is never read.**
2. **Scope the run.** Re-count the surfaces in `tests/coverage-manifest.json`, choose `MAXIMALIST_EXHAUSTIVE` or `TARGETED`, create `test-results/testing-council/<run-id>/` with `ledger.jsonl`, and create the second-church fixture.
3. **Run.** Cover all four lenses and all core pathways across every surface in scope. Write only under the run folder. Record local-DB fixture rows in the ledger. **A cross-tenant leak halts the run as Critical.**
4. **Synthesize.** Check every claim against its evidence, then write `docs/reviews/YYYY-MM-DD-testing-council-<n>.md` in the Part 4 structure. Add a `DEVELOPMENT_PLAN.md` §0.3 row, or a §0.5 entry, for every defect. Tear down the fixtures.
5. **Remediate.** Ask the human before building any patch. Patches go through `churchcore-feature-factory`, the council, and a PR. Never auto-merge.

Required at milestones M3 (2026-10-16) and M5 (2026-10-30, part of R1).
