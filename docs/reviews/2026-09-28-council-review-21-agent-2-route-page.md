# Council Review 21 — Agent 2: Route & Page Audit

**Branch:** `fix/session-church-profile-id`, commit `14461db`.

**Verdict:** no blocking crash paths in pages. The fix is correct, and in one place it prevents data loss: the local-SQL sandbox hydrate used to delete every profile. Findings:

## Platform admin viewing a tenant (`churchProfileId = null`)
- Pages and loaders degrade to empty states.
- Author columns receive null, which every targeted foreign key allows.
- Actions that return `{ ok: false }` handle it cleanly.

## Actions that now throw via `requireChurchProfileId`

| Action | What the user sees |
|---|---|
| `joinGroupAction` | **Uncaught: its caller `member-groups-browser.tsx:33` has no catch, so the user gets the error page** |
| Donation | A caught toast |
| Data rights | A toast, but production Next.js hides server error text, so it's generic |
| Elders AI | Caught, but mislabelled "AI assistant temporarily unavailable" |
| Shepherd | A toast, with generic text in production |

## Tests
- **The 115 mechanically updated fixtures set `churchProfileId === profile.id`,** so they pass whichever id the code reads. None of the 13 switched modules outside volunteer has a test that tells the two ids apart.
- **`lib/actions/erasure.ts:36`'s self-guard compares a login id with a `profiles.id`,** so an admin could erase their own profile. `erasure.test.ts:69` passes only because its fixture makes the ids equal.
- The kept `actorId: session.profile.id` calls are correct: `audit_log.actor_id` holds `auth.uid()`.

## Ranked findings

| # | Severity | Finding |
|---|---|---|
| 1 | High | Admin self-erasure guard is dead (erasure.ts:36; masked by its fixture) |
| 2 | Medium | `joinGroupAction` throws uncaught |
| 3 | Medium | Equal-id fixtures leave the switched modules unpinned |
| 4 | Low | Elders AI mislabels "no profile" |
| 5 | Low | Throw-based actions show generic text in production |
| 6 | Low | Platform-admin writes are unattributed; sandbox re-hydrate duplicates profiles |
| 7 | Info | The synthetic retry session omits the field behind a cast |
