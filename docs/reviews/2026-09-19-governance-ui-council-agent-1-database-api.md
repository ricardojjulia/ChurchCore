# Council Agent 1: Database and API

## Findings

1. **High:** `scripts/audit-rls.mjs` audits only `demo_feedback` on the control-plane surface. Six other public control-plane tables can lose RLS or policies without failing CI. The audit must enumerate the full expected schema and explicitly allow the intentionally policy-free, service-role-only rate-limit table.
2. **Important:** `PATCH /api/control/demo-feedback/[id]` returns success when no row matches. Select or count the updated record and return `404` for a stale identifier.

## Verification Gaps

- Add real control-plane database tests for wrong-role denial, rate-limit concurrency, fingerprint deduplication, and reopening processed feedback.
- The GitHub CI implementation remains unproved until the branch is pushed and checks run.

No files were changed by this read-only agent.
