# Factory Run: Release Version 3.0.0

**Date:** 2026-05-26  
**Factory surface:** Codex  
**Workflow:** `churchcore-feature-factory` with `churchcore-build-with-tests` release documentation discipline  
**Roadmap phase:** Release discipline and competitive-readiness baseline  
**Status:** Verification passed, pull request pending

## Intent

Recalculate the current release version from the amount and type of work completed after the last tagged `v2.11.1` snapshot, then update package metadata and release documentation consistently.

## Story And Acceptance Criteria

As a ChurchCore evaluator, I want the repository version and release notes to match the true product scope, so release claims do not understate the operator, security, AI, and workflow work already completed.

Acceptance criteria:

- The selected version follows the SemVer rules in `DEVELOPMENT_PLAN.md`.
- `package.json` and `package-lock.json` use the selected version.
- `CHANGELOG.md` turns the accumulated unreleased work into a dated release section.
- `README.md` states the current version and explains the release highlights.
- `DEVELOPMENT_PLAN.md` metadata reflects the new release baseline.
- Verification commands and PR delivery evidence are recorded.

## Version Decision

Selected version: `3.0.0`.

Rationale:

- The work is larger than a patch because it includes new behavior, security posture changes, docs, workflow gates, and dependency remediation.
- The work is larger than a minor release because `DEVELOPMENT_PLAN.md` defines major releases as breaking changes, major new modules, or significant PII/AI updates.
- The accumulated scope includes major operator-path architecture, new role surfaces, split control-plane/tenant hardening, ShepherdAI operational persistence, readiness contracts, bilingual UI foundations, and the Claude/Codex software factory.
- Therefore the appropriate SemVer classification is a major release rather than `2.13.0`.

## Implementation Summary

Files changed:

- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `README.md`
- `DEVELOPMENT_PLAN.md`
- `docs/factory-runs/README.md`
- `docs/factory-runs/2026-05-26-release-version-3-0-0.md`

## Verification

- `npm run lint` - passed.
- `npm run build` - passed.
- `git diff --check` - passed.

## Residual Risk

- This release-version update does not create a GitHub Release or git tag by itself.
- Historical README sections for earlier releases remain for context.
- Product work for the competitive-readiness roadmap is still ongoing after this baseline.

## Delivery

- Branch: `release/version-3-0-0`
- Pull request: [#16](https://github.com/ricardojjulia/ChurchCore/pull/16)
- Merge: squash merge `3d23855`
