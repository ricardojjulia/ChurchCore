# Factory Run: Children Day Session Lifecycle

- **Date:** 2026-05-27
- **Run ID:** children-day-session-lifecycle
- **Status:** Completed (implementation + verification)

## Intent

Start Finding 2B by introducing an explicit day-enabled children check-in session lifecycle so child check-in is not always-on and must be enabled per service day.

## Factory workflow

- Workflow used: Codex-compatible software factory (`.codex/skills/churchcore-build-with-tests`) under `AGENTS.md` discipline.
- Delivery posture: narrow vertical slice for schema, server-action enforcement, admin controls, and verification.

## Story and acceptance criteria

- Story: As a ChurchAdmin, I can enable or pause a day-specific children check-in session tied to a service.
- Story: As staff, I can check in children only when the service session is open and explicitly enabled.
- Acceptance criteria covered in this run:
  - `ccm_services` supports explicit day check-in session lifecycle states.
  - Service detail includes controls to enable and pause sessions.
  - Child check-in action rejects services where day session is not enabled.
  - Optional start/end windows are validated and stored through lifecycle action updates.

## Technical brief

### Architecture and data

- Added migration `20260527143000_ccm_day_enabled_checkin_session.sql` to extend `ccm_services` with:
  - `checkin_session_status`
  - `checkin_session_starts_at`
  - `checkin_session_ends_at`
  - `checkin_session_token`
  - `checkin_session_enabled_at`
  - `checkin_session_closed_at`
- Backfilled existing rows so currently-open services map to enabled session status and closed services map to closed session status.

### Tenant boundary and RBAC

- Session lifecycle changes remain ChurchAdmin-only via existing `requireCcmSession` role guard.
- All writes remain church-scoped in both local fallback and Supabase paths.

### Sensitive-data and audit implications

- This slice changes availability controls for child check-in workflows; it does not relax custody, pickup, or incident access boundaries.
- Session token groundwork is now available for future parent-facing day-session URL flows.

### Documentation impact

- Updated roadmap status for Finding 2B.
- Updated application guide Children section with day-session behavior.
- Updated changelog with schema/action/UI/test details.
- Added this factory-run record and tracker entry.

## Implementation summary

- Updated types and service mapping:
  - `lib/ccm-types.ts`
  - `lib/ccm-data.ts`
- Added lifecycle migration:
  - `supabase/migrations/20260527143000_ccm_day_enabled_checkin_session.sql`
- Added lifecycle action and check-in enforcement:
  - `app/app/ccm-actions.ts`
- Added lifecycle and gating tests:
  - `app/app/ccm-actions.test.ts`
- Updated children service and check-in UI behavior:
  - `components/application/ccm-service-manager.tsx`
  - `components/application/ccm-checkin-kiosk.tsx`
  - `app/app/church-admin/children/checkin/page.tsx`

## Verification

Commands executed:

1. `npm run test -- app/app/ccm-actions.test.ts app/app/member-actions.test.ts app/app/church-admin-actions.test.ts`
   - Result: Pass
2. `npm run lint`
   - Result: Pass
3. `npm run build`
   - Result: Pass

## Residual risk

- Parent-facing session-scoped URL behavior and closed-session public states are not yet implemented.
- Volunteer/room readiness gates for enabling a session are not yet enforced in this slice.

## Delivery

- Branch: `feature/member-mobile-batch-merge`
- Pull request: `#40`
- Merge method: Pending
- Final commit hash: Pending
