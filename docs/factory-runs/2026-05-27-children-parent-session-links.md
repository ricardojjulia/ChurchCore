# Factory Run: Children Parent Session Links

- **Date:** 2026-05-27
- **Run ID:** children-parent-session-links
- **Status:** Completed (implementation + verification)

## Intent

Continue Finding 2B by adding parent-facing, session-scoped children check-in and checkout links with safe unavailable behavior outside enabled service windows.

## Factory workflow

- Workflow used: Codex-compatible software factory (`.codex/skills/churchcore-build-with-tests`) under `AGENTS.md` discipline.
- Delivery posture: focused extension of the day-session lifecycle slice to public portal link handling.

## Story and acceptance criteria

- Story: As staff, I can share a day-scoped parent check-in and checkout URL for a specific children service session.
- Story: As a parent, I receive a clear unavailable state when a session is not valid, not enabled, paused, closed, or outside its approved time window.
- Acceptance criteria covered in this run:
  - Session-scoped public check-in URL exists.
  - Session-scoped public checkout URL exists.
  - Public pages gate by token + session/service state.
  - Explicit safe unavailable states are shown for invalid and unavailable sessions.

## Technical brief

### Architecture and data

- Added `lib/ccm-public-data.ts` with token lookup and availability-state evaluation.
- Added unit tests in `lib/ccm-public-data.test.ts` for key unavailable-state transitions.
- Added two portal routes:
  - `/portal/children/checkin/[token]`
  - `/portal/children/checkout/[token]`
- Added reusable portal presentation component:
  - `components/portal/children-session-page.tsx`

### Tenant boundary and RBAC

- Public portal routes are intentionally non-auth session links, scoped only by opaque service token.
- Availability logic prevents exposing active workflow states when service/session gates are not met.

### Sensitive-data and audit implications

- Pages show minimal church/service metadata and state messaging only.
- No custody, child profile, incident, or pickup-sensitive data is exposed in this slice.

### Documentation impact

- Updated changelog, roadmap Finding 2B status, and application guide children section.
- Added this factory-run record and tracker row.

## Implementation summary

- Added public session data/evaluation module:
  - `lib/ccm-public-data.ts`
- Added tests:
  - `lib/ccm-public-data.test.ts`
- Added parent session pages:
  - `app/portal/children/checkin/[token]/page.tsx`
  - `app/portal/children/checkout/[token]/page.tsx`
- Added reusable UI:
  - `components/portal/children-session-page.tsx`
- Added service-detail link actions:
  - `components/application/ccm-service-manager.tsx`

## Verification

Commands executed:

1. `npm run test -- lib/ccm-public-data.test.ts app/app/ccm-actions.test.ts`
   - Result: Pass
2. `npm run lint`
   - Result: Pass
3. `npm run build`
   - Result: Pass

## Residual risk

- Parent self-service form actions for direct check-in/out submission via these links are not yet implemented.
- Session enable-time readiness gates (two-adult coverage, room readiness) still require a follow-up slice.

## Delivery

- Branch: `feature/member-mobile-batch-merge`
- Pull request: `#40`
- Merge method: Pending
- Final commit hash: Pending
