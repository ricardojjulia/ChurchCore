# Factory Run: Landing Page "Sacred Clarity" Redesign + Council Review 11

Date: 2026-09-19 → 2026-09-20
Type: Marketing surface redesign + diff-scoped Council audit + fix round + Documenter close-out
Branch: `feature/landing-page-sacred-clarity`
Scope: `app/page.tsx`, `app/page.test.tsx`, `lib/i18n.ts`, `README.md`, `CHANGELOG.md`, `DEVELOPMENT_PLAN.md`, `docs/reviews/2026-09-20-council-review-11-*.md` (5 files), this factory-run entry, memory

---

## Intent

Rebuild the public landing page (`/`) with a full marketing treatment ("Sacred Clarity": dark midnight ground, gold accent, serif display over sans body), reversing the 1.0.0 foundation release's deliberate "minimal entry surface" simplification. This is an intentional direction change — confirmed explicitly with the user, not an accidental regression of that earlier decision — now that the product has enough shipped functionality to show (hero with live-product preview cards, a 6-item platform capability grid, a 4-card product-family ecosystem section, a closing CTA). A diff-scoped Council Review 11 then audited the new page before merge, per the Council mandate in `AGENTS.md`, and a follow-up commit fixed everything it found actionable.

## Factory workflow

Claude Code: direct implementation for the redesign, `.claude/skills/council/` for the review round, `documenter` subagent (`.claude/agents/documenter.md`) for this close-out.

## Story and acceptance criteria

- The landing page communicates the product's actual current capability set instead of a minimal entry screen, without adding new dependencies or breaking the existing i18n/build/test pipeline.
- All new copy is localized through the existing `publicHome` namespace (`en`/`es`/`es-PR`), keeping the catalog-wide parity gate green.
- A Council review runs against the new page before merge; every actionable finding is either fixed or explicitly, defensibly deferred with a stated reason.
- Any agent's own numeric/factual claim in its report is spot-checked computationally, not accepted narratively (per the standing `feedback_council_synthesis_scrutiny` lesson).
- `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, README, and memory reflect the branch's actual, verified end state — not the first commit's state alone.

## Technical brief

- **Architecture impact:** none. This is a single client component (`app/page.tsx`) and its i18n keys — no new route, data model, RBAC pattern, or integration contract. Council Review 11's synthesis independently confirmed no ADR is warranted.
- **Tenant boundary / RBAC:** unaffected — `/` is the unauthenticated public marketing surface, no tenant or session data involved.
- **Sensitive data:** none introduced. The former "Trusted by: Grace Chapel, Cornerstone, City Church, New Life" strip risked implying real customer relationships the product doesn't have; it was replaced with generic target-segment labels rather than any real or fictional identifying data.
- **Dependencies:** none added — reuses the existing self-hosted `--font-fraunces`/`--font-manrope` fonts (`app/layout.tsx`) and the existing `lucide-react` icon set.
- **Documentation impact:** README's "Current Application Surface" section, `CHANGELOG.md`, and `DEVELOPMENT_PLAN.md`'s running status log all updated (README and the first two in commit `9beccb9`; this run folds the Council Review 11 fix round into `DEVELOPMENT_PLAN.md` and extends the `CHANGELOG.md` entry rather than duplicating it).

## Implementation summary

- `9beccb9` — `feat(marketing): redesign landing page with Sacred Clarity direction`. New hero/capability-grid/ecosystem/CTA sections in `app/page.tsx`; 74 new `publicHome` keys × 3 locales in `lib/i18n.ts`; new coverage in `app/page.test.tsx`; README/CHANGELOG/DEVELOPMENT_PLAN updated for this commit's own scope.
- Council Review 11 (this run's audit trigger): 4 agents (database/API, routes/pages, UX/shell, feature/competitive), diff-scoped to this branch per `improve-software.md`. Synthesis: `docs/reviews/2026-09-20-council-review-11-synthesis.md`. All four agent reports hit an account-level rate limit at the very end of their runs (reported `status: failed` by the harness) but each had already reached its own closing-summary section before the limit hit — treated as complete, non-partial reports; noted transparently in each doc's operational note, not treated as a coverage gap.
- `d14d106` — `fix: address Council Review 11 findings on landing page`. Fixed the 5 actionable findings from §2 of the synthesis:
  1. `TEXT_MUTED` opacity 0.45 → 0.62 (3.66:1 → 5.79:1 against `#0D1B2A`, was failing WCAG AA's 4.5:1 minimum).
  2. `TEXT_DIM` opacity 0.35 → 0.58 (2.72:1 → 5.23:1, was failing worse — used on the "Trusted by" label, not previously named as its own token by any agent).
  3. Hero stat-tile `SimpleGrid` changed from hardcoded `cols={2}` to responsive `cols={{ base: 1, sm: 2 }}` — the only grid on the page without a responsive breakpoint, would not stack on narrow phones.
  4. "Watch the overview" circular play affordance bumped from 40×40px to the 44×44px minimum touch target.
  5. "Trusted by: Grace Chapel, Cornerstone, City Church, New Life" — asserting real, existing named customers the product does not have — replaced with `audienceSegmentsLabel` + `segmentPlants`/`segmentMultiSite`/`segmentGrowing`/`segmentEstablished` (honest, non-factual target-segment labels) across `en`/`es`/`es-PR`.
  - Also corrected an error in the council's own Agent 3 report: Agent 3 claimed GOLD (#C9A227) on the dark ground was "~4.3:1, borderline fail." Independently recomputed with the standard WCAG relative-luminance formula (script-verified): **7.19:1**, a comfortable pass. No gold-related change was made.
