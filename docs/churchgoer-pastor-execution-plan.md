# Churchgoer And Pastor Execution Plan

This document defines the next implementation slice for ChurchCore people data and role-facing screens. It is aligned to:

- `DEVELOPMENT_PLAN.md`
- `docs/plans/churchgoer-data.md`
- `docs/plans/advanced-ministry-elders-pastor.md`

## Purpose

The current repo has the beginnings of a member portal and church-scoped profile hydration, but the people model is still thinner than the product direction requires. This plan closes the immediate gap by making churchgoer data and pastor-facing data real enough to support the next generation of directory, ministry, and leadership work.

## Why This Slice Now

ChurchCore cannot deliver credible ministry intelligence, pastor workflows, or leadership collaboration while member and pastor records remain shallow. The people layer is the dependency beneath:

- Directory and family experiences
- Ministry assignment and visibility
- Pastor and elder identity
- Pastoral follow-up workflows
- Volunteer matching
- Future AI guardrails and insight layers

## Scope

This execution slice covers four concrete outcomes:

1. Complete the next churchgoer schema extensions needed for self-service and consent-aware people data.
2. Add a real churchgoer portal entry path and enrich the member-facing screen with family and directory context.
3. Add a pastor-specific workspace backed by actual tenant profile and ministry data rather than the generic role shell.
4. Document the resulting routes, constraints, and remaining follow-up.

## Execution Phases

### Phase 1: Schema Completion

- Extend `profiles` with low-risk churchgoer fields still missing from the current migration direction.
- Add `consent_logs`.
- Keep every addition church-scoped and RLS-aware.

### Phase 2: Churchgoer Portal Foundation

- Add `/portal` as the dedicated member entry route.
- Keep `/app/member` as the active member workspace.
- Enrich the member surface with:
  - family context
  - directory context
  - stronger profile visibility
  - richer self-service framing

### Phase 3: Pastor Data And Screen Foundation

- Add a pastor-facing data loader.
- Replace the pastor role’s generic shell with a real pastor workspace.
- Include:
  - pastoral identity
  - led ministries
  - directory summary
  - follow-up list derived from member records

### Phase 4: Documentation And Verification

- Update README and changelog
- Update portal docs
- Run `npm run lint`
- Run `npm run build`

## Delivered In This Execution Slice

The code change tied to this plan is expected to deliver:

- `consent_logs` table and remaining lightweight people fields
- `/portal` route
- enhanced member portal data and screen
- member directory panel
- pastor portal data and screen

## Next Execution Slice

The immediate next slice after the delivered foundation is now defined as:

1. dedicated member directory route
2. member family self-service flow
3. pastor people route with fuller directory visibility
4. documentation updates and verification

## Explicit Non-Goals

This slice does not attempt to complete:

- full CSV import flows
- full pastoral notes workflows
- full elder or council modules
- complex attendance operations
- realtime directory updates
- PWA or offline support

## Next Recommended Slice After This One

Once this phase is stable, the next work should be:

1. pastoral notes and care assignment model
2. consent capture UX tied to first-login and communications preferences
3. church-admin people management screens
4. elder and council-specific confidential workflows

`ministries.leader_profile_id` assignment is now handled in the Ministry Forge settings workflow and no longer belongs on this follow-up list.
