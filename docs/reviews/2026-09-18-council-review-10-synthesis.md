# Council Review Synthesis — Council Review 10

**Date:** 2026-09-18
**Review ID:** Council Review 10
**Status:** No blocking findings — branch clear to proceed to Documenter close-out and PR
**Branch under review:** `feat/generic-tenant-provisioning-and-rls-ci-gate`

---

## 1. Scope Note (read this before the findings)

This round was triggered by a small, scoped branch: a generic client-account provisioning tool (`scripts/provision-tenant.mjs` + `scripts/lib/tenant-provisioning-core.mjs`) and a fix making the CI `audit:rls` step actually run against a live database and block the build instead of silently no-op'ing (`.github/workflows/ci.yml`). That branch is fresh (one commit, no accumulated history) and, on its own size, would qualify for a lighter diff-scoped review under `improve-software.md` §0's exception for small/isolated changes.

The user explicitly chose to run the **full whole-app Council audit** (Phase 1 prompts verbatim, as used in Council Reviews 1–9) rather than a diff-scoped review, treating this as a periodic full-MVP checkpoint. That is what the four agent reports below cover — **none of the four Phase 1 prompts asked about, or examined, this branch's actual changes** (provisioning tooling and CI gates are out of scope for database/API, route/page, UX, and feature-competitive audits). This section exists so a future reader doesn't mistake "no findings against the branch" for "the branch was audited and passed" — it wasn't audited by this round; it was the trigger for running one.

The branch's own verification (done prior to this council round, in-session): `node --check` on both new scripts, `eslint` clean, `npm run audit:rls` passing locally, and manual tests of the tool's validation/guard logic (missing env vars, non-kebab-case slug, duplicate-slug refusal). No automated test suite changes were needed since these are operational scripts, not application code with existing test coverage patterns to extend.

## 2. Cross-Agent Consensus

- **No critical or merge-blocking findings this round** — unlike Review 9 (which found two: tenant-erasure audit gaps and a client-side-only RBAC gate), all four agents surfaced refinement/backlog-level gaps, not data-safety or auth-boundary failures.
- **Agents 1 and 4 independently agree** on the same top blockers to broader rollout: recurring donations/giving, service-planning depth, and import/migration tooling maturity. This is the third consecutive round (9, and now 10) converging on the same three items — they are the load-bearing gap, not noise.
- **Agent 3's UX findings partially repeat Review 9 findings verbatim** (missing `aria-current` on `MemberBottomNav`, no loading skeletons) — these were flagged as deferred-not-blocking in Review 9 and remain unaddressed one round later. Still not merge-blocking, but two consecutive rounds flagging the same accessibility gap without action is itself worth naming.
- **One factual correction required to Agent 1's own report:** its narrative summary (§6) states "~8 tables still pending RLS enable (legacy edge cases)," which contradicts both its own §1 ("No RLS Gaps Detected") and two independent live runs of `npm run audit:rls` during this session (before and during this council round), both of which passed clean across all 100 `church_id`-bearing tables with zero disabled/policy-less tables. Treated as a synthesis error in the agent's own summary, not a real gap — logged as a corroborating result for the CI-gate fix on this branch (see §3).
- **One factual correction required to Agent 3's report:** its "no `error.tsx`" finding is stale. `app/global-error.tsx` was added in PR #139 (2026-09-18, per `CHANGELOG.md`), before this council round ran, and was verified present on disk during synthesis. The agent's prompt asked for `error.tsx` specifically and missed the differently-named Next.js root boundary file. The adjacent `loading.tsx`/skeleton-loader gap in the same report is real and unaddressed.

## 3. Relevance to This Branch

This branch's premise was: "the RLS audit CI step has been silently passing without ever running against a live database." Agent 1's independently-run, in-session `audit:rls` pass (100/100 tables, zero gaps) is exactly the check this branch makes into a real, blocking CI gate — it's now verified working data, not just a claim. No findings from this round require changes to this branch.

## 4. ADRs

None drafted this round. No new architectural boundary, role-access pattern, integration contract, or data-exposure rule was introduced — the branch under review automates an existing manual process (tenant provisioning) and hardens an existing check (RLS audit) without changing any access-control or data model. The audit findings below are feature/UX backlog items, not architectural decisions.

## 5. Deferred Findings (tracked, not blocking)

| Finding | Source | Where tracked |
|---|---|---|
| Recurring donations, service-planning depth, import/migration tooling maturity, mobile UX, provider breadth | Agents 1 & 4 | `competitive_roadmap_priorities.md` memory; unchanged from Review 9 — third round confirming same priorities |
| `audit_log` has no `church_id`/`actor_role` column (verified on direct schema inspection) | Agent 1 | New this round — not previously tracked; candidate for a small follow-up migration |
| No dead-letter queue for failed webhook retries (SendGrid/Twilio/Resend/Stripe) | Agent 1 | New this round |
| No unit tests for `lib/finance-import.ts` parsers (CSV/Excel/QB/OFX/IIF) | Agent 1 | New this round |
| `aria-current="page"` still missing on `MemberBottomNav`; no loading skeletons anywhere in `/app` | Agent 3 | Repeat of Review 9 finding — unaddressed across two rounds, see `docs/reviews/2026-09-18-council-review-10-agent-3-ux-shell.md` |
| `/app/member/giving` not linked from `MemberBottomNav` (assessed as likely intentional, not confirmed) | Agent 2 | `docs/reviews/2026-09-18-council-review-10-agent-2-route-page.md` |
| Per-route `loading.tsx`/`error.tsx` boundaries beyond the root `global-error.tsx` — open question, not confirmed as a gap | Agent 3 (corrected) | same |

None of these block this merge. They are reasonable inputs to the next council round's Phase 1 prompts, and the recurring items (giving, service planning, migration tooling, mobile UX, and now the ARIA/loading-skeleton repeat) are strong candidates for the next feature-factory cycle rather than another audit round.

## 6. Outcome

No implementation work required from this round — no critical findings, no ADRs, branch changes already verified. Proceeding to Documenter close-out (`DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, memory) and then a PR for `feat/generic-tenant-provisioning-and-rls-ci-gate` against `main`, referencing this synthesis.
