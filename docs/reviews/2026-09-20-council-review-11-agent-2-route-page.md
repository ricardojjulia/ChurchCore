# Council Review 11 — Agent 2: Route & Page Audit

**Date:** 2026-09-20 | **Branch under review:** `feature/landing-page-sacred-clarity`

> Operational note: this agent's run terminated on an account-level rate limit after producing the full report below (reached its own recommendations/summary section, not a partial answer). Treated as complete for synthesis purposes.

## Landing page (`app/page.tsx`) — this branch's actual diff

- `#platform` and `#ecosystem` in-page nav anchors both resolve to real `id` attributes on their target `<Container>` sections. ✓
- All `/sign-in` CTA links resolve to the existing route. ✓
- Three `href="#"` placeholders found: the "Pricing" nav link, the "Watch the overview" secondary CTA, and the closing panel's "Talk to a ministry advisor" link. **These are intentional** — the build brief explicitly instructed linking to `#` rather than inventing dead routes, since no pricing page or video/advisor-contact flow exists yet. Non-blocking, by design; flagged here for visibility per the audit's link-consistency check.

## Whole-app findings (pre-existing, not introduced by this branch)

- **`/app/member` is referenced as the mobile home destination in `member-bottom-nav.tsx` and as a redirect target in `app/portal/page.tsx`, but no `app/app/member/page.tsx` exists.** This is a real, pre-existing 404 risk for any member tapping "Home" in the mobile bottom nav. Not touched by this branch (this branch does not modify `member-bottom-nav.tsx` or any `/app/member/*` route) — logged as a carry-forward backlog item, not a landing-page-merge blocker.
- Shell nav inventories (`app-shell.tsx`, `member-bottom-nav.tsx`, `reports-shell.tsx`) otherwise fully resolve — all sub-routes under `/app/member/*` and `/app/reports/*` exist.
- API route completeness: every client fetch/POST call found has a matching handler under `app/api/`; no orphaned handlers.

## Summary table (this branch's routes only)

| Route/anchor | Shell | Status | Notes |
|---|---|---|---|
| `/` | none (public) | EXISTS | Full rewrite this branch |
| `#platform` | — | RESOLVES | in-page anchor |
| `#ecosystem` | — | RESOLVES | in-page anchor |
| `/sign-in` | none | EXISTS | pre-existing |
| `#` (pricing, watch-overview, advisor-link) | — | PLACEHOLDER | intentional, no target page exists yet |

## Recommendation

No blocking findings against this branch. The `/app/member` 404 risk is real but out of scope for a landing-page PR — recommend a separate small-isolated-fix follow-up (either create `app/app/member/page.tsx` or repoint the mobile nav's home destination).
