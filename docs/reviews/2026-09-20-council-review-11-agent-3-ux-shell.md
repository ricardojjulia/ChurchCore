# Council Review 11 — Agent 3: UX & Shell Quality Audit

**Date:** 2026-09-20 | **Branch under review:** `feature/landing-page-sacred-clarity`

> Operational note: this agent's run terminated on an account-level rate limit after producing the full report below (reached its own summary section, not a partial answer). Treated as complete for synthesis purposes.

## Landing page (`app/page.tsx`) — findings introduced by this branch

**Color contrast (WCAG AA, 4.5:1 minimum for normal text, 3:1 for large/bold ≥18.66px):**

| Token | Value | On `#0D1B2A` | Result |
|---|---|---|---|
| TEXT_PRIMARY | `#F0EBE0` | ~13.8:1 | ✅ Pass |
| TEXT_BODY | `rgba(232,224,208,0.68)` | ~6–7:1 | ✅ Pass |
| **TEXT_MUTED** | `rgba(232,224,208,0.45)` | **~2.5–3:1** | ❌ **Fails.** Used for stat labels, card captions, muted timestamps/details — small text throughout the page. |
| **GOLD** | `#C9A227` | **~4.3:1** | ⚠️ **Borderline fail** for the small (11–13px) bold eyebrow/trend text it's used on — falls just short of the 4.5:1 needed at that size (WCAG's 3:1 "large text" exception only applies at ≥18.66px bold, which these labels are well under). |

**Interactive elements:**
- The "Watch the overview" play-button affordance is 40×40px — under the 44×44px minimum recommended touch target.
- Buttons rely on Mantine's default `:focus` styling; no explicit custom focus state, which is consistent with the rest of the app (not a regression specific to this page).

**Layout:**
- The hero's floating stat-tile row (`SimpleGrid cols={2}`, no responsive prop) is hardcoded to 2 columns at all breakpoints — will not stack on narrow phone widths, unlike the rest of the page's responsive `SimpleGrid` usage (feature cards, ecosystem cards, bottom strip all have `base/sm/md` breakpoints).

**Heading hierarchy:** Correct — one real `<h1>` (hero), `<h2>`s for section headings, `<h3>`s for card titles. No skipped levels. ✅

**Localization:** All copy runs through `useI18n()`/`publicHome`; no hardcoded strings found. ✅

## Whole-app findings (pre-existing, not introduced by this branch — repeats of Council Reviews 9 & 10)

- No `aria-current="page"` on `MemberBottomNav`'s active item.
- Zero `loading.tsx` files anywhere under `/app`; no loading skeleton/Mantine `Loader` during server-side data fetches.
- No layout-level `error.tsx` files (only the root `app/global-error.tsx`, shipped in PR #139).

## Top issues specific to this branch (actionable before merge)

1. **TEXT_MUTED contrast failure** — real WCAG AA regression, affects several small-text elements on the new page.
2. **GOLD-on-dark borderline contrast** for small eyebrow/trend text.
3. **Hero stat-card grid doesn't stack on mobile** (`cols={2}` with no `base` breakpoint).
4. **Play-button touch target under 44×44px.**

## Summary

The redesign is structurally sound (correct heading hierarchy, full localization, consistent card patterns) but introduces one clear accessibility regression (TEXT_MUTED contrast), one borderline one (GOLD on small text), and one mobile-layout gap (hardcoded 2-column stat grid) that weren't present on the previous minimal landing page. None crash the page or block core navigation, but all three are real, fixable defects in the new code, not pre-existing app-wide debt.
