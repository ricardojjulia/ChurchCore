# Factory Run: Enforce PR Delivery Workflow

**Date:** 2026-05-25  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with documentation and repository-operations validation  
**Roadmap phase:** GitHub discipline and software-factory delivery  
**Status:** Verification passed, pull request pending

## Intent

Fix the delivery gap where direct pushes to `main` were accepted even though the repository requires pull requests. GitHub reported that previous direct pushes bypassed the PR-only rule because administrators were not subject to branch protection.

## Story And Acceptance Criteria

As the repository owner, I want factory work to land through feature branches and pull requests, so the documented review workflow matches the GitHub enforcement behavior.

Acceptance criteria:

- `main` branch protection applies to administrators.
- Factory workflow docs say to use feature branches and pull requests.
- Agent rules explicitly prohibit routine direct pushes to `main`.
- The GitHub operations plan records the admin-enforcement requirement.
- This run itself is delivered through a branch and pull request.

## Technical Brief

- Enable GitHub branch protection admin enforcement for `main`.
- Do not change application runtime behavior.
- Update documentation only.
- Preserve the existing factory tracker and add this run record.
- No dependencies, schema changes, or provider changes.

## Implementation Summary

Repository setting changed:

- Enabled admin enforcement for `main` branch protection through GitHub API.

Files changed:

- `AGENTS.md`
- `README.md`
- `docs/software-factory.md`
- `docs/plans/github-repository-operations.md`
- `docs/factory-runs/README.md`
- `docs/factory-runs/2026-05-25-enforce-pr-delivery-workflow.md`
- `CHANGELOG.md`

## Verification

- Confirm branch protection has `"enforce_admins": true` - passed through `gh api repos/ricardojjulia/ChurchCore-Ops/branches/main/protection --jq '.enforce_admins'`.
- `npm run lint` - passed.
- `npm run build` - passed.
- `git diff --check` - passed.

## Residual Risk

- Required status checks are not yet fully enumerated in this run. The immediate fix is admin enforcement so PR-only branch rules cannot be bypassed during normal work.
- This run still needs to be opened and merged through a pull request to prove the corrected delivery path.

## Delivery

- Branch: `chore/enforce-pr-workflow`
- Pull request: pending
- Merge: pending
