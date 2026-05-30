# Factory Run: Wave A3 Registration/Payments Hardening

Date: 2026-05-30
Owner: Product + Engineering
Slice: A3 (event registration/payment lifecycle hardening)
Branch: feature/wave-a-a3-registration-payments-hardening

## Intent

Move registration payment lifecycle handling from duplicated branch logic to deterministic shared behavior across ChurchAdmin, member, and public registration entry points, and strengthen operator visibility for unresolved payment follow-up.

## Architecture Impact

- Added shared registration lifecycle utilities:
  - `lib/event-registration-lifecycle.ts`
  - `resolveRegistrationLifecycle` (status + payment defaults)
  - `normalizeRegistrationPaymentStatus` (loader-side consistency for legacy/inconsistent rows)
- Refactored registration writes to use shared lifecycle logic:
  - `app/app/church-admin-actions.ts`
  - `app/app/member-actions.ts`
  - `app/portal/actions.ts`
- Strengthened ChurchAdmin payment visibility:
  - `lib/church-admin-events-data.ts` now normalizes payment status during registration mapping
  - `components/application/church-admin-event-workspace.tsx` adds payment follow-up filter + summary card

## Tests Added/Updated

- Updated:
  - `app/app/church-admin-actions.test.ts`
  - `app/app/member-actions.test.ts`
- Added:
  - `app/portal/actions.test.ts`
  - `lib/event-registration-lifecycle.test.ts`

## Verification Commands

1. `npm run test -- app/app/member-actions.test.ts app/app/church-admin-actions.test.ts app/portal/actions.test.ts lib/event-registration-lifecycle.test.ts`
- Result: Passed (`4` files, `47` tests)

1. `npm run lint`
- Result: Passed

1. `npm run build`
- Result: Passed (Next.js production build completed successfully)

## Residual Risks

- Payment follow-up filter is currently based on `pending` + `failed` for active, non-waitlisted registrations. Additional status semantics may be needed if provider-side states expand.
- Loader normalization keeps historical data usable in UI but does not backfill stored rows yet.

## Follow-up Work

- Add a backfill migration for legacy `event_registrations.payment_status` rows if historical audit consistency is required.
- Add component-level tests for ChurchAdmin registration payment filters after event workspace test scaffolding is introduced.
