# Factory Run: Language-Translation Skill Install + Spanish Catalog Review

Date: 2026-09-18
Type: Skill install + scoped localization evaluation + linguistic-review pass + Documenter close-out
Branch: `feat/language-translation-skill-and-es-review`
Scope: `.claude/skills/language-translation/SKILL.md`, `lib/i18n.ts` (7 string-value fixes only), `docs/reviews/2026-09-18-spanish-translation-evaluation.md`, `docs/reviews/2026-09-18-spanish-catalog-linguistic-review.md`, `docs/reviews/2026-09-18-language-translation-skill-synthesis.md`, `docs/plans/spanish-ui-coverage.md`, `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, memory

---

## Intent

Install a repo-local `language-translation` skill (a generic 5-agent translation pipeline) as this repo's Claude-compatible workflow surface for future translation/localization work, adapted so it recognizes ChurchCore's existing i18n system instead of misclassifying the stack or treating Spanish as a from-scratch translation task. Along the way, use the skill's own investigation step to answer a real open question — what is the actual state of Spanish (`es`/`es-PR`) readiness in ChurchCore — and run a first linguistic-review pass on the existing catalog. This run is the Documenter close-out for all three commits on the branch, including a follow-up commit that resolved automated PR review findings on PR #141.

## Factory workflow

Claude Code, `documenter` subagent (`.claude/agents/documenter.md`), invoked directly for this close-out. The skill install and evaluation work (commits `ecbc795`, `80d6881`) ran earlier in the session; the review-findings fix (`27643ea`) added the missing Council-equivalent synthesis document itself, which this close-out treats as the audit artifact rather than re-running one.

## Story and acceptance criteria

- The `language-translation` skill must be installed and adapted with ChurchCore-specific notes so a future invocation doesn't propose re-translating an already-complete catalog or misuse the governance system.
- The real state of Spanish/`es-PR` coverage and quality must be documented from direct file inspection, not assumed.
- Any objective, verifiable errors found in the existing `es`/`es-PR` catalog should be fixed; unverified or internally-contradictory proposed changes should not be applied.
- The branch's process-compliance gap (a "scoped evaluation" is not a Council substitute for a branch this size) must be resolved with a real synthesis document, not left as a stale commit-message claim.
- `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, and memory must reflect the branch's actual, verified state.

## Technical brief

- **Architecture impact:** none. No change to `lib/localization-governance/`'s implementation, ADR 0009's decisions, or the runtime fallback mechanism. `lib/i18n.ts` changes are string-value corrections only (7 leaf values across `es`/`es-PR`); key structure and leaf-count parity (1,010/1,010/1,010) are unchanged.
- **Tenant boundary / RBAC:** unaffected.
- **Sensitive data:** the skill's stack-detection step originally instructed reading `.env` (real secrets) when only variable names were needed — closed in the review-findings commit; it now reads `.env.example` only, with an explicit instruction never to open `.env`/`.env.local`.
- **Governance-naming risk:** the skill's Agent 3 output key `translations_approved` could be mistaken for human approval and used to auto-activate a governance catalog version, repeating the exact mistake ADR 0009 Decision 5 exists to prevent. Closed in the review-findings commit — the skill now states explicitly that only a human may call `approveVersion()`/`activateVersion()`.
- **Documentation impact:** `DEVELOPMENT_PLAN.md`'s Current Status section, `CHANGELOG.md`, and `docs/plans/spanish-ui-coverage.md` (added a native-speaker-review checklist item, since that plan's existing "Before declaring full Spanish readiness" section had no linguistic-quality gate at all) — all updated in this close-out. `README.md` was checked and not touched; its one-line Spanish-support mention (`docs/plans/spanish-ui-coverage.md` pointer) is unrelated pre-existing drift, not something this branch changed the accuracy of — see Residual Risk.

## Implementation summary

