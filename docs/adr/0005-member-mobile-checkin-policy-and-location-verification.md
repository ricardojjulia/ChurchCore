# ADR 0005: Member Mobile Check-In Policy And Location Verification

- Status: Accepted
- Date: 2026-05-27
- Deciders: Ricardo Julia

## Context

Finding 2A in the competitive-readiness roadmap requires member self-check-in to be explicitly staff-enabled, constrained by event policy, and auditable.

The initial member check-in foundation introduced:

- event-level enablement
- check-in windows
- optional access code
- household mode
- source metadata (`mobile_member`, `staff`, `kiosk`, `import`)

A remaining competitive and security gap was on-site assurance for events that require physical presence. Existing attendance writes could not prove that a member check-in happened from an approved location.

## Decision

ChurchCore will support optional event-level geofence constraints for mobile member check-in.

When configured, member check-in is allowed only if all of the following pass server-side:

1. event mobile check-in is enabled
2. check-in window is open
3. access code validation (if configured)
4. household policy validation (if target profile differs)
5. geofence validation: device coordinates are provided and are within configured radius

The event-level geofence contract is:

- `mobile_member_check_in_location_lat`
- `mobile_member_check_in_location_lng`
- `mobile_member_check_in_location_radius_meters`

Validation rules:

- geofence fields are optional as a set
- if any geofence field is provided, all three are required
- latitude and longitude must be valid earth coordinates
- radius must be a positive integer
- runtime check-in must reject missing device coordinates when geofence is configured

## Architectural Rules

- Geofence decisions are enforced in server actions, not trusted to client-only checks.
- Client UI may request geolocation for UX, but final allow/deny remains server-side.
- Household policy and geofence policy are independent checks; both must pass.
- Geofence settings are tenant-scoped event registration settings and do not cross tenant boundaries.
- Attendance writes continue to preserve source metadata for audit review.

## Consequences

- Mobile check-in can now support events that require on-site validation.
- Browser geolocation permission becomes a user experience dependency for constrained events.
- Some legitimate attendees may fail check-in due to device/location permission issues and require staff-assisted check-in paths.
- Reporting and event-log audit views now have stronger operational context when reviewing source patterns.

## Alternatives Considered

### Client-only geofence checks

Rejected because client-only checks are bypassable and do not satisfy security posture requirements.

### Global church geofence setting

Rejected because event-level policy is needed. Some events require on-site verification while others do not.

### Hard fail all member check-ins without geolocation

Rejected because not all events need location verification and this would degrade accessibility and adoption.

## Follow-On Work

1. Add explicit security-focused tests for geofence edge cases and household+location policy combinations.
2. Extend report-level filtering and audit workflows for source/policy analysis across events.
3. Consider staff override/audit-reason flows for geofence failures where pastoral or access needs require exceptions.
