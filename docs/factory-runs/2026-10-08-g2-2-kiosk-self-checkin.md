# Factory run: G2.2 — kiosk self check-in (2026-10-08)

**Plan row:** `DEVELOPMENT_PLAN.md` §0 G2.2 (Must, re-estimated from 1.5 to about 2.5 days, M4; the second half of Gap 2, with G2.1). **Branch:** `feat/kiosk-self-checkin-g2-2`, commits `a534b5b` (backend), `780b6d6` (kiosk screens, QR scan, family code card), `16d90d3` (release, tablet journey, docs) and `a8b717b` (Council Review 48 fixes), on top of `main` `e0367e0` (G2.1, merged as #196). **Council:** Review 48, AMENDED, R1-R9 fixed ([synthesis](../reviews/2026-10-08-council-review-48-synthesis.md), [agent reports](../reviews/2026-10-08-council-review-48-agents-1-5.md)). **ADR:** [0030](../adr/0030-kiosk-qr-scanning-and-generation-dependencies.md). **Migration:** `20261010000000_kiosk_self_checkin.sql` (owner action O17, apply to hosted **before** merge).

## Intent
A family arriving at the children's check-in area should be able to check their own children in on a church-owned tablet, without a staff member typing for them: find the household by exact phone number, a typed family code, or by scanning the family's QR; pick a room; get the badge PIN once. Staff stay in the room (attended mode). The tablet is locked to the kiosk, returns to its start screen when idle, and can only look up and check in. Closing this row, with G2.1, closes Gap 2 and, with it, the fifth and last of the five MVP gaps.

## Estimate
The row said 1.5 days. After reading the code the story-writer and orchestrator re-estimated it at about 2.5 days (new tables, a proxy lock, a QR dependency, a tablet journey, a Council round) and told the owner, who agreed. The tracker now carries 2.5. That adds one day to the remaining Must work.

## Owner decisions (2026-10-08)
- **Staff starts the kiosk.** A church admin signs in on the tablet and presses Start; families never sign in.
- **Exit.** The original decision was to re-enter the starting admin's password. Council Review 48 (A5) rated typing the full church-admin password on a semi-public tablet Medium, so the owner changed it (R9) to a **6-digit kiosk exit PIN**, chosen at start, stored only as a bcrypt hash on the kiosk session.
- **Privacy.** Exact full-phone match only; children shown as first name and last initial ("Ana R."), no surnames, ages or other people. No partial or name search.
- **QR library.** `barcode-detector` (reading, ponyfill over zxing-wasm) plus `qrcode` (generating, server side), recorded in ADR 0030. The wasm is self-hosted, so the tablet fetches nothing from a third-party CDN.
- **Children are under 18 by birth date** (church timezone). No birth date: not shown, and staff can still check the child in from the staff screen.
- **Custody-restricted children are hidden.** A child with any custody restriction is not listed; the family sees "Please see a greeter".
- **One slice** (not split into backend and UI stories).
- **Kiosk state in a table, no new secret.** The `cc_kiosk` cookie holds only a random session row id; there is no signing key to manage.
- **Rooms by age is a Should row (S30).** Rooms are not filtered by age and capacity is not enforced.

## Architecture
- **Kiosk session table and cookie.** `ccm_kiosk_sessions` (one row per started kiosk: church, starting admin's login id, device note, exit PIN hash, and one hashed short-lived household token). The httpOnly `cc_kiosk` cookie holds only the row id. The server rejects a session older than 16 h; the cookie deliberately lives 30 days so an expired kiosk always reaches the locked screen, never silently vanishes (R1).
- **`proxy.ts` lock.** A browser carrying the cookie is redirected to `/kiosk/children` from every other path. Pass list: `/kiosk`, `/_next`, `/vendor`, `/sign-in`, `/auth`, and a short fixed list of root files. `/api` is not passed (R2). UX only: every kiosk action re-checks the server session.
- **Shared check-in core.** `lib/ccm-checkin-core.ts` is used by both the staff action and the kiosk action: same service gate, PIN generation, bcrypt hash and `ccm_checkin_sessions` rows. It writes an explicit audit event for every check-in (R5).
- **Partial unique index.** `ccm_sessions_one_active_per_child`: a child can be actively checked in once per service. Closes the double-tap and two-device duplicate. The orchestrator verified 0 duplicate active check-ins on the hosted database on 2026-10-08, before the brief was approved. `ccm_checkin_sessions.checkin_source` is `staff` or `kiosk`.
- **Family code.** `families.checkin_code` (8 characters, Crockford base32 without I, L, O, U; unique per church) plus `checkin_code_rotated_at`. `families` gained column-level grants: `authenticated` cannot select the code and, after R6, cannot insert or update it; only server code (service role) reads and writes it. Future `families` columns need an explicit grant (documented in the migration header).
- **DB rate limit.** `ccm_kiosk_lookup_attempts` records failed and successful lookups and exits. Five failures per device in 5 min, or a church-wide limit in 10 min, pause lookups for 2 min. Successes do not count. (`lib/rate-limit.ts` is in-memory and does not work across serverless instances.) The check is read-then-record, so parallel requests can exceed the limit (accepted, needs the admin's cookies).
- **Household token.** A lookup returns a token bound to this kiosk session; the check-in must present it. It is spent on a successful check-in and expires after 3 minutes (R7). `kioskCheckinAction` also requires the browser's `serviceId` to equal the server-resolved open service (R7).
- **Under-18 rule.** Children come from `children_sensitive_data.dob`, falling back to `profile_sensitive_fields.date_of_birth`, compared against today in the church's timezone.
- **Self-hosted zxing wasm.** `public/vendor/zxing_reader.wasm`, a byte-identical copy checked by a sha-256 test (`lib/kiosk-scanner.test.ts`). The camera stops on read, unmount or idle reset. A blocked camera falls back to the typed code.
- **Phone lookup** uses a generated, indexed `profiles.phone_digits` column.
- **Exit and release.** `exitKioskAction` verifies the PIN (rate limited), ends the session and clears the cookie; the admin lands on the church admin home still signed in. `releaseStuckKioskAction` (locked screen only) clears the cookie and signs the tenant session out on the server (R1).
- **Manifest.** `/kiosk/children` is registered `public: true` (it renders for anyone and shows only the locked screen unless a valid kiosk session exists); `/app/church-admin/children/kiosk` is church-admin only; 9 new action exports are named in tests.

## Facts the build corrected
- **`profiles.date_of_birth` had been dropped** (migration `20260413220000`). The spec-writer named it as the second birth-date field. The builder found the real one, `profile_sensitive_fields.date_of_birth`. The brief had flagged that two fields existed and told the builder to verify.
- **Staff check-in and checkout never read custody restrictions** (orchestrator-verified from the code before the brief was approved). So hiding restricted children on the kiosk is new behaviour, and the checkout gap is a pre-existing finding for T2, not this story.

## Council Review 48 fixes (R1-R9)
- **R1 (High)** release and expiry sign the tenant session out on the server, as well as clearing the cookie; the cookie outlives the server's 16 h limit so an expired kiosk always lands on the locked screen; `releaseHelp` copy corrected. This came from the **"Release this device" action the orchestrator added during the build**: it cleared only `cc_kiosk`, so a released tablet opened into the full admin app with the admin's Supabase session still live. Security (A5) caught it.
- **R2 (High)** `/api` removed from the kiosk pass list (a typed `/api/reports/custom?entity=people` returned the directory); the proxy test is flipped; the static-asset bypass is limited to `/_next`, `/vendor` and a few fixed root files.
- **R3** the idle timer keeps running while the exit dialog is open; the PIN is cleared on close and on idle.
- **R4** the PIN success screen returns to start by itself after 20 s, with a visible countdown.
- **R5** an audit event for every check-in, staff and kiosk (the service-role write had made the trigger record a null actor).
- **R6** `authenticated` loses insert and update on `families.checkin_code` and `checkin_code_rotated_at`; a DB test pins it.
- **R7** `serviceId` must equal the kiosk's resolved service; the household token is spent after a successful check-in.
- **R8** a language picker on the kiosk start screen; focus on the input on the phone and code screens; a single room is preselected; `app/kiosk/children/error.tsx` returns to start; Start has a pending state; four ARIA fixes.
- **R9 (owner decision)** a 6-digit kiosk exit PIN replaces the admin's password.- **Claims wrong or unsupported:** 4 seat claims (A4: O13 open, "T3" remaining, G1.7 and G1.8 open, a "Teacher" role; the first, second and fourth are the third round running), 1 already verified by the orchestrator (A1 marked hosted duplicates UNVERIFIED; found 0 on 2026-10-08), and the spec-writer's dropped column. 39 consecutive rounds.

## Process notes
- **The builder stalled twice** (machine sleep, then the stream watchdog). Each time it was resumed in smaller parts: backend, then screens, then release and journey, with a commit per part (`a534b5b`, `780b6d6`, `16d90d3`).
- **Orchestrator finishing fixes** after the Council fixes:
  - a `react-hooks/set-state-in-effect` lint error in the 20 s auto-return countdown;
  - the e2e "Language" locator, which matched more than one control once the picker existed.

## Verification
Orchestrator-run on `a8b717b`:
- `npx vitest run`: 233 files, 3,154 tests pass.
- `npx tsc --noEmit`: clean.
- `npm run lint`: 0 errors, 1 pre-existing warning.
- `npm run test:surfaces`: OK.
- `npm run lint:migrations`: PASS.
- `npm run build`: OK.
- `npm run setup:e2e -- --reset`: OK.
- `npm run test:db`: 137 pass.
- `ccm-kiosk.spec.ts`: 43/43, retries at 0.
- `ccm-kiosk.spec.ts` plus `member-phone-first.spec.ts`: 59/59, retries at 0.

Builder-run earlier: the real QR scan through Chromium's fake camera, and the page-role sweep `kiosk|children|family` at 136/136.

**Not verified:** a real iPad Safari camera; CI (`verify` and the four `e2e` shards) and GitHub's PR review (no PR yet); the hosted migration (O17).

## Residual risk
- **The admin session stays live on the tablet** for the whole kiosk (attended mode, by design). With R1 and R2 fixed it is reachable only by calling another server action by id from devtools (UNVERIFIED, accepted). A dedicated low-privilege kiosk credential is a post-MVP row.
- **Checkout is unchanged and still unsafe for T2:** it does not read custody restrictions or authorized pickups, `released_to_name` is free text, the checkout update's error is not checked (`app/app/ccm-actions.ts` ~630), and the QR token comparison is plain `===` though its comment promises constant time. Kiosk check-ins store no guardian name or phone. All pre-existing; added to T2.
- **Rate-limit race:** check, then record, so parallel requests can pass 5. Low; needs the admin's cookies.
- **Real iPad Safari camera** is not covered by CI (Chromium's fake capture is). Verify on a device before a church uses it.
- **Pickup PIN on screen** for up to 20 s beside the child's name and room; checkout accepts the PIN alone (pre-existing).
- **Old kiosk sessions and attempts are never pruned**; `household_family_id` stays readable by church admins (S33).
- **One open service at a time** (`findCheckinService` picks the newest) and **phone lookup reads `profiles.phone` only**, not `families.home_phone`.
- **No printed labels:** badge PIN on screen only.
- **Hosted migration order:** applying the migration after the code is merged would break the kiosk and member Family page (new columns and grants), so O17 comes first. The migration adds a partial unique index; hosted had 0 duplicates on 2026-10-08, re-check if time passes.

## Follow-up
- **Owner action O17:** apply `20261010000000` to hosted Supabase before merging (`supabase db push --linked`, fresh backup, dry run first; rollback in the migration header).
- Open the PR, get `verify` and the four `e2e` shards green, read GitHub's review, resolve threads, then mark G2.2 `Done (#PR)`. Gap 2 and M4 close on that merge, and all five MVP gaps are closed.
- New rows: S30 (rooms by age, per-child rooms, capacity), S31 (several concurrent open services), S32 (phone lookup from `families.home_phone`), S33 (kiosk sessions and attempts retention); post-MVP: printed security labels, a dedicated low-privilege kiosk credential, a first-visit visitor path.
- T2 gains the checkout items above.
- MVP readiness 93 since G2.1 merged; 95 proposed on this merge. After it, what remains is T1b, T2, R1 and R2 (5.5 days against 21 working days, 15.5 days of slack).
