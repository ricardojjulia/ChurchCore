# Council Review 14 — Agent 3: UX & Shell Quality Audit

**Branch:** `feat/service-planning-song-library` (commit `8c57631`)

## 1. ARIA Correctness — PASS

All new interactive elements in `volunteer-schedule.tsx` are labeled: drag handle (`aria-label="Reorder: {title}"`), move up/down (`aria-label="Move up/down: {title}"`), remove (`aria-label="Remove: {title}"`), song search (`aria-label="Search song library"`). The drag handle is a real focusable `ActionIcon` carrying `useSortable()`'s `{...listeners}`, so `@dnd-kit`'s `KeyboardSensor` has a real control to attach to. Minor, non-blocking: no on-screen keyboard-shortcut hint for drag-reorder.

## 2. Loading & Empty States — PASS

Song search has both a "no results, create '{query}'" state and a distinct first-use "library is empty" state. Minor, non-blocking: the search input shows only a small inline `Loader`, not a section-level skeleton, on slow networks.

## 3. CSS/Styling — one pre-existing issue found, not introduced by this branch

`SimpleGrid cols={3}` at `volunteer-schedule.tsx:1402` (the Unfilled/Pending/Confirmed stat cards) has no responsive breakpoint and will not stack on mobile. **Verified during synthesis: this line is not part of this branch's diff** (`git diff main...HEAD` shows no changes to it) — it's pre-existing code, unrelated to this story. Logged as backlog, not a blocker for this PR.

## 4. Shell Navigation — PASS

Active-state detection (`usePathname()` + `isItemActive()`) and `aria-current="page"` are applied consistently; unaffected by this branch.

## 5. Error Handling — PASS

`isLikelySessionOrAuthError()` correctly distinguishes thrown auth errors from business-logic `{ok:false}` failures; the new "Sign-in required" `Alert` is a first-class UI state, not a generic toast. Existing `error.tsx` boundaries (Council Review 13) are unaffected.

## 6. Top UX Observations (non-blocking, follow-up candidates)

1. Pre-existing `SimpleGrid cols={3}` mobile-squeeze issue (see §3) — not this branch's to fix, but worth a follow-up ticket.
2. No section-level loading skeleton for song search (cosmetic).
3. No visible keyboard-shortcut hint for drag-reorder (the mechanism works and is labeled; discoverability could improve).

## 7. Branch-Specific: i18n Coverage — intentional, approved, not a defect

`volunteer-schedule.tsx` has zero `useI18n()` calls, before and after this branch. This is a deliberate, already-approved scope decision (i18n expansion is planned module-by-module as separate stories, per standing project convention) — reported for completeness, not flagged as a gap in this review.

## Summary

No blockers. One real, verified issue found (`SimpleGrid` mobile breakpoint) but confirmed pre-existing and out of this branch's diff — logged as backlog. i18n absence is a known, approved scope boundary, not a defect.
