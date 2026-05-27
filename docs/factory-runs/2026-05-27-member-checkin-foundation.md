# Factory Run: Member Check-In Foundation

- **Date:** 2026-05-27
- **Run ID:** member-checkin-foundation
- **Status:** Completed (implementation + verification)

## Intent

Implement the first production slice of Finding 2A in the competitive-readiness roadmap: event-scoped member mobile self-check-in that staff can explicitly enable, bounded by approved check-in windows, with source-aware attendance writes and duplicate prevention.

## Factory workflow

- Workflow used: Codex-compatible software factory (`.codex/skills/churchcore-feature-factory` + `.codex/skills/churchcore-build-with-tests`) under `AGENTS.md` discipline.
- Delivery posture: incremental implementation with immediate validation on touched actions/data/UI, then full repo lint/build verification.

## Story and acceptance criteria

- Story: As a church admin, I can enable mobile member check-in for an event and define its constraints.
- Story: As a signed-in member, I can self-check-in from mobile home when my event/session is eligible, and when staff enables household mode I can check in another member from my own family.
- Story: As an admin/report reviewer, I can distinguish attendance source (`mobile_member`, `staff`, `kiosk`, `import`).
- Acceptance criteria covered in this run:
  - Event-level mobile member check-in setting exists.
  - Optional start/end check-in window is enforced server-side.
  - Optional access code is enforced server-side.
  - Household-mode check-in is limited to the signed-in family.
  - Optional location geofence is enforced server-side when configured.
  - Duplicate attendance write is prevented.
  - Member home shows only eligible check-in opportunities.
  - Attendance source metadata is written and report labels are aligned.

## Technical brief

### Architecture and data

- Extended event registration settings contract with:
  - `mobile_member_check_in_enabled`
  - `mobile_member_check_in_starts_at`
  - `mobile_member_check_in_ends_at`
  - `mobile_member_check_in_access_code`
  - `mobile_member_check_in_household_mode`
  - `mobile_member_check_in_location_lat`
  - `mobile_member_check_in_location_lng`
  - `mobile_member_check_in_location_radius_meters`
- Added migration `20260527100000_member_mobile_checkin_foundation.sql` to persist settings and enforce attendance source value checks.
- Added member-side loader `lib/member-mobile-checkin-data.ts` to derive option status (`open`, `upcoming`, `checked_in`, `closed`) from event + attendance data.

### Tenant boundary and RBAC

- Member check-in action requires authenticated church session and member role.
- Action constrains writes to the active church and signed-in profile context.
- Cross-role behavior remains gated by existing action/session guards.

### Sensitive-data and audit implications

- Attendance writes now include explicit source metadata for mobile member and staff-assisted paths.
- Existing append-only attendance/event audit posture remains unchanged; this run improves attribution fidelity.

### Documentation impact

- Roadmap updated to mark Finding 2A as started with concrete implemented scope and known gaps.
- Application guide updated with member mobile shell + enabled check-in behavior.
- Changelog updated with new data/action/UI foundations.
- ADR `docs/adr/0005-member-mobile-checkin-policy-and-location-verification.md` added for household and geofence policy enforcement.
- Factory-run tracker updated with this run record.

## Implementation summary

### Data and contracts

- Updated registration settings input and persistence flow in `app/app/church-admin-actions.ts`.
- Added server-side check-in window ordering validation for mobile check-in settings.
- Added household-mode enforcement in `memberMobileCheckInAction` with same-family verification for non-self targets.
- Added location geofence enforcement in `memberMobileCheckInAction` using device coordinates when location constraints are configured.
- Extended event registration settings read model in `lib/church-admin-events-data.ts`.
- Added migration `supabase/migrations/20260527100000_member_mobile_checkin_foundation.sql`.

### Member workflow implementation

- Added `app/app/member-actions.ts` with `memberMobileCheckInAction`:
  - enablement checks
  - time-window checks
  - optional access-code check
  - household target checks
  - optional geofence checks
  - duplicate attendance check
  - attendance insert with `mobile_member` source
  - member route revalidation
- Added `lib/member-mobile-checkin-data.ts` for member-eligible check-in card data.
- Added `components/application/member-mobile-checkin-card.tsx` and wired it through:
  - `components/application/member-portal-home.tsx`
  - `app/app/[role]/page.tsx`
- Added location-aware check-in UX in `components/application/member-mobile-checkin-card.tsx` with browser geolocation prompts for constrained events.

### Admin and reporting alignment

- Updated quick check-in path in `app/app/church-admin-actions.ts` to use `staff` source metadata.
- Added source-filter controls and normalized source badges in `components/application/church-admin-event-workspace.tsx` attendance log.
- Added check-in method filter controls in `components/application/reports-dashboards.tsx` for Events Reports analysis.
- Updated report source labeling in `lib/reports-data.ts` and dictionary labels in `lib/i18n.ts`.

### Test coverage added/updated

- Added focused action tests in `app/app/member-actions.test.ts`:
  - backend-unavailable preview mode
  - disabled-event rejection
  - already-checked-in short-circuit
  - successful insert path and route revalidation
  - household target acceptance and cross-family rejection
  - geofence-required rejection without device coordinates

## Verification

Commands executed:

1. `npm run test -- app/app/member-actions.test.ts`
  - Result: Pass
2. `npm run test -- app/app/church-admin-actions.test.ts`
   - Result: Pass
3. `npm run lint`
   - Result: Pass
4. `npm run build`
   - Result: Pass

## Residual risk

- Report-level source filtering currently narrows breakdown views but does not yet cross-filter all event table summaries.
- Household policy/RLS coverage for broader family-edge scenarios should be expanded with dedicated security tests.

## Delivery

- Branch: current feature branch (local session)
- Pull request: pending
- Merge method: pending
- Final commit hash: pending
