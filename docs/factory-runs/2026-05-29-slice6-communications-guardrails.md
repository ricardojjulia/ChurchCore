# Slice 6 communications guardrails and operator polish

## Intent

Reduce accidental outbound messaging errors in communications compose/send flows by enforcing dispatch guardrails at both UI and server layers.

## Factory workflow

Codex build-with-tests workflow: implement scoped behavior changes, add focused tests, then run targeted tests plus repo lint/build verification.

## Story and acceptance criteria

- As a ChurchAdmin/Pastor operator, I should not accidentally send malformed broadcasts.
- As an operator scheduling a send, I should be prevented from selecting invalid or past schedule times.
- As the system of record, communications server actions must reject invalid payloads even if the UI is bypassed.

Acceptance criteria:

- Broadcast action rejects empty body payloads.
- Broadcast action requires subject for email channel.
- Broadcast action rejects invalid/non-future `scheduledFor` values.
- Valid payloads normalize trimmed content and persist normalized future schedule timestamps.
- Compose UI provides immediate operator feedback for missing subject/invalid schedule.

## Technical brief

- Added guardrail normalization in `broadcastMessageAction` for body/subject/schedule before provider dispatch.
- Added schedule parsing helper (`normalizeScheduledFor`) to enforce parse validity + future-only timestamps.
- Added compose-side validation notifications in communications hub and minimum datetime-local selection bound to reduce operator mistakes.
- Maintained tenant/RBAC boundaries by leaving role and scope checks unchanged.

## Implementation summary

- Updated `app/app/communications-actions.ts`:
  - Added `normalizeScheduledFor` validation helper.
  - Added body and subject validation/normalization in `broadcastMessageAction`.
  - Normalized and forwarded trimmed `subject`, `body`, and ISO `scheduledFor` values to suppression-aware dispatch.
- Updated `components/application/communications-hub.tsx`:
  - Added client-side notification guardrails for missing email subject and invalid/non-future schedule time.
  - Added `min` bound to schedule input to reduce accidental past-time selection.
- Updated `app/app/communications-actions.test.ts`:
  - Added tests for missing subject rejection, non-future schedule rejection, and successful normalized broadcast.

## Verification

Commands run:

- `npm run test -- app/app/communications-actions.test.ts` ✅
- `npm run lint` ✅
- `npm run build` ✅

## Residual risk

- Compose validation uses browser-local clock; if a client clock is skewed, server-side guardrails remain the source of truth.
- This slice focuses on dispatch validation and does not yet add queued-log tab filtering or SLA escalation workflows.

## Delivery

- Branch: pending
- Pull request: pending
- Merge method: pending
- Final commit: pending
