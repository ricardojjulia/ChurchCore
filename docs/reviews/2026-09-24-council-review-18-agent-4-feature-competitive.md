# Council Review 18 — Agent 4: Feature & Competitive Audit

**Branch:** `feat/e2e-testing-foundation` (draft PR #150). Verified: `test:surfaces` OK (117/15/30); `vitest tests/scripts` 45/45.

## 1. Coverage vs the ask
Story A covers **reachability and authorization** broadly and **behavior** thinly. No spec submits a form or drives a server action through the UI; roughly 30–35% of user-facing behavior is exercised.

Regressions that still pass:
- **Server actions with no unit test for that export.** Cross-referencing manifest exports against all test files, **49 of 199 exported actions (25%) are named in no test file**. They include child-safety (`transferChildAction`, `fileIncidentAction`, `upsertAuthorizedPickupAction`, `submitPublicChildCheckinAction`), pastoral (`createPastoralNoteAction`, all 8 elders writes), `inviteUserAction`, `generateDataExportAction`, finance budget/journal writes, 6 of 10 groups actions, and `launchTenantViewAction`/`returnToControlPlaneAction`.
- Broken form wiring.
- The comms pipeline end to end.
- Detail pages for ~9 unseeded record types.

**Story B, ranked:**
1. Comms (compose → schedule → deliver → retry → DLQ → suppression)
2. Child check-in and safety
3. Service planning, song library and role taxonomy (the unit tests exist but aren't listed under `volunteer-actions.ts` in the manifest)
4. Pastoral and elders encrypted round trip
5. Giving and finance
6. People

Seed the missing record types in B.

## 2. Enforcement strength: weak
- `exports` is never compared with scanned exports.
- Any existing file satisfies `tests[]`.
- A page gate can change without touching the manifest.

Tighten:
- (a) fail on export drift;
- (b) each `tests[]` file must import the module and name each export, or carry an explicit waiver with a reason;
- (c) optional function-coverage floor;
- (d) a diff-aware page-gate check.

## 3. Known gaps vs PCO/Breeze/Tithe.ly
- **Single-tenant seed:** moderate. Add a second tenant; the untested control-plane tenant-view path is where a leak would happen.
- **Unseeded record types:** high for product quality.
- **No visual or accessibility checks:** moderate. An axe pass inside the sweep is cheap.

## 4. Bug fix order
1. `/api/reports/custom` redirect (before F4/F2)
2. `/hq` role source (with/before F7)
3. Secretary vs RLS (F7)
4. Calendar heading and `?view=readiness`

## 5. MVP readiness
**69/100 (+1)**, for a real blocking regression net over authorization and route contracts.
