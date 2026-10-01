# Council Review 30 — Synthesis (S3: `/api/reports/custom`)

**Branch:** `fix/reports-custom-s3` (`eecd19e`) vs `main`. Diff-scoped, four distinct read-only agents (`2026-10-01-council-review-30-agents-1-4.md`).

## Verdict

**S3 meets its definition of done.**
- Signed-out callers get a 307 to `/sign-in`, not a 500.
- The export reads through the caller's own Supabase client (RLS), not a direct pool.
- The events export works (real `starts_at`/`ends_at` columns).
- It pages past 1,000 rows.

No other route needs the redirect fix, and no unguarded direct-pool read remains.

## Wrong claims (3, all from Agent 4)

1. It said donor PII is in the export only for non-anonymous gifts; it's in for all of them.
2. It said e2e covers church-admin exports; only the pastor's.
3. The CI check names it listed don't exist.

## Proposed changes (owner decision)

| # | Finding | Proposal |
|---|---|---|
| 1 | **Anonymous donors are revealed** by the giving export, though every giving screen shows "Anonymous", even to church admins. | **Mask** `donor_name`/`donor_email` for `is_anonymous` gifts in the export, matching the app. Year-end statements (G3.3) get donor identity through their own path. |
| 2 | Failed exports give no feedback; an error body or sign-in page can be saved as the CSV. | Download with `fetch`, check the status, and show an error. |
| 3 | An empty export is a 0-byte file. | Always write the header row. |
| 4 | Entity cards are mouse-only. | Make them keyboard-operable buttons. |
| 5 | The page is hard-coded English. | New tracker row (Should), with the rest of the reports pages if they're the same. |
| 6 | The security matrix doesn't list the export endpoint (pastor and church admin; the app denies ministry leaders, who RLS would admit). | Documenter. |

Pastors keep the giving export: they already see the giving report with non-anonymous donor names (`/app/giving`).

## Readiness

Unchanged at **76/100**.
