# Council Review 30 — Agents 1–4 (S3: `/api/reports/custom`)

**Scope:** `fix/reports-custom-s3`, commit `eecd19e` vs `main`, diff-scoped. Four distinct `codebase-researcher` agents (read-only by tool access). The orchestrator checked the claims below against source.

## Agent 1 — Database & API

- **Verified:**
  - Pastor and church admin pass `can_manage_church` on `profiles`, `donations` and `events`, so the export is complete. e2e confirms people, events and giving all export for a pastor.
  - Paging has no off-by-one, and its order (column, then `id`) is stable.
  - The audit actor is `session.userId`, the login id, which is correct for `audit_log.actor_id`.
- **Verified:** the export includes `donor_name`/`donor_email` for `is_anonymous` gifts. The orchestrator found the stronger contrast: the app's own giving screens show "Anonymous" in place of the donor, even to church admins (`components/application/giving-dashboard.tsx:187`, `components/application/giving-analytics.tsx:100`). The export is the only surface that reveals them.
- **Verified:** RLS would let a ministry leader read donations, while the route and page deny them. The security matrix doesn't list this endpoint.

## Agent 2 — Routes & Pages

- **Verified by an orchestrator sweep:** only three API routes call a redirecting session helper:
  - `/api/reports/custom`: fixed, the call is outside the `try`;
  - `/api/control/db-health`: inside a `try`, but re-throws `NEXT_REDIRECT`;
  - `/api/control/demo-feedback/[id]`: outside any `try`.

  No repo-wide sweep is needed.
- **Verified:** every remaining `queryTenantLocalDb` call is inside a `shouldUseLocalTenantFallback()` branch, which is hard-coded false.
- **Verified:** `custom-reports-workspace.tsx` downloads through a bare `<a download>`. A 403, 500 or sign-in redirect shows the user nothing, and an error body or sign-in page can be saved as the "CSV".

## Agent 3 — UX & Shell

- **Verified:**
  - Failed exports give no feedback (same as above).
  - An empty export is a 0-byte file with no header row (`jsonToCsv([])` returns `""`).
  - The entity-selector cards are mouse-only: `Card` with `onClick`, no role, `tabIndex` or key handling.
  - The page is hard-coded English.
  - The giving CSV has `amount_cents` and raw ISO timestamps.

## Agent 4 — Feature & Competitive

- **Verified:** every item of S3's definition of done is met.
- **Agreed:** readiness stays at 76/100. S3 is a safety fix, not a gap closer.
- **Raised for the owner:** pastors exporting donor PII.
- **Wrong:**
  - "The export includes donor name and email for all *non-anonymous* donations": it includes them for all donations, anonymous ones too.
  - "e2e covers church-admin → 200": only the pastor export is exercised end to end.
  - The CI check names it listed don't exist.
  - Competitor behavior was stated as inferred, which is correct.
