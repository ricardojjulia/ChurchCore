# Council Review 11 — Synthesis

**Date:** 2026-09-20 | **Branch under review:** `feature/landing-page-sacred-clarity`
**Scope:** Diff-scoped review of the "Sacred Clarity" public landing page redesign (`app/page.tsx`, `app/page.test.tsx`, `lib/i18n.ts`), not a whole-app checkpoint (last one of those was Council Review 10). Agents ran the standard whole-app Phase 1 prompts per `improve-software.md`, but findings outside this branch's diff are noted as pre-existing/carried-forward rather than new.

**Branch hygiene note** (required by `.claude/skills/council/SKILL.md`): this is a fresh, single-commit feature branch cut cleanly from `main` — no accumulated unreviewed history to disclose.

**Operational note:** all four agents hit an account-level rate limit right at the end of their runs and were reported `status: failed` by the harness. In all four cases the report body itself was already complete (each one reached its own closing summary/recommendation section before the limit hit) — treated as complete reports for this synthesis, not partial ones.

---

## 0. Correction to Agent 3's report (mandatory cross-check per prior council-scrutiny finding)

Agent 3 reported `GOLD (#C9A227) on GROUND (#0D1B2A) ≈ 4.3:1, borderline fail` for the page's small bold eyebrow/trend text. **This is wrong.** Independently recomputed using the standard WCAG relative-luminance formula (script-verified, not hand-waved):

```
GOLD on GROUND:              7.19:1   (Agent 3 claimed ~4.3:1 — WRONG, corrected)
TEXT_PRIMARY on GROUND:     14.63:1   (Agent 3 said ~13.8:1 — close enough, consistent)
TEXT_BODY(0.68) on GROUND:   6.71:1   (Agent 3 said ~6–7:1 — consistent)
TEXT_MUTED(0.45) on GROUND:  3.66:1   (Agent 3 said ~2.5–3:1 — same conclusion, fails either way)
TEXT_DIM(0.35) on GROUND:    2.72:1   (not isolated as its own token by any agent — genuinely worse than TEXT_MUTED, used for the "Trusted by" label)
```

**Verdict:** GOLD needs no change — it passes WCAG AA with a comfortable margin at every size used on this page. TEXT_MUTED and TEXT_DIM both genuinely fail and need fixing (see below); TEXT_DIM is the worse of the two and wasn't called out by name in any agent report, only implied via "CARD_BORDER... icons may fail."

## 1. Cross-Agent Consensus

No finding was raised by more than one agent against this branch's actual diff — the four audits are naturally partitioned by domain (DB/API, routes, UX, competitive) and this branch only touches the marketing page. The items below are each single-agent findings, verified where checkable, and are treated as consensus-equivalent because none conflicts with another agent's read of the same code.

## 2. Findings against this branch (actionable, pre-merge)

