# Factory Run: Children Parent Session Security Hardening

- **Date:** 2026-05-27
- **Run ID:** children-parent-session-security-hardening
- **Status:** Completed (implementation + verification)

## Intent

Harden the new parent session self-service flow with anti-abuse and child-safety controls before wider rollout.

## Factory workflow

- Workflow used: Codex-compatible software factory (`.codex/skills/churchcore-build-with-tests`) under `AGENTS.md` discipline.
- Delivery posture: security-focused extension of the parent submission slice.

## Story and acceptance criteria

- Story: As an operator, I can trust that parent session links are not brute-force friendly and expire safely.
- Story: As children ministry staff, I can trust checkout blocks custody-restricted names and non-authorized pickup names.
- Acceptance criteria covered in this run:
  - Failed-attempt rate limiting is enforced on parent check-in and checkout submissions.
  - Submission attempts are audit-logged in a dedicated table keyed by service, token hash, and request fingerprint.
  - Parent checkout enforces custody restriction name blocking.
  - Parent checkout enforces authorized pickup name matching when pickup records exist.
  - Enabled sessions without explicit end windows expire by policy.

## Technical brief

### Architecture and data

- Added migration `20260527191000_ccm_public_session_attempts.sql`:
  - `ccm_public_session_attempts` table
  - indexes for rate-window queries
  - RLS + manager policy
- Added request fingerprint and session token hashing in portal children actions.
- Added failed-attempt counting and attempt logging for check-in and checkout flows.
- Added policy-level session expiry (`session-expired`) in public session availability evaluation.

### Tenant boundary and RBAC

- Parent routes remain public token-scoped links.
- New attempt records are church-scoped and service-scoped.
- Child-sensitive checkout constraints are enforced server-side before status transitions.

### Sensitive-data and audit implications

- Custody and authorized-pickup constraints now influence parent checkout outcomes.
- Attempt metadata is hashed for token/fingerprint before persistence.

### Documentation impact

- Updated changelog, roadmap Finding 2B status, and application guide with hardening behavior.
- Added this factory-run record and tracker row.

## Implementation summary

- Security hardening logic:
  - `app/portal/children/actions.ts`
- Public availability expiry updates:
  - `lib/ccm-public-data.ts`
  - `lib/ccm-public-data.test.ts`
- DB migration for rate-limit attempt tracking:
  - `supabase/migrations/20260527191000_ccm_public_session_attempts.sql`

## Verification

Commands executed:

1. `npm run test -- lib/ccm-public-data.test.ts app/app/ccm-actions.test.ts`
   - Result: Pass
2. `npm run lint`
   - Result: Pass
3. `npm run build`
   - Result: Pass

## Residual risk

- Current rate limiting is per token/fingerprint window and does not yet include IP reputation or global tenant-level quotas.
- Authorized-pickup matching currently uses normalized full-name equality; future slices can add stronger identity verification signals.

## Delivery

- Branch: `feature/member-mobile-batch-merge`
- Pull request: `#40`
- Merge method: Pending
- Final commit hash: Pending