- `ecbc795`: installed `.claude/skills/language-translation/SKILL.md` (468 lines with ChurchCore-specific notes), plus `docs/reviews/2026-09-18-spanish-translation-evaluation.md` — direct-inspection finding that `es`/`es-PR` already have exact 1,010-key parity with `en`, a working `useI18n()` hook, and a full governance backend; the real gaps are coverage (~34 of an app-wide component set actually wired) and linguistic review (never done, per ADR 0009 Decision 5).
- `80d6881`: linguistic-review pass. Applied 6 verified objective fixes (5 accent errors in `es`, 1 untranslated string in `es-PR`). Explicitly did not apply ~100 other proposed changes after the review agent admitted shortcutting most of them with unreviewed find/replace patterns and gave internally-contradictory recommendations — full scrutiny in `docs/reviews/2026-09-18-spanish-catalog-linguistic-review.md`.
- `27643ea`: fixed all 7 findings from this repo's automated PR review on PR #141 — 2 in the skill's stack-detection/framework-branch logic, 2 factual/documentation corrections in the skill's ChurchCore notes, the `translations_approved` naming footgun, a note that editing `lib/i18n.ts` doesn't retroactively update an already-seeded governance snapshot, and a 7th accent error (`es.publicHome.eyebrow`: "mayordomia" → "mayordomía") the linguistic-review pass itself should have caught. Added `docs/reviews/2026-09-18-language-translation-skill-synthesis.md` as the missing Council-equivalent synthesis, since the branch's size (458-line skill file + catalog changes) doesn't qualify for `improve-software.md` §0's small-isolated-fix exception and a scoped evaluation alone isn't sufficient process compliance for a branch this size.
- This run: `DEVELOPMENT_PLAN.md` Current Status section corrected to record the skill install, the real coverage/quality state, and two explicit open follow-ups; `CHANGELOG.md`'s existing `[Unreleased]` entry (already partially present from earlier in the session) extended to cover the `27643ea` fixes rather than duplicated; `docs/plans/spanish-ui-coverage.md` given a native-speaker-review checklist item cross-referencing both review docs; memory updated (see below).

## Verification

Commands run and results, this close-out session:

