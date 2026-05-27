# Release Summary: Member Mobile Competitive Readiness Batch

**Date:** 2026-05-27  
**Scope:** Member mobile PWA foundation audit, member mobile shell/navigation hardening, member check-in foundation including household and geofence policies  
**Software-factory branch:** `feature/member-checkin-location-policy`  
**Merge commit:** `d7a1969`

## Included Factory Runs

- [Member mobile PWA foundation audit](2026-05-27-member-mobile-pwa-foundation-audit.md)
- [Member mobile shell and navigation](2026-05-27-member-mobile-shell-and-navigation.md)
- [Member check-in foundation](2026-05-27-member-checkin-foundation.md)

## What Shipped

- Phone-first member baseline and route audit documentation.
- Member shell/navigation hardening and calendar continuity.
- Event-level member self-check-in foundation with:
  - enable toggle
  - check-in window
  - optional access code
  - household mode
  - optional geofence constraints
- Attendance source metadata normalization and admin/report filters for operational audit.
- ADR for mobile check-in household/geofence policy:
  - [ADR 0005](../adr/0005-member-mobile-checkin-policy-and-location-verification.md)

## Verification Evidence

Validated during the run batch:

- `npm run test -- app/app/member-actions.test.ts app/app/church-admin-actions.test.ts`
- `npm run lint`
- `npm run build`

## Delivery Notes

- This batch was merged locally to `main` using a non-fast-forward merge commit for traceability.
- No GitHub pull request number is associated with this batch.
