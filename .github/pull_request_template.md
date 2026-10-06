## Summary

<!-- One paragraph: what changed and why. Be specific about the user-facing or architectural impact. -->

## Development Plan Alignment

- `DEVELOPMENT_PLAN.md` §0 row(s) or sections:
- Why this PR belongs there:
- Linked issue:

## Type of change

- [ ] New feature
- [ ] Bug fix
- [ ] Database migration
- [ ] Refactor (no behavior change)
- [ ] Documentation
- [ ] Security fix

## Security & Sensitive Data Checklist (AGENTS.md, SECURITY.md)

- [ ] No secrets committed (no `.env*`, `.demo-credentials.local`, or hardcoded keys)
- [ ] Every new tenant table has `church_id` and RLS in the same migration; no RLS bypass or service-role key on the client
- [ ] Modules taking a trusted session/tenant id are `import "server-only"`; every `"use server"` export authenticates its own caller
- [ ] Any `SECURITY DEFINER` function takes its actor from `auth.uid()` (ADR 0024)
- [ ] Webhooks, crons and provider stubs still fail closed
- [ ] PII, payments, child-safety, pastoral, communications or AI impact reviewed and described below
- [ ] Ethical notes included for AI or spiritual-assistance changes

## Test Surfaces & Verification

- [ ] New or changed pages, API routes and server actions have accurate entries in `tests/coverage-manifest.json` (allowed roles match the code's gates) and the tests those entries point to
- [ ] `npm run test:surfaces`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run test`
- [ ] Touched e2e specs pass locally (`npm run test:e2e:local -- <specs>`); CI `verify` and all four `e2e` shards green
- [ ] Migration (if any): `npm run lint:migrations`; applies to a freshly reset DB; backwards-compatible with the running code; rollback stated; owner action row added to apply it to hosted Supabase
- [ ] Every commit verified on GitHub (`gh api repos/<owner>/<repo>/commits/<sha> --jq '.commit.verification'` → `"verified": true`)

## Council & Documentation

- [ ] Council synthesis (non-trivial changes): `docs/reviews/...` — or why the small-fix exception in `improve-software.md` §0 applies
- [ ] Documenter sign-off: plan row, `CHANGELOG.md` `[Unreleased]`, README/HOWTO/docs and ADRs updated
- [ ] GitHub review comments read, fixed or answered, threads resolved
- [ ] Screenshots attached for UI changes

## Changelog

<!-- Add user-visible changes under [Unreleased] in CHANGELOG.md -->

```
### Added / Changed / Fixed / Removed / Security
- ...
```

## Notes

- ADR needed or updated:
- Validation performed (commands and results):
- Residual risk and follow-ups:
