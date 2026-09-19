# Scoped Evaluation — Spanish (`es`/`es-PR`) UI Translation Readiness

**Date:** 2026-09-18
**Requested by:** user, after installing the `language-translation` skill (`.claude/skills/language-translation/`)
**Type:** Scoped read-only investigation, not a full Council audit round. The four generic Phase 1 prompts in `improve-software.md` don't ask about localization at all, and none of Council Reviews 1–10 examined it — this evaluation exists to answer one question directly instead of running agents against prompts that wouldn't surface it.

---

## 1. The premise was wrong — there is no "creating" a Spanish translation to do

Before running the `language-translation` skill's generic pipeline (which assumes it's translating from zero), direct investigation of `lib/i18n.ts`, `components/i18n-provider.tsx`, `lib/localization-governance/`, and ADR 0009 found that **ChurchCore already has a complete, working Spanish (and Puerto Rican Spanish) translation system**, built as part of CC-L10N-001/002 (per `DEVELOPMENT_PLAN.md`: "Shipped and merged to main"). Specifically, verified directly:

- `lib/i18n.ts` declares `supportedLocales = ["en", "es", "es-PR"]` and contains a nested `messages` catalog with **exact key parity across all three locales — 1,010 leaf string values each**, confirmed by direct count, not estimation.
- `components/i18n-provider.tsx` exposes a working `useI18n()` hook (`t(namespace, key, values?)`) with automatic English fallback for any missing key.
- A full translation-governance backend exists at `lib/localization-governance/` (vendored `@localization-governance/*` packages, ADR 0009), supporting a per-tenant catalog lifecycle (`draft → translated → validated → in_linguistic_review → in_domain_review → approved → active → stale`), a Google Translate provider integration, validation reports, human review/approval, and activation/rollback history — plus a working church-admin UI for it (`app/app/church-admin/localization/`, `components/localization/`).
- A language switcher already exists and is wired at the root layout and public-facing pages (`components/language-select.tsx`, `app/layout.tsx`, sign-in, portal registration, event registration).
- `getRuntimeCatalog()` (`lib/localization-governance/runtime.ts`) always falls back to the hardcoded `messages[locale]` catalog when no governance version is active for a tenant — meaning **Spanish already renders correctly today, with zero setup**, for every component that's wired to the system. Nothing needs to be "activated" for the baseline translation to work.

This changes the shape of the actual work from "translate the UI into Spanish" to two much narrower, concrete gaps below.

## 2. Real gap #1: coverage — most of the app isn't wired to the system at all

Only ~34 components call `useI18n()` (confirmed by direct grep, not sampling): people/member management, finance, giving, communications, daily desk, onboarding, dashboard/readiness, portal, and the app shell.

Checked by module keyword against every `.tsx` file in `components/application/` — **zero** components use `useI18n()` in:

| Module | Components checked | Wired to `useI18n()` |
|---|---|---|
| Children's Ministry (CCM) | 10 | 0 |
| Ministry Forge | 2 | 0 |
| Volunteers | 3 | 0 |
| Groups | 3 | 0 |
| Events (admin-side) | 3 | 0 |
| Attendance | 2 | 0 |
| Reports | 4 | 0 |
| Operations | 10 | 0 |
| Workflows | 1 | 0 |
| Control Plane | 3 | 0 |
| Pastor tools | 3 | 0 |

That's roughly half of the ~116 pages Council Review 10's Agent 1 inventoried, rendering hardcoded English regardless of the locale a user selects. A Spanish-speaking church-admin at Casa de Refugio ES (the actual pilot tenant — note the name) switching to Español today would find member management, finance, giving, and daily desk fully in Spanish, then hit children's check-in, volunteer scheduling, events, and reporting still entirely in English. That inconsistency is a worse experience than no translation at all, because it looks broken rather than incomplete.

## 3. Real gap #2: the existing Spanish text has never had linguistic review

Per ADR 0009 Decision 5, in the reviewer's own words: *"The existing Spanish translation in `lib/i18n.ts` was written by engineering, not reviewed by a human linguist... Entering it as `approved` or `active` would incorrectly imply it passed the governance review process."* Confirmed directly: the seed script enters it as `validated`, explicitly not `approved`. It is currently sampled-inspected as fluent, idiomatic Spanish (spot-checked several `dailyDesk` entries) — but "looks right to a non-native skim" is exactly the gap the governance system's own review step exists to close, and that step has never actually run.

This is not a hypothetical risk: the pilot tenant is a Spanish-named, presumably Spanish-speaking congregation, meaning unreviewed engineering Spanish is what a real user is seeing today if they ever switch locale — a direct, live instance of the "external validation" gap Council Review 9 and 10 both named as the binding constraint on Phase A→B advancement.

## 4. Recommendation

Two independent workstreams, sequenced by urgency:

1. **Linguistic review of the existing catalog (do this first, it's cheap).** Run the `language-translation` skill's Agent 3 (Native Speaker Evaluator) against the *existing* `es`/`es-PR` catalog in `lib/i18n.ts` — not to generate new translations, but to review 1,010 already-written strings for naturalness, register, and domain terminology, exactly matching the review step ADR 0009 says is outstanding. Route the outcome through `lib/localization-governance/adapter.ts`'s `validateVersion()`/review flow rather than hand-editing `lib/i18n.ts` silently, so the governance system's state (`validated` → `in_linguistic_review` → `approved`) reflects reality instead of staying permanently stuck at "written by engineering, never reviewed."
2. **Coverage expansion for the unwired modules (larger, sequence as normal feature work).** This is a `feature-factory` job, not a one-shot skill run: each module (CCM, Ministry Forge, Volunteers, Groups, Events, Attendance, Reports, Operations, Workflows, Control Plane, Pastor tools) is its own story/brief, sized independently, run through `codebase-researcher` → `story-writer` → `spec-writer` → `backend-builder`/`frontend-builder` → `test-verifier` → `implementation-validator`, using the adapted `language-translation` skill's Agent 1 (scoped to one module at a time) and Agent 4 (wiring `useI18n()` following `daily-desk-workspace.tsx`'s existing pattern) as the mechanical core of each story, not as a whole-app one-shot run. Trying to run the generic 5-agent pipeline against the entire remaining ~50%+ of the app in one pass risks exactly the kind of undifferentiated, hard-to-review diff `feature-factory`'s "one coherent vertical slice" rule exists to prevent.

Neither workstream requires installing a new i18n library, touching `lib/i18n.ts`'s existing `en` content, or bypassing the governance system — the architecture is sound; it's under-applied.

## 5. Not evaluated here (out of scope for this pass)

- Whether `es-PR` should diverge meaningfully from `es` anywhere, or is currently a near-duplicate (the leaf-count match suggests it may be — worth a follow-up spot check).
- Cost/quota of the `@localization-governance/provider-google` integration for the coverage-expansion workstream's new keys.
- Whether other pilot-relevant locales beyond Spanish are worth planning for now versus later.

## 6. Outcome

No code changed by this evaluation. `.claude/skills/language-translation/SKILL.md` (repo-local copy of the global skill, adapted with the findings above baked into a "ChurchCore-Specific Notes" section) is now available for the two workstreams above whenever the user approves starting one as a story.
