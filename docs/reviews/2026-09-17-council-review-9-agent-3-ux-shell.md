# Council Review 9 — Agent 3: UX & Shell Quality Audit

**Date:** 2026-09-17 · **Branch:** feat/council-2-8-and-project-hq · **Read-only audit**

## ARIA Correctness — partial compliance

- Good: `aria-label` consistent on icon buttons (burger menu, bottom nav, action buttons).
- Gap: Mantine `NavLink` `active` prop doesn't emit `aria-current="page"` — active state is CSS-only (`[data-active]`), invisible to screen readers.
- Gap: `Collapse`/`Modal`/disclosure components (`useDisclosure()`) don't sync `aria-expanded` to the DOM.
- Gap: `reports-shell.tsx` range-selector buttons use visual `variant` toggling with no `aria-pressed`.

## Loading & Empty States — empty states solid, loading skeletons absent

- Strength: comprehensive `.length === 0` empty-state messaging across finance, budget, onboarding, giving dashboards.
- Strength: `loading={isPending}` correctly used on action buttons (import workspace, delete buttons).
- Gap: no Mantine `Skeleton` loaders anywhere — data-heavy pages (member directory, people admin, finance) go straight from blank to full render.
- Gap: `custom-reports-workspace.tsx` export flow has an `isExporting` state but no loading message, and export button isn't disabled during the 1500ms window.
- Gap: no `Suspense` boundaries; server components render nothing while fetching.

## CSS/Styling — complete and consistent

All classes referenced in components are defined in `app/globals.css` (261 lines). Mantine responsive props (`SimpleGrid cols={{ base: 1, md: 3 }}`) used consistently. Missing: no explicit `:focus-visible` styling — keyboard-nav focus relies on browser defaults.

## Shell Nav Active State — mostly consistent

`app-shell.tsx` (`pathname.startsWith()`), `member-bottom-nav.tsx` (custom `isActive()` with sub-route array), and `reports-shell.tsx` (exact match) each compute active state independently but consistently. Same `aria-current` gap as above applies across all three.

## Error Handling — demo-only boundary, no production error.tsx

- `DemoErrorBoundary` only activates under `NEXT_PUBLIC_DEMO_MODE`.
- No `error.tsx` at any `app/` segment — unhandled server errors bubble to the Next.js default error page.
- Server actions generally follow a solid `try/catch` + `notifications.show()` pattern.
- `custom-reports-workspace.tsx` export catches network errors but only `console.error`s them — no user-facing failure state. (Independently, this session's `eraseTenantDataAction` hardening fixed the same silent-failure shape in the control-plane dashboard; the reports export path is a smaller, lower-severity instance of the same anti-pattern and is a good next target.)

## Top 3 UX Pain Points

1. **No loading skeletons on data-heavy pages** — blank space during cold starts reads as broken. Estimated < 1 hour to add Mantine `Skeleton` to the heaviest 3–5 tables.
2. **Active nav not announced to assistive tech** — `aria-current="page"` missing across every shell. Affects all role portals.
3. **Silent export failures** — `custom-reports-workspace.tsx` gives no feedback when a CSV export request fails.

## Recommendation

None of these block the current merge (no data-safety or auth implications) but should seed the next council's Phase 1–2 prompts. Suggested quick wins: `aria-current` wrapper for `NavLink`, `aria-expanded` binding on `useDisclosure()`, skeleton loaders on the 3–5 heaviest tables, and a `notifications.show()` error path on the custom-reports export.