- Not fixed, and explicitly not treated as gaps: three `href="#"` placeholders (Pricing / Watch-overview / Advisor-link — no destination page exists yet for any of them, and inventing dead routes would be worse) and the illustrative dashboard-preview stat numbers (standard, low-risk SaaS marketing-screenshot convention, clearly styled as UI-preview cards).
- This run: folded the Council Review 11 round into `DEVELOPMENT_PLAN.md`'s existing landing-page bullet as one narrative (not a second bullet); extended `CHANGELOG.md`'s existing landing-page entry with the fix-round sub-entry; committed the 5 Council Review 11 review docs (previously untracked); updated memory; wrote this factory-run entry.

## Verification

Commands run and results, independently re-run and confirmed after the fix commit (`d14d106`), in this order:

1. `npx vitest run app/page.test.tsx lib/i18n-ws-c4-coverage.test.ts` → 2 files, **222/222 passing**.
2. `npm run lint` → 0 errors, 7 pre-existing warnings (all in files this branch never touched).
3. `npm run typecheck` → clean.
4. `npm run build` → success, all 118 routes.
5. Full `npx vitest run` → 125 files, **1417/1417 passing**.
6. A manual dev-server render check (`curl` against a locally running `next dev`) confirmed the new copy renders server-side with no console errors. Browser automation (Claude in Chrome) was unavailable in this environment, so no visual screenshot pass was possible — this gap is noted in the CHANGELOG and here, not silently dropped.
7. Key-parity re-verified computationally this run (not assumed from the first commit's CHANGELOG number): a Node script (`npx tsx`) importing `lib/i18n.ts` and summing `Object.keys(messages[locale][ns]).length` across all namespaces, run against both `9beccb9` and `d14d106`, gives **1,082/1,082/1,082** at both commits — the fix commit removes 5 `publicHome` keys and adds 5 per locale (net 0), not the "+1 net" figure originally assumed going into this close-out. This is called out explicitly as a correction to that assumption, found by direct computation rather than accepted narratively — the same discipline this run's memory update codifies as a specific, concrete instance of `feedback_council_synthesis_scrutiny`.

## Residual risk

- **No browser-automation visual pass.** All verification of the new visual treatment was server-side render + code-level contrast computation; no screenshot-based review was possible in this environment. Recommend a manual visual check (or a future session with Claude-in-Chrome available) before or shortly after this branch reaches production.
- **Three intentional `href="#"` placeholders** remain on Pricing / Watch-overview / Advisor-link — no destination page exists for any of them yet. Not a defect on this branch; becomes one only if the page ships to production traffic expecting those links to work.
- **`/app/member` 404 risk (new-to-this-round, out-of-scope finding):** `member-bottom-nav.tsx` and `app/portal/page.tsx` reference `/app/member`, but no `app/app/member/page.tsx` exists. Unrelated to this branch's diff (`app/page.tsx`/`lib/i18n.ts`/`app/page.test.tsx` only) — logged as follow-up backlog per Council Review 11's synthesis, not fixed here.
- **All four Council Review 11 agents were reported `status: failed`** by the harness due to an account-level rate limit hit at the very end of each run. Each report body was already complete (reached its own closing-summary section) before the limit hit — treated as non-blocking and complete, but flagged here for transparency rather than silently normalized.
- **Repeat, pre-existing findings carried forward, not re-litigated on this branch:** no `aria-current` on `MemberBottomNav`, no `loading.tsx` anywhere in `/app` (Agent 3, repeat of Reviews 9/10); no `lib/finance-import.ts` parser unit tests, no webhook dead-letter queue, `audit_log` schema gaps, no CSRF layer (Agent 1, repeat of Reviews 9/10); MVP readiness unchanged at 65/100, Phase A GO / Phase B–D NO-GO (Agent 4, repeat of Reviews 9/10). All already tracked in `DEVELOPMENT_PLAN.md`'s running status log.

## Follow-up work

- Treat `/app/member`'s missing page as near-term backlog — either build it or remove/redirect the two dead references.
- Get a real visual/screenshot review of the redesigned landing page once browser automation is available, given the contrast fixes were verified computationally but not visually.
- Once the three placeholder destinations (pricing page, product-overview video, advisor booking) exist, wire the `href="#"` links to them.
- Continue prioritizing the standing Phase B blockers (service planning, mobile UX, recurring giving, migration tooling, provider breadth) — unaffected by this branch, reconfirmed unchanged through Council Review 10 and not re-audited by Review 11 (out of this round's diff-scoped focus).
- Open the PR for `feature/landing-page-sacred-clarity` against `main`, referencing `docs/reviews/2026-09-20-council-review-11-synthesis.md` and this factory-run entry, and confirming Documenter sign-off per `AGENTS.md`. Not opened as part of this run — PRs are opened only after the user is asked, per this run's own instructions.

## Delivery

- Branch: `feature/landing-page-sacred-clarity`.
- Commits: `9beccb9` (landing page redesign), `d14d106` (Council Review 11 fixes), plus this Documenter close-out commit (docs/reviews commit + this entry + memory + plan/changelog updates).
- Pull request: not yet opened as of this run.
