# 2026-06-05 Execution Brief

Date: 2026-05-29
Checkpoint target: 2026-06-05 weekly go/no-go review
Source checklist: docs/plans/mvp-competitive-go-no-go-checklist.md

## Objective

Hold MVP Today at GO by closing onboarding and communications execution gaps, while reducing risk for the next competitive gates.

## Sequence status (2026-05-29 update)

- WS-1 Local reliability hardening: completed.
- WS-2 Browser-complete onboarding path: completed.
- Next execution item: WS-3 Communications unresolved-lane closure guidance.
- Follow-on item after WS-3: WS-4 Security evidence maintenance.

WS-1 completion evidence:

- `npm run setup:local` ✅
- `npm run smoke:local` ✅
- `npm run test:e2e:readiness` ✅ (3 passed, 1 skipped control-plane-context test)

WS-2 completion evidence:

- `npm run test:e2e:onboarding` ✅ (1 passed)
- `npm run test -- app/app/church-admin-actions.test.ts app/sign-in/actions.test.ts` ✅ (29 passed)
- `npm run lint` ✅

## Weekly target outcomes

- MVP Today: target GO
- MVP +2 weeks: target NO-GO (but materially closer to conditional GO)
- Competitive 30 days: target NO-GO (risk reduced)
- Competitive 60 days: target NO-GO

## Workstreams

### WS-1 Local reliability hardening

Status: Completed 2026-05-29

Owner: Platform engineering

Deliverables:

- Resolve local runtime failure for development startup (`npm run dev`, `npx next dev -p 4201`, `npx next dev -p 4300`).
- Add or update startup troubleshooting notes with exact root cause and fix path.
- Verify clean-machine path:
  - `npm run setup:local`
  - `npm run smoke:local`
  - `npm run test:e2e:readiness`

Definition of done:

- All three reliability commands pass after setup on a clean environment.
- Root cause and remediation documented in setup/troubleshooting docs.

Verification commands:

- `npm run setup:local`
- `npm run smoke:local`
- `npm run test:e2e:readiness`
- `npm run lint`
- `npm run build`

### WS-2 Browser-complete onboarding path

Status: Completed 2026-05-29

Owner: Application engineering (ChurchAdmin + portal)

Deliverables:

- Add executable browser-level path for:
  - public registration
  - ChurchAdmin approval
  - invite/link flow
  - first sign-in and profile hydration confirmation
- Ensure route/action role gates are tested for denied-role attempts where applicable.

Definition of done:

- At least one deterministic browser-level test passes end-to-end for onboarding.
- Onboarding behavior and limits documented in app guide/testing schema.

Verification commands:

- `npm run test:e2e:onboarding`
- `npm run test -- app/app/church-admin-actions.test.ts app/sign-in/actions.test.ts`
- `npm run lint`

### WS-3 Communications unresolved-lane closure guidance

Owner: Communications workflow owner

Deliverables:

- Add explicit operator closure flow for unresolved delivery issues:
  - identify retryable vs non-retryable
  - suppression/consent follow-up path
  - expected resolved state
- Add focused test coverage for new operator-action behavior if any new action logic is added.

Definition of done:

- Communications lane shows a clear next action path for unresolved items.
- Docs reflect closure workflow and evidence links.

Verification commands:

- `npm run test -- app/app/communications-actions.test.ts`
- `npm run lint`
- `npm run build`

### WS-4 Security evidence maintenance

Owner: Security and quality lead

Deliverables:

- Update security role-access matrix and evidence docs with this week’s newly executed checks.
- Ensure testing schema references new onboarding and reliability evidence.

Definition of done:

- Security docs remain evidence-linked, not assertion-only.
- Weekly scorecard evidence links point to committed artifacts.

Verification commands:

- `npm run test -- app/app/church-admin/people/import/actions.test.ts app/app/church-admin-actions.test.ts app/app/communications-actions.test.ts app/app/member-actions.test.ts`
- `npm run lint`

## Risks and fallback plan

- Risk: local startup root cause may require environment-specific remediation.
  - Fallback: provide explicit supported local environment matrix and temporary workaround command path in setup docs.
- Risk: onboarding browser test may be flaky due to async email/invite behavior.
  - Fallback: implement deterministic local-only invite assertion checkpoints and isolate external dependencies.

## 2026-06-05 review checklist

- Was MVP Today moved to GO?
- Which required gate still blocks if not?
- Which owner has next-step accountability for unresolved blockers?
- Were evidence links and factory-run records updated in the same PR?
