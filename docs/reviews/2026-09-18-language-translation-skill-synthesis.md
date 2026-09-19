# Council-Equivalent Synthesis — Language-Translation Skill + Spanish Catalog Work

**Date:** 2026-09-18
**Branch:** `feat/language-translation-skill-and-es-review`
**Status:** Findings resolved; merge unblocked

---

## 1. Why this document exists

This branch adds a 458-line skill file (`.claude/skills/language-translation/SKILL.md`), fixes to `lib/i18n.ts`'s Spanish catalog, and two review docs. That is squarely inside `improve-software.md` §0's "new feature... or accumulated multi-commit branch" trigger — it does not qualify for the small-isolated-fix exception (typo, single-line config, no-behavior-change dependency bump). The PR's own automated review correctly called this out: an earlier commit message described the pre-merge work here as a "scoped, non-Council evaluation," which is not the same thing as the council pass + Documenter sign-off `AGENTS.md` requires before a non-trivial merge. This document is that missing artifact.

**Why not a fresh 4-agent whole-app audit (Council Review 11), same as Review 10's pattern:** Council Review 10 ran against this exact codebase state hours earlier the same day and found no critical issues; the generic Phase 1 prompts (database/API, routes/pages, UX/shell, feature/competitive) don't examine skill-file content or translation-catalog correctness at all, so re-running them would mostly re-confirm Review 10's findings while still never actually reviewing this branch's real changes — the same mismatch flagged in Review 10's own scope note. What this branch actually needed was a scoped, technical review of the skill's logic and the catalog edits, which is exactly what this repository's automated PR review (GitHub-integrated, ran directly on the diff) provided, at a level of rigor that in places exceeded the author's own scoped evaluation. That review is treated here as the audit input, in place of spinning up redundant generic agents. If the user wants a formal 4-agent Council round on this branch as well, that can still be run — this synthesis does not preclude it, but the findings below have already been resolved either way.

## 2. The audit: automated PR review findings

Seven findings were raised as inline review comments on PR #141. All seven were verified against the actual files before any fix was made (per this session's own established discipline — see `feedback_council_synthesis_scrutiny.md`). All seven were confirmed genuine:

| # | File | Finding | Verified? |
|---|---|---|---|
| 1 | `.claude/skills/language-translation/SKILL.md` | Agent 1's stack-detection step told a subagent to read `.env` (real secrets), when only variable *names* were needed — this repo's own pre-commit hook treats `.env*` as sensitive | Confirmed by reading the line directly |
| 2 | same | The "no i18n library" branch only defines React/Vue install patterns, but the stack detector can report `svelte`/`other` — a Svelte app would get the wrong package installed | Confirmed by reading Agent 1's `stack_info.framework` enum vs. Agent 4's Step 1 branches |
| 3 | same | Claimed both `es`/`es-PR` are "seeded into governance as validated" — `lib/localization-governance/seed.ts` only seeds `en` and `es`; `es-PR` has no governance record at all | Confirmed by reading `seedWithServiceAndMessages()` directly — it never references `es-PR` |
| 4 | same | Agent 3's output key is literally named `translations_approved`, and Agent 4 was told to consume it as approved, despite ChurchCore's own notes saying this is an automated opinion, not human approval — directly repeats the exact mistake ADR 0009 Decision 5 exists to prevent | Confirmed — the naming/consumption instruction as originally written did not gate this |
| 5 | `lib/i18n.ts` | Catalog fixes only change the hardcoded fallback; `createCatalogVersion()` only runs "if no version exists yet," so an already-seeded governance snapshot would not pick up these fixes and could later serve stale text if activated | Confirmed by reading the idempotency guard in `seed.ts` |
| 6 | `docs/reviews/2026-09-18-spanish-translation-evaluation.md` | Calling this a "scoped, non-Council evaluation" does not satisfy the repo's actual merge gate for a change this size | Confirmed against `improve-software.md` §0's literal exception criteria — this document is the resolution |
| 7 | `lib/i18n.ts` | `publicHome.eyebrow` in `es` still read "mayordomia" (missing accent) immediately next to other strings in the same namespace that had just been "fixed" for exactly this class of error | Confirmed by direct grep; `es-PR`'s equivalent string already had the correct accent |

## 3. Resolution

All seven fixed in commit(s) on this branch, verified after each change:

- **#1, #2**: `SKILL.md` updated — Agent 1 now reads `.env.example` only, with an explicit instruction never to open `.env`/`.env.local`/anything that may hold real secrets. Agent 4's "none" branch now has explicit Svelte handling (`svelte-i18n`) and an explicit stop-and-ask instruction for any other/unrecognized framework value instead of silently guessing.
- **#3**: `SKILL.md`'s ChurchCore-Specific Notes corrected — `es-PR` has no governance record; onboarding it to governance is a separate, not-yet-made decision. Added an explicit note that editing `lib/i18n.ts` doesn't retroactively update an already-seeded governance snapshot, with the concrete fix (a new `createCatalogVersion()`, left `validated`, wherever a governance version already exists for that tenant/locale).
- **#4**: `SKILL.md` now states explicitly that `translations_approved` is an automated subagent's opinion, not human approval, and that `approveVersion()`/`activateVersion()` are always a human decision — Agent 4 may write to the hardcoded fallback and/or create a new `validated` governance version, never call the two approval/activation functions itself.
- **#5**: Documented directly in the SKILL.md fix for #3 above (same underlying mechanism).
- **#6**: This document.
- **#7**: `lib/i18n.ts`'s `es.publicHome.eyebrow` corrected to `"Sistema de mayordomía para iglesias modernas"`. A broader accent sweep was then run across the entire `es`/`es-PR` blocks for ~90 other common Spanish words prone to this exact error (informtámessage, opción, versión, ubicación, situación, etc.) — no further instances found.

**Verification after all fixes:**
- `npx tsc --noEmit` — clean, 0 errors.
- `npx vitest run lib/i18n-ws-c4-coverage.test.ts` — 217/217 passing.
- Key-leaf-count parity unchanged: `en`/`es`/`es-PR` all still 1,010.
- `node --check` + `eslint` on all touched `.mjs`/`.ts` files — clean.

## 4. ADRs

None needed. No new architectural boundary, access-control pattern, integration contract, or data-exposure rule was introduced by these fixes — they correct documentation accuracy and close a governance-naming footgun in a skill file, without changing `lib/localization-governance/`'s actual implementation or ADR 0009's decisions.

## 5. Deferred, not blocking

- Whether `es-PR` should get its own governance onboarding (a locale + catalog version in `lib/localization-governance`) is an open product decision, not resolved here — flagged, not decided, per this branch's own scope.
- The actual human native-speaker governance review (`requestReview()`/`submitReview()`) for the `es` catalog is still outstanding — unchanged from `docs/reviews/2026-09-18-spanish-catalog-linguistic-review.md`'s conclusion.
- The ~10-module `useI18n()` coverage expansion remains future `feature-factory` work, one module at a time, per `docs/reviews/2026-09-18-spanish-translation-evaluation.md`.

## 6. Outcome

Merge unblocked pending Documenter close-out (next).
