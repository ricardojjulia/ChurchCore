# Factory Run: Children Parent Self-Service Submissions

- **Date:** 2026-05-27
- **Run ID:** children-parent-self-service-submissions
- **Status:** Completed (implementation + verification)

## Intent

Move Finding 2B beyond URL state scaffolding by enabling real parent self-service check-in and checkout submissions behind session-scoped children links.

## Factory workflow

- Workflow used: Codex-compatible software factory (`.codex/skills/churchcore-build-with-tests`) under `AGENTS.md` discipline.
- Delivery posture: extend parent session links with guarded write actions and portal form UX.

## Story and acceptance criteria

- Story: As a parent with a valid session link, I can submit child check-in for an enabled day session.
- Story: As a parent with a valid session link, I can submit child checkout by providing claim credentials.
- Acceptance criteria covered in this run:
  - Parent check-in submissions are token-scoped and require valid room + service session availability.
  - Parent checkout submissions are token-scoped and verify PIN or claim token before checkout.
  - Submissions are blocked with explicit errors when session availability is not `available`.
  - Portal pages render interactive forms only when the day session is available.

## Technical brief

### Architecture and data

- Added server action module `app/portal/children/actions.ts` for parent check-in and checkout submissions.
- Extended `lib/ccm-public-data.ts` to include room/session options and availability-guarded token context for submissions.
- Added client form component `components/portal/children-session-actions.tsx` for both mode-specific workflows.
- Updated token pages to load required room/session data when available.

### Tenant boundary and RBAC

- Parent routes remain public but strictly token-scoped per service session.
- Actions validate active service/session availability and church-scoped room/session ownership before writes.

### Sensitive-data and audit implications

- Checkout verification still requires PIN (or claim token) before status transitions.
- No custody-restriction bypass behavior was introduced in this slice.

### Documentation impact

- Updated changelog, roadmap Finding 2B status, and application guide.
- Added this factory run record and tracker entry.

## Implementation summary

- Added parent submission actions:
  - `app/portal/children/actions.ts`
- Added parent submission forms:
  - `components/portal/children-session-actions.tsx`
- Updated public data/context helpers:
  - `lib/ccm-public-data.ts`
  - `lib/ccm-public-data.test.ts`
- Updated route pages and session UI:
  - `app/portal/children/checkin/[token]/page.tsx`
  - `app/portal/children/checkout/[token]/page.tsx`
  - `components/portal/children-session-page.tsx`

## Verification

Commands executed:

1. `npm run test -- lib/ccm-public-data.test.ts app/app/ccm-actions.test.ts`
   - Result: Pass
2. `npm run lint`
   - Result: Pass
3. `npm run build`
   - Result: Pass

## Residual risk

- Parent session links currently use opaque token scoping but are not yet paired with rate limiting or anti-automation controls.
- Next slice should add additional child safety checks on parent checkout (for example custody constraints and session-specific guardian authorization lookup).

## Delivery

- Branch: `feature/member-mobile-batch-merge`
- Pull request: `#40`
- Merge method: Pending
- Final commit hash: Pending
