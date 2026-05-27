# Factory Run: Member Mobile Shell And Navigation

**Date:** 2026-05-27  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with `churchcore-build-with-tests` implementation discipline  
**Roadmap phase:** Competitive Readiness Phase 2, Harden Mobile Member Workflows  
**Status:** Delivered

## Intent

Harden the member mobile shell after the foundation audit by reducing bottom-nav density, surfacing phone-first task actions on member home, and preserving bottom-nav continuity on calendar for member users.

## Story And Acceptance Criteria

As a member using ChurchCore Ops on a phone, I want mobile navigation and first actions to be obvious, reachable, and consistent across key routes, so I can move through daily church tasks without desktop-style navigation overhead.

Acceptance criteria:

- Member mobile bottom navigation uses a phone-first primary action set.
- Touch targets in bottom navigation are larger and easier to hit.
- Member home exposes clear quick actions for schedule, groups, giving, and family.
- Member calendar route keeps bottom-nav continuity for member role.
- Tests cover bottom-nav behavior and member calendar bottom-nav rendering.
- Mobile Playwright coverage captures screenshots for member and calendar routes.
- Changelog, roadmap, README, and factory tracker are updated.

## Technical Brief

- Keep role boundaries unchanged; this run is UI/navigation hardening only.
- Use existing shell and member route structure.
- Keep full member route access through direct links, while bottom nav focuses on primary actions for phone ergonomics.
- Reuse existing Playwright member mobile baseline and attach screenshots for route-level evidence.

## Implementation Summary

Files changed:

- `components/application/member-bottom-nav.tsx`
- `components/application/member-bottom-nav.test.tsx`
- `components/application/calendar-hub.tsx`
- `components/application/calendar-hub.test.tsx`
- `components/application/member-portal-home.tsx`
- `tests/e2e/member-mobile-foundation.spec.ts`
- `lib/i18n.ts`
- `docs/plans/competitive-readiness-roadmap.md`
- `docs/factory-runs/README.md`
- `docs/factory-runs/2026-05-27-member-mobile-shell-and-navigation.md`
- `README.md`
- `CHANGELOG.md`

Patterns reused:

- Existing `ApplicationShell` bottom-nav slot behavior.
- Existing member route and role guard boundaries.
- Existing mobile Playwright baseline structure from the foundation audit run.

## Verification

- `npm run test -- components/application/member-bottom-nav.test.tsx components/application/calendar-hub.test.tsx`
- `npm run test:e2e -- tests/e2e/member-mobile-foundation.spec.ts`
- `npm run lint`
- `npm run build`
- `git diff --check`

## Residual Risk

- This run improves navigation and first-task clarity but does not complete all member mobile content hierarchy work.
- Member ministries and some detail-heavy views still need dedicated phone-first content simplification in follow-up slices.
- Member check-in eligibility and enablement logic remain deferred to the dedicated check-in foundation run.

## Delivery

- Branch: `feature/member-checkin-location-policy` (consolidated software-factory branch)
- Pull request: Not opened (local merge-commit flow used for this run batch)
- Merge: `d7a1969`
