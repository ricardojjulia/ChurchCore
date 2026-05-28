# Factory Run: Finding 4 Slice 2 Payment Visibility

Date: 2026-05-28

## Intent

Implement Slice 2 from the 30-day competitive readiness execution plan so ChurchAdmin operators can see payment state directly in event registration roster workflows.

## Architecture Impact

- Extended event registration data contract with payment fields in `lib/church-admin-events-data.ts`:
  - `paymentStatus`
  - `stripePaymentIntentId`
- Updated local fallback SQL projection to include payment-status and Stripe intent metadata.
- Updated Supabase-mapped registration payload to include payment-status and Stripe intent metadata.
- Updated ChurchAdmin event registration workspace in `components/application/church-admin-event-workspace.tsx`:
  - payment summary cards
  - payment-status filter controls
  - payment-status table column with badges
  - payment amount/intent context in row details
  - CSV export columns for payment status and paid amount

## Product Surface Updated

- Operators can filter event registrants by payment state: all, pending, paid, failed, refunded, not required.
- Event registrant rows now show payment status badge and payment context.
- Manual registrant success messaging now indicates when payment is pending.
- Event registration CSV exports now include payment status and amount paid.

## Verification Commands

Executed and passed:

- `npm run test -- app/app/member-actions.test.ts app/app/church-admin-actions.test.ts`
- `npm run lint`
- `npm run build`

## Risks And Follow-up

- Current visibility relies on registration-level payment status and intent metadata; deeper ledger/reconciliation views still belong to later slices.
- A future follow-up can add filter persistence and richer payment timeline drill-down in roster details.
