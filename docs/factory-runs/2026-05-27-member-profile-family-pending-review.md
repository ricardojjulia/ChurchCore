# Factory Run: Member Profile/Family Pending Review Foundation

Date: 2026-05-27

## Intent

Complete the next Phase 2 acceptance gap for member profile/family updates by enforcing a pending-review workflow rather than direct canonical writes, then surface member-visible review states on mobile screens.

## Scope Delivered

- Added migration `supabase/migrations/20260527234500_member_change_requests_pending_review.sql`:
  - `member_change_requests` table with `pending/approved/rejected` status model
  - church/profile scoping indexes and unique pending-request guard by `(church_id, target_profile_id, change_type)`
  - RLS policies for member self-service create/read and manager review updates
- Updated member self-service actions in `app/app/actions.ts`:
  - `updateMemberProfileAction` now queues/replaces pending profile requests
  - `upsertMemberFamilyAction` now queues/replaces pending family requests
  - Added `reviewMemberChangeRequestAction` for ChurchAdmin approve/reject with optional reviewer note
  - Approve path applies canonical `profiles/profile_sensitive_fields/families` writes and consent-log entries
- Updated member portal data loader in `lib/member-portal-data.ts`:
  - returns profile/family review statuses and reviewer notes
  - local fallback remains resilient when migration table is missing
- Updated ChurchAdmin people data and workspace to support pending member-change review operations:
  - `lib/church-admin-people-data.ts` now returns pending profile/family change request queue entries and summary counts (migration-safe fallback when table is unavailable)
  - `components/application/church-admin-people-workspace.tsx` now renders a dedicated review queue with approve/reject controls wired to `reviewMemberChangeRequestAction`
- Updated member UI to display review states:
  - `components/application/member-portal-home.tsx`
  - `components/application/member-family-workspace.tsx`
  - submit feedback in `components/application/member-profile-edit.tsx` and `components/application/member-family-edit.tsx`
- Added focused tests for pending-review behavior:
  - `app/app/actions.test.ts` covers approve/reject review decisions and canonical write gating
  - `lib/church-admin-people-data.test.ts` covers pending review queue mapping and summary counts
  - `lib/member-portal-data.test.ts` covers member pending/rejected state rendering and migration-safe fallback
- Updated docs:
  - `docs/plans/competitive-readiness-roadmap.md`
  - `docs/testing-schema.md`
  - `CHANGELOG.md`

## Verification

Commands run:

```bash
npm run test -- app/app/actions.test.ts lib/church-admin-people-data.test.ts lib/member-portal-data.test.ts
npm run test:e2e -- tests/e2e/member-mobile-foundation.spec.ts
npm run lint
npm run build
```

Results:

- Targeted unit tests passed (`11/11` across actions + loader coverage).
- Targeted mobile browser suite passed (`5/5` in `tests/e2e/member-mobile-foundation.spec.ts`).
- Lint passed.
- Production build passed.

## Residual Risk

- Supabase-branch integration tests for `reviewMemberChangeRequestAction` still need explicit coverage; current action tests focus on local fallback behavior.
- Reviewer-note entry UX is currently optional and not yet surfaced as a required moderation narrative in the ChurchAdmin queue.
