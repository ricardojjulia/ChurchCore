# Council Review 10 — Agent 3: UX & Shell Quality Audit

**Date:** 2026-09-18
**Scope:** Whole-app audit (read-only), per `improve-software.md` §2 Phase 1 prompt, verbatim.

---

## ARIA Correctness

**Issues Found:**
- **MemberBottomNav** (`components/application/member-bottom-nav.tsx:76`): Uses `aria-label={label}` but missing `aria-current="page"` when active. Active state conveyed only via color change (line 68), failing colorblind users and screen readers.
- **AppShell NavLink** (`components/application/app-shell.tsx:249`): Uses Mantine's `active` prop (should set `aria-current` internally) but lacks explicit documentation.
- **Test gap** (`components/application/member-bottom-nav.test.tsx:49`): Tests font-weight only; missing ARIA attribute verification.

---

## Loading & Empty States

**Strengths:**
- Empty collections gracefully handled: DirectoryPanel (line 156-158), FinanceDashboard (115-134, 169-171), GivingDashboard use conditional render patterns with translated messages.

**Critical Gap:**
- **Zero Skeleton/Loader components** across `/app` and `/components/application` — no visual feedback during server-side data fetches. Users see blank pages with no loading indication.

---

## CSS/Styling Completeness

**Status: Well-handled**
- Mantine 9 CSS variable override issue fixed: `.app-shell-nav-link[data-active]` (app/globals.css lines 194-212) correctly uses `!important` on child selectors.
- Mobile responsiveness consistent: `SimpleGrid cols={{base: 1, sm: 2, md: 4}}` pattern and `AppShell breakpoint="md"` (line 123).
- `hiddenFrom="md"` used correctly on Burger (line 155).
- All CSS classes defined in `app/globals.css`.

---

## Shell Nav Active State

**Inconsistency:**
- **AppShell** (main): Uses NavLink `active` prop (delegates to Mantine CSS `[data-active]`).
- **MemberBottomNav** (mobile footer): Custom inline color logic, no `aria-current="page"`.
- Visual consistency but semantic inconsistency for accessible clients.

---

## Error Handling

- **No `error.tsx`** at app/ or layout levels reported by this agent.
- **DemoErrorBoundary** (components/demo/demo-error-boundary.tsx:55): Only logs errors; re-renders children without catching render errors.
- **No `loading.tsx`** — no skeleton fallback during server-side navigation.
- SessionTimeoutWrapper well-built (lines 92-115) but isolated from broader error framework.

> **Synthesis correction:** the "no `error.tsx`" claim above is stale. `app/global-error.tsx` (29 lines) was added in PR #139 ("feat(observability): wire Sentry + Vercel Analytics/Speed Insights", per `CHANGELOG.md`), which shipped *before* this council round — verified present on disk during synthesis. Next.js treats `global-error.tsx` as the root-level error boundary (distinct file name from `error.tsx`, same purpose); this agent's prompt asked specifically for `error.tsx` and missed the differently-named file. The **`loading.tsx` / skeleton-loader gap is real and unaddressed** — that finding stands.

---

## Top 3 UX Pain Points Users Hit Today

1. **Invisible Loading States on Server Data Fetches** — all major pages (directory, finance, giving, people admin) fetch server-side data but show no skeleton, loader, or "loading..." message. Blank page for 1–3 seconds with no feedback on slow networks. **(Confirmed still open.)**
2. **Screen Reader Users Miss Active Navigation in Mobile Footer** — MemberBottomNav changes color to show active page but doesn't set `aria-current="page"`, violating WCAG 2.1 § 2.4.8 (Location and Name). **(Confirmed still open — matches Council Review 9 Agent 3's same finding, unresolved across two rounds.)**
3. **App Crashes on Unhandled Server Errors Without Graceful Fallback** — reported as no app-level error boundary. **(Partially superseded: `app/global-error.tsx` now exists and would catch this at the root. Whether every nested route additionally needs its own `error.tsx`/`loading.tsx` for a better UX — vs. relying solely on the root boundary — is still open and worth a follow-up look, but this is not the "app crashes with zero recovery UI" scenario originally described.)**

---

**Relevant Files:**
- `/Users/rjulia/ChurchCore/components/application/member-bottom-nav.tsx` — ARIA gap
- `/Users/rjulia/ChurchCore/components/application/app-shell.tsx` — nav state patterns (line 123, 155, 249)
- `/Users/rjulia/ChurchCore/components/application/finance-dashboard.tsx` — empty state pattern (good example)
- `/Users/rjulia/ChurchCore/app/globals.css` — CSS completeness (well-maintained)
- `/Users/rjulia/ChurchCore/components/demo/demo-error-boundary.tsx` — error handling gap
- `/Users/rjulia/ChurchCore/components/application/session-timeout-wrapper.tsx` — timeout UX (solid)
- `/Users/rjulia/ChurchCore/app/global-error.tsx` — root error boundary (exists; agent's report missed it)
