# Factory Run: Readiness Resolution Actions Audit

**Date:** 2026-05-27  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with `churchcore-build-with-tests` documentation discipline  
**Roadmap phase:** Competitive Readiness Phase 1, Finish The Operator Path  
**Status:** Ready for PR

## Intent

Close the current Finding 1 readiness work by auditing whether each weekly
readiness target gives a ChurchAdmin a practical next action, not only a status
banner.

## Story And Acceptance Criteria

As a ChurchAdmin evaluator, I want the application guide and roadmap to explain
what each readiness target does and how to resolve each item, so I can judge the
operator path without reading source code.

Acceptance criteria:

- Every current readiness target is listed with its resolution action.
- Remaining target-route gaps are captured as follow-up items instead of hidden.
- `docs/application-guide.md` documents the final current operator path.
- `docs/plans/competitive-readiness-roadmap.md` marks Finding 1 status more
  explicitly.
- `CHANGELOG.md` and `docs/factory-runs/README.md` include this factory run.
- Verification runs before PR delivery.

## Technical Brief

- Documentation-only audit; no runtime behavior changes expected.
- Keep the readiness source of truth in
  `docs/plans/competitive-readiness-roadmap.md`.
- Use `docs/application-guide.md` for operator-facing explanation.
- Use this run record for the audit evidence and residual risk.

## Resolution Action Audit

| Readiness target | Current route | Current resolution action | Audit result |
| --- | --- | --- | --- |
| Church setup | `/app/church-admin/settings` | Review tenant profile, contact, website, address, and public-summary cards; return to readiness after fields are corrected. | Clear navigation; follow-up is richer inline edit affordance if settings becomes fully editable. |
| Account approvals | `/app/church-admin/accounts?status=pending` | Approve, reject, or match pending portal requests from the approval queue. | Clear. |
| Incomplete people records | `/app/church-admin/people?view=incomplete-profiles` | Use filtered people cards and edit controls to complete missing profile data. | Clear. |
| Unassigned households | `/app/church-admin/people?view=unassigned-households&household=unassigned` | Use filtered people view and household relationship controls to assign or create household links. | Clear. |
| Event roster gaps | `/app/church-admin/events?view=needs-roster` | Open matching events and add roster assignments or attendance setup. | Clear. |
| Children's ministry safety | `/app/church-admin/children/dashboard?view=readiness` | Open services, volunteers, rooms, incidents, check-in, or pickup from the dashboard to resolve safety and coverage gaps. | Clear. |
| Volunteer service plans | `/app/church-admin/volunteers/schedules?view=unassigned` | Open service plans and fill/confirm positions. | Clear. |
| Giving/finance exceptions | `/app/church-admin/giving?view=exceptions` | Review failed gifts, publish giving page, post mapped gifts to GL, queue receipt follow-up, or open draft journals. | Clear. |
| Draft finance journals | `/app/church-admin/finance/journals?view=drafts` | Open each draft journal and post, correct, or void it. | Clear. |
| Communications readiness | `/app/communications?view=readiness` | Compose messages and review log/member consent/contact signals. | Partial: visible path exists; provider retry, unsubscribe, suppression, and webhook lifecycle remain Finding 3 work. |
| Reports coverage | `/app/reports?range=90d` | Review member, event, giving, and reporting coverage; drill into member reports. | Partial: visible path exists; report-specific remediation for missing finance journals/budgets remains a follow-up. |
| Suggested workflows | `/app/church-admin/workflows?status=open` | Open ShepherdAI suggestions, review, accept, or dismiss workflow recommendations. | Clear. |

## Implementation Summary

Files changed:

- `docs/application-guide.md`
- `docs/plans/competitive-readiness-roadmap.md`
- `docs/factory-runs/README.md`
- `docs/factory-runs/2026-05-27-readiness-resolution-actions-audit.md`
- `CHANGELOG.md`

Patterns reused:

- Existing factory-run record format.
- Existing competitive-readiness roadmap status language.
- Existing application-guide ChurchAdmin workflow section.

No runtime code changed in this audit run.

## Verification

- `git diff --check` - passed.
- `npm run lint` - passed.
- `npm run build` - passed.
- `npm test` - passed with 32 test files and 145 tests.

## Residual Risk

- Communications readiness has visible compose, log, member, consent, and
  contact signals, but retry, unsubscribe, suppression, bounce webhook, and
  provider lifecycle controls remain Finding 3 work.
- Reports readiness has coverage drilldowns, but direct remediation for missing
  finance journals and budgets remains reporting follow-up work.
- Church setup has clear settings visibility, but richer inline editing remains
  product polish if evaluators expect changes directly from every readiness
  card.

## Delivery

- Branch: `docs/readiness-resolution-actions-audit`
- Pull request: Pending
- Merge: Pending
