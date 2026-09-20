# Council Review 12 — Agent 3: UX & Shell Quality Audit

**Date:** 2026-09-20
**Scope:** Whole-app audit (read-only), per `improve-software.md` §2 Phase 1 prompt, verbatim. Run against `fix/webhook-dlq-finance-tests-aria-skeleton`, i.e. it saw this branch's own fixes already applied.

---

## 1. ARIA Correctness — COMPLIANT

`aria-current="page"` confirmed correctly implemented and tested in both `app-shell.tsx` (lines 252, 281, 297) and `member-bottom-nav.tsx` (line 77), both with unit test coverage verifying the attribute is set only on the active link. `PageLoadingSkeleton` has `aria-busy="true" aria-live="polite"`.

**This agent explicitly flagged a stale claim rather than repeating it**: *"Council Review 11 synthesis claims 'No aria-current on MemberBottomNav' as unaddressed from Reviews 9/10. This is inaccurate — the attribute is implemented and tested. Likely a stale carryover from an earlier audit round."* Independently corroborated during synthesis by direct `grep`.

## 2. Loading & Empty States — PARTIAL

Root-level `loading.tsx` confirmed present and correct at `app/app/`, `app/portal/`, `app/control/`, all rendering `PageLoadingSkeleton`.

**Real, new finding — not previously tracked**: no *nested* `loading.tsx` at deeper member routes (`/app/member/directory`, `/app/member/giving`, `/app/member/family`, etc.). Whether this produces a visible gap depends on Next.js's per-navigation Suspense-boundary behavior between sibling routes under a segment that has no shared `layout.tsx` — not independently re-verified live in a browser during this synthesis. Logged as a plausible refinement, not confirmed as a live regression of the loading-skeleton fix.

Empty states are handled ad hoc per component (e.g. `calendar-hub.tsx` "No upcoming events" text) rather than a shared empty-state pattern — noted as a style-consistency observation, not a functional gap.

## 3. CSS & Styling Completeness — WELL-STRUCTURED

`app/globals.css` (261 lines): custom properties, `@theme inline` Tailwind mapping, local fonts with `display: swap`. Responsive breakpoints via Mantine `SimpleGrid`/`hiddenFrom` used consistently. The documented Mantine 9 `[data-active]` CSS-variable-override fix (`feedback_mantine9_css_vars.md`) confirmed present and matching memory.

## 4. Shell Nav Active State — CONSISTENT

Both `app-shell.tsx`'s `isItemActive()` and `member-bottom-nav.tsx`'s `isActive()` implement equivalent exact/prefix/auxiliary-route matching, both driving both visual state and `aria-current`, both tested.

## 5. Error Handling — INCOMPLETE (real, new finding)

`app/global-error.tsx` exists (root-level, Sentry-reporting). **No `error.tsx` at intermediate segment levels** (`app/app/`, `app/portal/`, `app/control/`) — a thrown error in any nested server component bubbles all the way to the root boundary, losing nav context instead of recovering within that section. Recommended: `app/app/error.tsx`, `app/portal/error.tsx`, `app/control/error.tsx` with section-scoped recovery (retry, nav home).

## 6. Top 3 UX Pain Points

1. Blank screen risk on deeper member-route navigation if the nested-loading.tsx gap above is real in practice (not fully verified).
2. Cascading whole-app-level crash on a data-fetch failure in any nested route, for lack of intermediate `error.tsx` boundaries (confirmed gap).
3. Repeated a "potentially missing `/app/member` page" concern, hedged as "verify... actually exists" — **disproven during synthesis**, same as Agent 1's stronger version of the same claim. This agent's hedging language was more appropriate than Agent 1's flat assertion, but the underlying claim was still wrong.
