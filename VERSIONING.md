# Versioning

ChurchCore uses [Semantic Versioning](https://semver.org) for releases. The rules below restate [`DEVELOPMENT_PLAN.md` §10](DEVELOPMENT_PLAN.md#10-sdlc--development-processes) and the practice recorded in [`CHANGELOG.md`](CHANGELOG.md).

Current version: `3.5.0` (released 2026-10-03; `package.json` and the `v3.5.0` tag)

## Version Format

```text
MAJOR.MINOR.PATCH
```

## Release Classes

### Major

A major version marks breaking changes, major new modules, or significant PII or AI updates (DEVELOPMENT_PLAN §10). Major changes require stakeholder review. For example:

- `3.0.0` (2026-05-26) — new operator workspaces and role surfaces, ShepherdAI operational persistence, split-backend security posture, bilingual UI foundations, readiness contracts and the documented software factory. Its CHANGELOG rationale explains why that combination was a major release rather than a minor one.
- `2.0.0` and `1.0.0` — earlier platform milestones; see their CHANGELOG sections.

### Minor

A minor version adds features and enhancements without breaking existing behavior. Most ChurchCore releases are minor, for example:

- `3.5.0` — service planning (Gap 1), the production-safety track, giving on each church's own Stripe account (Connect), recurring giving, the design system, and the blocking e2e suite.
- `3.4.0` — the localization governance framework.
- `3.3.0` — the Church Operations module, the communications send lifecycle and the first AI ministry tools.
- `3.2.0` — the move to Supabase-only data access.

### Patch

A patch version fixes bugs or makes minor revisions without a new functional surface, for example RLS policy fixes, provider error handling, documentation, or test-suite expansion. `2.11.1` is a recorded patch release.

## Between Releases

Merged work accumulates under `## [Unreleased]` in `CHANGELOG.md` until the next release section is cut. A release then gets:

1. A version bump in `package.json`.
2. A `CHANGELOG.md` section with a release rationale and the Added / Changed / Fixed / Security entries.
3. A git tag (`vMAJOR.MINOR.PATCH`).
4. The gates in [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md).

## The MVP Release

The MVP release (tracker row R2, target November 6, 2026) is a version bump, a CHANGELOG release section and a git tag, after every item in the MVP release checklist (DEVELOPMENT_PLAN §0.6) passes. Its version number is decided at that release under the rules above; it is not fixed in advance.

## Changelog Policy

Every release and every meaningful merged change updates [`CHANGELOG.md`](CHANGELOG.md) (Keep a Changelog format) with:

1. A clear, user-visible summary of what was added, changed, fixed or secured.
2. Migrations and new or changed environment variables, including any owner action needed on the hosted environment.
3. Verification evidence: the commands run and their results, and the Council review that covered the change.
