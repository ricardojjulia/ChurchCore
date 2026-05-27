# Member Mobile PWA Foundation Audit

**Status:** Active implementation brief  
**Date:** 2026-05-27  
**Roadmap phase:** Competitive Readiness Phase 2, Harden Mobile Member Workflows  
**Related roadmap:** [competitive-readiness-roadmap.md](competitive-readiness-roadmap.md)

## Purpose

This audit is the first execution run for Phase 2. It evaluates the current member experience at phone viewport sizes before adding new check-in behavior. The goal is to prevent check-in from being built into a surface that is not yet intentionally phone-first.

## Scope Audited

- `/app/member`
- `/app/member/directory`
- `/app/member/family`
- `/app/member/groups`
- `/app/member/giving`
- `/app/member/schedule`
- `/app/member/ministries`
- `/app/member/data-rights`
- `/app/calendar`

## Intended Mobile/PWA Workflow Order

1. Mobile home dashboard
2. Personal schedule and calendar commitments
3. Groups and community participation
4. Directory and privacy visibility controls
5. Giving history and recurring visibility
6. Family and profile updates
7. Notification preferences
8. Member self-check-in entry point when enabled by staff

## Current Route Audit (Phone Viewport)

| Route | Current state | Mobile safety verdict | Notes |
| --- | --- | --- | --- |
| `/app/member` | Card-based member home with profile, family, directory, events, attendance, serving widgets, and bottom nav. | Mobile-safe with hardening follow-up | Good baseline structure; needs stronger task priority and tighter first-action ordering. |
| `/app/member/schedule` | Assignment list with confirm/decline actions and modal decline flow. | Mobile-safe with hardening follow-up | Action controls are usable but need more explicit phone-first spacing and response-state emphasis. |
| `/app/member/groups` | Group cards with join requests and status alert. | Mobile-safe with hardening follow-up | Strong card pattern; should add clearer join-request state and leader approval expectations. |
| `/app/member/directory` | Search/filter card list with privacy-aware contact rendering. | Mobile-safe with hardening follow-up | Works on mobile; privacy controls need more obvious user-facing language. |
| `/app/member/family` | Household summary and member list with edit entry. | Mobile-safe with hardening follow-up | Flow is clear but should move high-frequency actions higher for thumb reach. |
| `/app/member/giving` | Donor portal shell with giving history entry point. | Needs hardening | Needs explicit mobile-first giving timeline and recurring management affordance focus. |
| `/app/member/ministries` | Membership cards and all-ministries list in one screen. | Needs redesign | Dense and desktop-leaning for member phone usage; requires tighter hierarchy and member task cards. |
| `/app/member/data-rights` | Privacy panel inside member shell. | Needs hardening | Functional, but requires clearer success/pending/rejected state treatment and member task framing. |
| `/app/calendar` | Shared calendar board with role-aware metrics and approvals. | Needs redesign for member-mobile intent | Works technically on phone, but content hierarchy is not member-first and lacks member bottom-nav continuity. |

## Role-Access Baseline Expectations

Member mobile routes should remain member-scoped and deny ChurchAdmin-only routes even at phone viewport sizes. The baseline browser coverage added in this run includes a mobile denied-route check for a ChurchAdmin-only path.

## First Implementation Slices

### Slice 1: Mobile Home

- Reorder member home content by weekly action priority.
- Add compact action cards for schedule, giving, groups, and family updates.
- Improve first-screen readability and thumb-reach placement.

### Slice 2: Schedule

- Present events, volunteer assignments, and RSVP state in one phone-first timeline.
- Improve confirmation and decline status clarity after action.

### Slice 3: Groups

- Harden join/request status messaging.
- Clarify pending, accepted, and rejected membership states.

### Slice 4: Directory And Privacy

- Keep directory browse optimized for search and contact privacy.
- Add clearer privacy copy around contact visibility and opt-in.

### Slice 5: Giving History

- Add mobile-first giving timeline summary.
- Prioritize recurring-giving visibility and donor confirmation states.

### Slice 6: Family And Profile Updates

- Keep edits inline or near-inline where possible.
- Standardize saved, pending-review, and rejected state messaging.

### Slice 7: Notification Preferences

- Keep a single mobile settings entry for email/SMS/push/in-app preference state.
- Emphasize consent-aware messaging and change confirmation.

### Slice 8: Member Self-Check-In Entry Point

- Add an entry surface only for staff-enabled sessions.
- Keep state explicit: unavailable, upcoming window, open, closed.
- Defer data contract and eligibility rules to the dedicated check-in foundation run.

## Baseline Browser Coverage Added In This Run

- New phone-sized Playwright coverage for member routes and `/app/calendar`.
- Baseline check for member mobile role-access denial on ChurchAdmin-only readiness route.

## Next Run Sequence

1. `member-mobile-shell-and-navigation`
2. `member-check-in-foundation`
