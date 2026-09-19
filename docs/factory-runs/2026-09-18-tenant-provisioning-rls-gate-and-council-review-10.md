# Factory Run: Generic Tenant Provisioning, RLS CI Gate Fix, and Council Review 10

Date: 2026-09-18
Type: Ops tooling + CI hardening + full whole-app Council audit + Documenter close-out
Branch: `feat/generic-tenant-provisioning-and-rls-ci-gate`
Scope: `scripts/provision-tenant.mjs`, `scripts/lib/tenant-provisioning-core.mjs`, `.github/workflows/ci.yml`, `docs/control-plane.md`, `docs/tenant-data-segmentation.md`, `docs/reviews/2026-09-18-council-review-10-*.md` (5 files), `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, memory

---

## Intent

Two independent, already-committed pieces of work needed to be verified and closed out together: (1) a generic client-account provisioning tool replacing the practice of copying a specific client's seed script per new tenant, and (2) a fix making the CI RLS-audit step an actual blocking gate instead of a silent no-op. A third piece — a full whole-app Council Review (Review 10) — was run at the user's explicit request as a periodic full-MVP checkpoint, even though the branch itself was small enough to qualify for a lighter diff-scoped review. This run is the Documenter close-out for all three.

## Factory workflow

Claude Code, `documenter` subagent (`.claude/agents/documenter.md`), invoked directly rather than via the `council` skill (the council audit and synthesis had already run and were committed before this close-out started).

## Story and acceptance criteria

- New client (church) accounts can be provisioned with a generic, parameterized tool, not by copying an existing client's named seed script.
- The CI RLS audit step must actually run against a live, migrated database and fail the build on a real gap — not silently pass regardless of state.
- Council Review 10's audit and synthesis outputs must be committed, its findings triaged (blocking vs. deferred), and no ADR left unwritten if one was implied.
- `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, and memory must reflect the branch's actual, verified state — not aspirational status.

## Technical brief

- **Architecture impact:** none. Both shipped changes are operational/CI tooling — no new architectural boundary, data model, or access-control pattern. The provisioning tool automates a previously manual process (tenant onboarding) using existing shared logic (`scripts/lib/tenant-provisioning-core.mjs`); the CI fix closes a gap between an existing script's intended behavior and its actual, unmet preconditions in CI. Council Review 10 independently confirmed no ADR is warranted for this branch.
- **Tenant boundary / RBAC:** unaffected by the two code changes. The RLS audit fix directly strengthens enforcement of the tenant boundary by making the CI check that guards it actually run.
- **Sensitive data:** the provisioning tool handles per-role emails and generates credentials into a committed `scripts/seed-<slug>.mjs` per client (consistent with the pre-existing `scripts/seed-casa-refugio.mjs` pattern) — no new sensitive-data class introduced.
- **Documentation impact:** `docs/control-plane.md` and `docs/tenant-data-segmentation.md` were updated in the same commit as the code (d9cdfa3), not deferred to this close-out.

## Implementation summary

- `scripts/provision-tenant.mjs` (275 lines) — generic parameterized entrypoint; provisions `churches`/`profiles`/`church_memberships`/`church_settings` plus control-plane `tenants`/`tenant_connections`, then writes a per-client `scripts/seed-<slug>.mjs`. Refuses to re-run for an existing slug.
- `scripts/lib/tenant-provisioning-core.mjs` (183 lines) — shared logic so the generic tool and per-client scripts don't drift.
- `.github/workflows/ci.yml` — RLS audit step now runs `npx supabase start` + `npx supabase db reset` first (mirroring `npm run setup:local`) and `continue-on-error: true` was removed.
- `docs/reviews/2026-09-18-council-review-10-{synthesis,agent-1-database-api,agent-2-route-page,agent-3-ux-shell,agent-4-feature-competitive}.md` — full whole-app audit, committed in d3e7181.
- This run: `DEVELOPMENT_PLAN.md` "Current Status" section corrected to reflect both the shipped tooling and the Review 10 outcome; `CHANGELOG.md` `[Unreleased]` entry added for Review 10 (the provisioning-tool/CI-gate entries were already present from earlier in the session); memory updated (see below); no ADR written (none needed, confirmed independently — see Residual Risk / Findings).

## Verification

Commands run and results, this session:

- `node --check scripts/provision-tenant.mjs` — pass, no output.
- `node --check scripts/lib/tenant-provisioning-core.mjs` — pass, no output.
- `npx eslint scripts/provision-tenant.mjs scripts/lib/tenant-provisioning-core.mjs` — pass, no output (clean).
- `npm run audit:rls` — run twice during the Council Review 10 session (once ahead of the round, once during Agent 1's independent check), both against a freshly started/migrated local Supabase instance: **100/100 `church_id`-bearing tables clean, zero disabled-RLS or policy-less tables.** (Not re-run at the exact moment of this close-out — local Supabase was stopped when this Documenter pass started; re-running it would only reconfirm what two prior live runs in the same branch's session already established and is recorded in the committed synthesis, `docs/reviews/2026-09-18-council-review-10-synthesis.md` §1 and §2.)
- No test suite changes were needed or added — these are operational scripts and a CI workflow, not application code with existing test coverage patterns to extend, per the synthesis's own scope note.

