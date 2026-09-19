# Iglesia Agua Viva de Cayey Provisioning

**Date:** 2026-09-19
**Status:** Live tenant created and verified

## Intent

Create the Iglesia Agua Viva de Cayey client account with Jose Matos as church administrator and the standard pastor, secretary, ministry-leader, and member role shells.

## Outcome

- Tenant church ID: `0d87d8bd-92f1-4bd3-96a8-72cea9c26558`.
- Slug: `iglesia-agua-viva-de-cayey`.
- Timezone: `America/Puerto_Rico`.
- Five Supabase Auth users, profiles, and active memberships created.
- Control-plane tenant is active and its connection is ready with matching runtime routing.
- Jose uses `j7matos@gmail.com`; role shells use deliverable Gmail plus-addresses.
- Placeholder role profiles are hidden, non-contactable, and not roster eligible until replaced with real staff.
- The generated recovery record is `scripts/seed-iglesia-agua-viva-de-cayey.mjs` and contains no passwords.

## Incident and Repair

The first run exposed two stale provisioner assumptions: auth-trigger profiles had `church_id = null`, and church setup fields now live on `churches` rather than a `church_settings` table. The required Council then found unsafe rerun behavior. The shared provisioner was hardened before recording the client seed. The temporary shared password used during recovery was replaced with five distinct credentials and verified to fail afterward.

## Verification

- All five accounts signed in successfully with their distinct temporary credentials.
- Five expected application roles and active memberships were present.
- Tenant profile IDs were preserved through the hardened rerun.
- A live sentinel rerun preserved Jose's edited `Administrador Principal` title and current password, deactivated an intentionally inserted obsolete member role, and removed the test membership afterward.
- Control-plane external tenant ID and connection metadata match the runtime church ID.
- `npm test`: 128 files, 1,435 tests passed.
- `npm run lint`: no errors; seven existing warnings.
- `npm run typecheck`: passed.
- `npm run build`: passed, 118 static-generation targets.

## Follow-Up

Jose must rotate the administrator password, replace role shells with real staff identities, and complete website, mailing address, public summary, ministry, and leader setup before launch readiness.
