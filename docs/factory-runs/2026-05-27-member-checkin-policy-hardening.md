# Factory Run: Member Check-In Policy Hardening

- **Date:** 2026-05-27
- **Run ID:** member-checkin-policy-hardening
- **Status:** Completed (implementation + verification)

## Intent

Close the immediate Finding 2A hardening gaps after the initial member check-in foundation by tightening geofence validation guardrails and improving ChurchAdmin policy audit visibility for mobile member check-in settings.

## Factory workflow

- Workflow used: Codex-compatible software factory (`.codex/skills/churchcore-build-with-tests`) under `AGENTS.md` discipline.
- Delivery posture: focused hardening slice on existing member-check-in foundations with direct regression tests and full repo validation gates.

## Story and acceptance criteria

- Story: As a ChurchAdmin, I can quickly inspect which mobile member check-in policy constraints are currently active for an event.
- Story: As an operator, I can trust geofence checks to reject invalid coordinate payloads and out-of-range check-in attempts.
- Acceptance criteria covered in this run:
  - Invalid member device coordinates are rejected server-side before distance evaluation.
  - Out-of-radius location attempts are rejected server-side.
  - Household target check-ins are rejected when household mode is disabled.
  - ChurchAdmin registration settings show a policy-audit summary for enabled/window/code/household/geofence constraints.

## Technical brief

### Architecture and data

- No schema changes were required.
- Hardening was implemented in member check-in server action validation logic.
- Audit visibility was added in existing event registration settings UI.

### Tenant boundary and RBAC

- Existing tenant church/session constraints remain unchanged.
- No new role paths were introduced.

### Sensitive-data and audit implications

- Location policy checks now reject malformed coordinates instead of relying only on distance calculations.
- Policy status is clearer to ChurchAdmin operators in the event registration settings pane.

### Documentation impact

- Changelog updated with hardening + admin audit visibility notes.
- Factory run tracker updated with this run record.

## Implementation summary

- Updated geofence validation in `app/app/member-actions.ts`:
  - reject non-finite coordinates
  - reject latitude outside `[-90, 90]`
  - reject longitude outside `[-180, 180]`
- Extended check-in policy tests in `app/app/member-actions.test.ts`:
  - household-target rejection when household mode is disabled
  - invalid coordinate rejection
  - out-of-radius rejection
- Added policy-audit summary badges to `components/application/church-admin-event-workspace.tsx` within registration settings.

## Verification

Commands executed:

1. `npm run test -- app/app/member-actions.test.ts app/app/church-admin-actions.test.ts`
   - Result: Pass
2. `npm run lint`
   - Result: Pass
3. `npm run build`
   - Result: Pass

## Residual risk

- RLS-level negative-path tests for broader family-edge cases are still a follow-up item under Finding 2A.
- Source-filtered reporting remains stronger at event-level operations than at every aggregate report slice.

## Delivery

- Branch: `feature/member-mobile-batch-merge`
- Pull request: `#40`
- Merge method: Pending
- Final commit hash: Pending