- `npx tsc --noEmit` — clean, 0 errors.
- `npx vitest run lib/i18n-ws-c4-coverage.test.ts` — 217/217 passing.
- Confirmed by direct read that all 7 automated-PR-review fixes described in `docs/reviews/2026-09-18-language-translation-skill-synthesis.md` are actually present in `.claude/skills/language-translation/SKILL.md` and `lib/i18n.ts` (not just claimed in the commit message): `.env.example`-only reading, explicit Svelte branch, corrected `es-PR` governance claim, `translations_approved` non-approval framing, the stale-snapshot warning, and the `mayordomía` accent fix.
- Confirmed all three `docs/reviews/2026-09-18-*.md` files (evaluation, linguistic review, synthesis) are committed (`git ls-files`), not just produced in chat.
- Not independently re-run in this session (would only reconfirm the prior session's own results, already recorded in the commit and the synthesis doc): the full test suite (`npm test`), `npm run lint`, `npm run build`. These should still be run once before merge if not already green in CI for this branch's HEAD.

## Residual risk

- **Two concrete open follow-ups, not resolved on this branch** (per `docs/reviews/2026-09-18-spanish-translation-evaluation.md` and `docs/reviews/2026-09-18-spanish-catalog-linguistic-review.md`):
  1. The actual human native-speaker governance review (`requestReview()`/`submitReview()`) of the `es` catalog has not happened. The governance catalog remains `validated`, not `approved`, deliberately.
  2. `useI18n()` coverage is roughly half the app: Children's Ministry, Ministry Forge, Volunteers, Groups, Events (admin-side), Attendance, Reports, Operations, Workflows, Control Plane, and Pastor tools have zero coverage. Each should be scoped as its own `feature-factory` story, following `components/application/daily-desk-workspace.tsx`'s existing wiring pattern — not one large branch.
- **`es-PR` has no governance record.** `lib/localization-governance/seed.ts` only seeds `en`/`es`. Whether `es-PR` should be onboarded to governance is an open product decision, not resolved here — flagged, not decided.
- **Unrelated, pre-existing drift observed but not fixed** (out of scope for this branch, per Documenter convention of flagging rather than silently fixing unrelated drift):
  - `README.md`'s "Evaluation Snapshot" section still says "Spanish UI support has started with cookie-backed English/Spanish selection" and links `docs/plans/spanish-ui-coverage.md` — an understatement of the real state (full `es`/`es-PR` key parity and a governance backend have existed since the 3.4.0 release) that predates this branch and wasn't introduced or worsened by it.
  - `README.md`'s License line still reads `[MIT](LICENSE)`, despite `git log` showing "Change license from MIT to GNU AGPL v3 (#133)" already merged to `main`. Pre-existing, unrelated to this branch — flagged for whoever owns licensing docs.
  - `docs/factory-runs/README.md`'s tracking table stops being populated after entries dated 2026-06-11; later runs (`2026-06-18-project-hq.md` onward, including the two 2026-07-10 gate-run entries) exist as files but were never added as rows. This entry is appended at the end of the table without backfilling the missing rows, since backfilling ~9 unrelated historical entries is outside this branch's scope.
  - A `docs/factory-runs/2026-09-18-tenant-provisioning-rls-gate-and-council-review-10.md` entry exists only on the sibling, still-unmerged branch `feat/generic-tenant-provisioning-and-rls-ci-gate` (forked from the same `7325b0c` base) — not visible on `main` or this branch. No conflict expected (different files), but whoever merges both branches should confirm `DEVELOPMENT_PLAN.md`'s "Current Status" section reads coherently with both sets of bullets present.
  - An untracked `.sync.ffs_db` file (a FreeFileSync sync-tool artifact, not a project file) is present in the working tree. Not touched — not a docs/app-code concern, but worth someone removing or gitignoring it.

## Follow-up work

- Open the human native-speaker governance review for the `es` catalog (and decide whether `es-PR` should be onboarded to governance at the same time).
- Scope per-module `useI18n()` coverage expansion as separate `feature-factory` stories (Children's Ministry, Ministry Forge, Volunteers, Groups, Events, Attendance, Reports, Operations, Workflows, Control Plane, Pastor tools).
- Run the full `npm test` / `npm run lint` / `npm run build` gate on this branch's HEAD before merge if CI hasn't already reported green.
- Separately: correct `README.md`'s stale License line and Spanish-support description, and backfill or prune `docs/factory-runs/README.md`'s tracking table — both flagged above as unrelated pre-existing drift, not fixed here.

## Delivery

- Branch: `feat/language-translation-skill-and-es-review`.
- Commits: `ecbc795` (skill install + evaluation), `80d6881` (linguistic-review pass), `27643ea` (automated-review-findings fix + missing synthesis), plus this Documenter close-out commit.
- Pull request: PR #141 (already open) — see draft PR description addition below.

---

## Draft PR description addition (append to PR #141's existing description)

> **Update (review-fix commit + Council-equivalent synthesis):**
>
> A follow-up commit (`27643ea`) addresses all 7 findings from this repo's automated PR review: a secrets-exposure risk in the skill's stack-detection step (now reads `.env.example` only), a missing Svelte-framework branch, a factual error about `es-PR` governance seeding, a governance-naming footgun (`translations_approved` is an automated opinion, not human approval — the skill now says explicitly that only a human may call `approveVersion()`/`activateVersion()`), a note that editing `lib/i18n.ts` doesn't retroactively update an already-seeded governance snapshot, a 7th missed accent error (`mayordomia` → `mayordomía`), and — the process finding — this branch's size doesn't qualify for `improve-software.md` §0's small-isolated-fix exception, so the earlier "scoped evaluation" alone wasn't sufficient. `docs/reviews/2026-09-18-language-translation-skill-synthesis.md` is the missing Council-equivalent synthesis, resolving all 7 findings and explaining why a redundant generic whole-app re-audit (so soon after Council Review 10 examined this same codebase state) wasn't the right tool either.
>
> Documenter close-out complete: `DEVELOPMENT_PLAN.md`, `CHANGELOG.md`, `docs/plans/spanish-ui-coverage.md`, and memory updated to reflect verified status — see `docs/factory-runs/2026-09-18-language-translation-skill-and-es-review.md`.
>
> Re-verified after the fix commit: `tsc --noEmit` clean, `lib/i18n-ws-c4-coverage.test.ts` 217/217 passing, key-leaf-count parity unchanged (1,010/1,010/1,010).