| # | Finding | Agent | Verified? | Action |
|---|---|---|---|---|
| 1 | `TEXT_MUTED` (0.45 opacity) fails WCAG AA (3.66:1 vs 4.5:1 needed) — used for stat labels, card captions, muted details | 3 | ✅ script-verified | Fix: raise to 0.62 (→5.79:1) |
| 2 | `TEXT_DIM` (0.35 opacity) fails worse (2.72:1) — used for the "Trusted by" label | *(none named it directly; found during correction of #0)* | ✅ script-verified | Fix: raise to 0.58 (→5.23:1) |
| 3 | Hero stat-card grid (`SimpleGrid cols={2}`) hardcoded, won't stack on narrow phones — inconsistent with every other grid on the same page, which all have responsive breakpoints | 3 | ✅ read the code — confirmed no `base`/`sm` props on that one `SimpleGrid` | Fix: `cols={{ base: 1, sm: 2 }}` |
| 4 | "Watch the overview" play affordance is 40×40px, under the 44×44px minimum touch target | 3 | ✅ read the code — confirmed literal `width: 40, height: 40` | Fix: bump to 44×44 |
| 5 | "Trusted by: Grace Chapel, Cornerstone, City Church, New Life" asserts real, existing customers the product does not have (Agent 4's own MVP-readiness section: 65/100, zero completed uncoached pilots) | 4 | ✅ consistent with this session's own Council Review 10 finding, unchanged | Fix: replace named-church social proof with honest, non-factual framing (target-segment labels instead of named logos) |

**Rejected/not actioned:**
- GOLD contrast (Agent 3) — corrected above, no action needed.
- `href="#"` placeholders on Pricing/Watch-overview/Advisor-link (Agent 2) — intentional; no destination page exists yet for any of the three, and inventing dead routes would be worse. Not fixed.
- Illustrative dashboard numbers (2,847 members, etc.) (Agent 4) — standard SaaS marketing-screenshot convention, clearly styled as UI-preview cards rather than a factual claim. Not fixed as a blocker; not worth the copy churn for a "preview" microlabel given the clearer #5 finding already addresses the actual honesty risk.

## 3. Findings NOT against this branch (pre-existing, carried forward, not fixed here)

All of the following were repeated from Council Reviews 9 and/or 10 and are unrelated to `app/page.tsx`/`lib/i18n.ts`:
- `/app/member` referenced by `member-bottom-nav.tsx`/`app/portal/page.tsx` but no page exists (Agent 2) — **new-to-this-round discovery, but out of scope for a landing-page PR.** Logged as a follow-up.
- No `aria-current` on `MemberBottomNav`, no `loading.tsx` anywhere in `/app`, no layout-level `error.tsx` (Agent 3) — repeat of Reviews 9/10, still unaddressed.
- No `lib/finance-import.ts` parser unit tests, no webhook dead-letter queue, `audit_log` backfill coverage, no CSRF layer (Agent 1) — repeats of Reviews 9/10.
- Whole-app MVP readiness (65/100), competitive gaps, role coverage — unchanged from Review 10 (Agent 4).

These are not re-litigated or re-fixed here; `DEVELOPMENT_PLAN.md`'s running status log already tracks them as open backlog.

## 4. ADR Drafts

**None.** Nothing in this round introduces a new architectural boundary, role-access pattern, integration contract, or data-exposure rule — every actionable finding is a color-token/layout/copy fix inside one existing client component.

## 5. Implementation Prompts

### Prompt A — Fix landing-page accessibility and honesty findings

**ADR Reference:** none
**Files:** `app/page.tsx`, `lib/i18n.ts`
**Scope:** Apply the five actionable fixes from §2 above, all localized to the landing page.

**Work:**
1. Raise `TEXT_MUTED` from `rgba(232,224,208,0.45)` to `rgba(232,224,208,0.62)`.
2. Raise `TEXT_DIM` from `rgba(232,224,208,0.35)` to `rgba(232,224,208,0.58)`.
3. Change the hero stat-tile `SimpleGrid` from `cols={2}` to `cols={{ base: 1, sm: 2 }}`.
4. Bump the "Watch the overview" circular affordance from 40×40px to 44×44px (adjust the inner icon size proportionally if needed).
5. Replace the "Trusted by" + four named-church strip with honest, non-factual copy — no fictional customer logos. Update `publicHome.socialProofLabel` and remove/repurpose `publicHome.churchName1`–`4` (or replace with genuine target-segment labels, e.g. "Church plants", "Multi-site ministries", "Growing congregations", "Established ministries") across all three locales (`en`/`es`/`es-PR`), keeping `lib/i18n-ws-c4-coverage.test.ts` parity green.

**Verification:**
- `npx vitest run app/page.test.tsx lib/i18n-ws-c4-coverage.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Re-verify TEXT_MUTED/TEXT_DIM contrast against `#0D1B2A` meets ≥4.5:1 with a calculator/script, not by eye.

### Execution order
Single prompt, single agent, sequential (all edits are in the same two files) — no parallelization needed.

## 6. Next step

Per the council skill's chain: human approval of this synthesis and prompt sequence is required before implementation proceeds (step 4). Once approved, Prompt A executes via direct edit (small, mechanical, already fully specified — no need for a fresh `build-with-tests` delegation round), then verification, then Documenter closes the loop, then the PR opens.
