# Council Agent 3 — UX & Shell Quality Audit

**Branch audited:** `fix/error-boundaries-finance-tests-member-route`

## 1. ARIA Correctness — unchanged, previously fixed

`aria-current="page"` set on active nav links in `ApplicationShell` and `MemberBottomNav`; `aria-busy="true"` + `aria-live="polite"` on `PageLoadingSkeleton`. Not touched by this branch; no regressions found.

## 2. Loading and Empty States — unchanged

`loading.tsx` wired at `app/app`, `app/portal`, `app/control` (Council Review 12). **Still-open, deferred gap, unchanged by this branch:** no nested `loading.tsx` in deeper subroutes (e.g. `/app/member/family/*`) — a data fetch there shows a blank page rather than a skeleton until the segment resolves.

## 3. CSS/Styling — unchanged, complete

Not touched by this branch.

## 4. Shell Nav Active State — unchanged, consistent

Not touched by this branch.

## 5. Error Handling — improved this branch, one gap remains

**New on this branch:**
- `components/application/page-error-boundary.tsx` — shared client component, reports to Sentry (`Sentry.captureException`), renders a Mantine `Alert` with a "Try again" button wired to Next's `reset()`.
- `app/app/error.tsx`, `app/portal/error.tsx`, `app/control/error.tsx` — each a thin wrapper delegating to `PageErrorBoundary`, following the same convention already used for `loading.tsx` at the same three roots.
- `components/application/page-error-boundary.test.tsx` — verifies Sentry reporting on mount and that clicking "Try again" calls `reset()`.

This closes the specific finding from Council Review 9/10/12 ("only `app/global-error.tsx` exists, no scoped error.tsx anywhere").

**Remaining gap, deferred and non-blocking:** no error.tsx below these three root segments. An error in a deep route like `/app/church-admin/finance/accounts/[id]` is now caught by `app/app/error.tsx` (previously it would have hit `app/global-error.tsx`) — an improvement, but it still loses the surrounding feature-area chrome (nav, breadcrumbs) rather than recovering in place. This was flagged as plausible-but-unverified in Review 12; now verified: it is real, and still open.

## 6. Top 3 UX Pain Points a Real User Would Hit Today

1. **Nested-route errors still lose feature-area context.** An error inside `/app/church-admin/finance/accounts/[id]/edit` now shows a styled, Sentry-reported retry screen instead of a blank crash — a real improvement — but the user still loses their place in the finance section rather than seeing a recoverable in-place error.
2. **Deep member-portal navigation shows a blank page during fetch**, unchanged from Review 12 — no nested `loading.tsx` below the three root segments.
3. **Phone-first mobile UX gaps**, unchanged from Review 9–12 — out of scope for this branch.

## Note on this branch's finance-import framing

Agent 1 read the source and did not find a separate "GL auto-posting background process" beyond `postJournalAction`'s status flip; the new `finance-actions.test.ts` tests directly assert the debit/credit `finance_journal_lines` rows a committed import produces. Deferring to Agent 1's source-verified account for the finance/GL characterization in the synthesis rather than restating the "batch-commit/GL-posting... untested" framing verbatim — see the synthesis for the resolution.
