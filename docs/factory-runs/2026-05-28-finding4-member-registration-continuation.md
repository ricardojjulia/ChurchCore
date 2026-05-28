# Factory Run: Finding 4 Member Registration Continuation

Date: 2026-05-28

## Intent

Continue Finding 4 by wiring the member-facing event registration experience to the admin-configured registration schema and policy controls delivered in the previous slice.

This continuation also adds public registration route parity using the same dynamic form-field model and registration lifecycle rules.

## Architecture Impact

- Added member registration options/data loader in `lib/member-event-registration-data.ts`.
- Added member registration action in `app/app/member-actions.ts` with:
  - member role/session gating
  - household-target policy enforcement
  - duplicate-registration prevention
  - capacity and waitlist handling
  - approval-required transition to `pending_approval`
  - custom registration field payload persistence
- Wired member role route composition in `app/app/[role]/page.tsx` to load registration options.
- Extended member home composition in `components/application/member-portal-home.tsx`.
- Added new member registration UI panel in `components/application/member-event-registration-panel.tsx`.
- Added public registration options/data loader in `lib/public-event-registration-data.ts`.
- Added public registration action in `app/portal/actions.ts` with:
  - event visibility/open/deadline enforcement
  - duplicate-email registration prevention
  - capacity and waitlist handling
  - approval-required transition to `pending_approval`
  - custom registration field payload persistence
- Added public registration route and panel in `app/portal/events/register/page.tsx` and `components/portal/public-event-registration-panel.tsx`.
- Linked portal landing surface to public event registration in `app/portal/page.tsx`.

## Product Surface Updated

- Member home now shows event registration cards for open member/public events.
- Members can submit dynamic per-event registration fields configured by ChurchAdmin.
- Household registration target selection is exposed only when enabled and when household members are available.
- Registration outcomes surface status feedback: confirmed, waitlisted, or pending approval.
- Public portal now exposes an event registration route where guests can submit dynamic per-event registration fields for open public events.

## Verification Commands

Executed and passed:

- `npm run test -- components/application/member-event-registration-panel.test.tsx app/app/member-actions.test.ts app/app/church-admin-actions.test.ts`
- `npm run lint`
- `npm run build`

## Risks And Follow-up

- Custom-field type UX can be refined with richer input affordances and contextual helper text.
- Payment-linked registration records for paid events remain in later Finding 4 slices.
