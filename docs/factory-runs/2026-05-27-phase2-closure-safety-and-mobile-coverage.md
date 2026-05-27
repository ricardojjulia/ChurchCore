# Phase 2 Closure: Session Safety Gates And Mobile Coverage

## Intent

Close the remaining high-risk Phase 2 gaps for Finding 2A and Finding 2B by enforcing children session readiness before enablement, tightening parent checkout verification, broadening mobile check-in audit visibility, and expanding mobile/role browser coverage.

## Factory Workflow

- Primary workflow: churchcore-build-with-tests
- Discipline: scoped implementation, nearby tests, docs + roadmap updates, lint/build/test verification before handoff.

## Story And Acceptance Criteria

- Children day sessions cannot be enabled unless room/volunteer readiness checks pass, or staff records an explicit audited override reason.
- Parent checkout supports stronger verification paths (PIN/QR or pickup code) and requires current guardian verification.
- Closed session links are invalidated and cannot be reused.
- Mobile member and parent route checks include role boundaries and safe unavailable states.
- Documentation and roadmap reflect the updated implementation state.

## Technical Brief

- Added a persistence layer for session-enablement override audit records and service override metadata.
- Enforced server-side readiness gating in `updateCheckinSessionLifecycleAction` using active-room and two-adult volunteer assignment coverage checks.
- Added audited override capture with reason + readiness snapshot.
- Rotated children session token on session/service close to disable stale public links.
- Extended public checkout action verification to include guardian-name checks and pickup-code validation.
- Expanded ChurchAdmin event attendance audit visibility with mobile check-in and household summary metrics.
- Maintained role boundaries and tenant-scoped data queries.

## Implementation Summary

- Added migration `supabase/migrations/20260527213000_ccm_session_readiness_overrides.sql`.
- Updated session lifecycle logic in `app/app/ccm-actions.ts`.
- Updated service controls UI in `components/application/ccm-service-manager.tsx`.
- Updated parent checkout action and UI in `app/portal/children/actions.ts` and `components/portal/children-session-actions.tsx`.
- Updated event attendance audit data/UI in `lib/church-admin-events-data.ts` and `components/application/church-admin-event-workspace.tsx`.
- Added/updated tests in `app/app/ccm-actions.test.ts`, `app/app/member-actions.test.ts`, and `tests/e2e/member-mobile-foundation.spec.ts`.
- Updated docs in `CHANGELOG.md`, `docs/portal-foundation.md`, `docs/plans/competitive-readiness-roadmap.md`, and `docs/testing-schema.md`.

## Verification

- Planned:
  - `npm run test -- app/app/ccm-actions.test.ts app/app/member-actions.test.ts lib/ccm-public-data.test.ts`
  - `npm run lint`
  - `npm run build`

## Residual Risk

- Pending-review workflow semantics for member profile/family updates still need deeper product-level treatment beyond this closure slice.
- Parent checkout pickup-code policy depends on populated `children_sensitive_data.pickup_code` values in church data.

## Delivery

- Branch: `feature/member-mobile-batch-merge`
- PR: #40
- Merge method: pending protected-branch review and merge
- Final commit: pending