## Residual risk

- **Deferred, non-blocking findings from Council Review 10** (none require changes to this branch):
  - `audit_log` is missing `church_id`/`actor_role` columns (new this round, Agent 1).
  - No dead-letter queue for failed webhook retries (SendGrid/Twilio/Resend/Stripe) (new this round, Agent 1).
  - No unit tests for `lib/finance-import.ts` parsers (CSV/Excel/QB/OFX/IIF) (new this round, Agent 1).
  - `aria-current="page"` still missing on `MemberBottomNav`; no loading skeletons anywhere in `/app` — repeat of a Review 9 finding, unaddressed one round later (Agent 3).
  - `/app/member/giving` not linked from `MemberBottomNav` — assessed as likely intentional, not confirmed (Agent 2).
- **MVP readiness unchanged:** 65/100, reconfirmed by Council Review 10's Agent 4, same as Council Review 9. Phase A (controlled single-church pilot) remains GO; Phase B–D remain NO-GO, with Phase D's binding blocker being external validation (an uncoached pilot church completing onboarding), not further engineering.
- **Unrelated, out-of-scope observation (flagged, not fixed):** at the start of this close-out, the working tree also had untracked files unrelated to this branch's task — `.claude/skills/language-translation/` and `docs/reviews/2026-09-18-spanish-translation-evaluation.md` (a scoped Spanish-localization evaluation) — plus a `.sync.ffs_db` file (looks like a FreeFileSync sync-tool artifact, not a project file). None of these were touched by this close-out; they are not part of Council Review 10 or the provisioning/CI-gate work and should be reviewed/committed or removed separately by whoever owns that thread.

## Follow-up work

- Prioritize the Phase B blockers (service planning, mobile UX, recurring giving, migration tooling, provider breadth) per `competitive_roadmap_priorities.md` memory — unchanged and now reconfirmed by two consecutive rounds.
- Consider a small follow-up migration for `audit_log.church_id`/`actor_role`.
- Consider adding parser unit tests for `lib/finance-import.ts`.
- Address the repeat ARIA/loading-skeleton UX gap before a third round flags it again.
- Open the PR for `feat/generic-tenant-provisioning-and-rls-ci-gate` against `main`, referencing `docs/reviews/2026-09-18-council-review-10-synthesis.md` and this factory-run entry, and confirming Documenter sign-off per `AGENTS.md`.

## Delivery

- Branch: `feat/generic-tenant-provisioning-and-rls-ci-gate`.
- Commits: `d9cdfa3` (provisioning tool + CI gate fix), `d3e7181` (Council Review 10 audit + synthesis), plus this Documenter close-out commit.
- Pull request: not yet opened as of this run — see draft PR description below for the next step.

---

## Draft PR description (paste when opening the PR)

**Title:** `feat(ops): generic tenant provisioning tool + make RLS audit a real CI gate`

**Body:**

### Summary

- Adds a generic client-account provisioning tool, `npm run provision:tenant` (`scripts/provision-tenant.mjs` + `scripts/lib/tenant-provisioning-core.mjs`), replacing the ad hoc practice of copying `scripts/seed-casa-refugio.mjs` per new client. On success it writes a permanent, idempotent `scripts/seed-<slug>.mjs` for that client.
- Fixes `.github/workflows/ci.yml`'s RLS audit step: it previously ran `npm run audit:rls` with `continue-on-error: true` and no database in the job, so `scripts/audit-rls.mjs` always hit its "DB unavailable" fallback and silently passed without checking anything. CI now starts and migrates a local Supabase instance first (mirroring `npm run setup:local`) and the step blocks the build.
- Runs Council Review 10, a full whole-app audit (4 agents), at the user's request as a periodic full-MVP checkpoint. No findings against this PR's actual changes, no critical findings anywhere in the app, no ADRs needed. See `docs/reviews/2026-09-18-council-review-10-synthesis.md`.

### Verification

- `node --check` on both new scripts — pass.
- `npx eslint` on both new scripts — pass, clean.
- `npm run audit:rls` — run twice against a live local Supabase instance during the Council Review 10 session, both passing 100/100 `church_id`-bearing tables clean.
- Documenter close-out complete: `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, and memory updated to reflect verified status — see `docs/factory-runs/2026-09-18-tenant-provisioning-rls-gate-and-council-review-10.md`.

### Residual risk / follow-up

- Deferred, non-blocking findings from Council Review 10: `audit_log` missing `church_id`/`actor_role` columns; no webhook dead-letter queue; no `lib/finance-import.ts` parser tests; repeat `aria-current`/loading-skeleton gap on `MemberBottomNav` (first flagged Review 9, still open).
- MVP readiness unchanged at 65/100 (Council Review 9 and 10 agree). Phase A is GO; Phase B–D remain NO-GO pending an uncoached pilot church, per `docs/plans/mvp-competitive-go-no-go-checklist.md`.

### Council reference

Council Review 10 synthesis: `docs/reviews/2026-09-18-council-review-10-synthesis.md`. Documenter sign-off: confirmed, this PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
