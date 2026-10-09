# Council Review 48: synthesis (G2.2 kiosk self check-in)

**Status: AMENDED.** This is the Council's recommendation; the owner decides. Do not merge until the required fixes below land and verify clean. Migration `20261010000000` must be applied to the hosted database **before** merge.

| | |
| :--- | :--- |
| Date | 2026-10-08 |
| Branch | `feat/kiosk-self-checkin-g2-2` (`a534b5b` backend, `780b6d6` kiosk UI, `16d90d3` release and e2e), compared with `main` `e0367e0` |
| Related | DEVELOPMENT_PLAN.md §0 G2.2 (closes Gap 2 with G2.1); ADR 0030 (QR dependencies) |
| Tags | children's ministry, child safety, kiosk, migration, RLS, proxy |
| Surfaces | `/kiosk/children` (new), `/app/church-admin/children/kiosk` (new), `/app/member/family`, `proxy.ts`, 9 new server-action exports, migration `20261010000000` |

This was a diff-scoped round. Five separate read-only agents each received their verbatim `improve-software.md` prompt plus a scope preamble. Their reports are condensed in `2026-10-08-council-review-48-agents-1-5.md`. The orchestrator checked every claim used below against the source.

## What the branch does

A church admin starts kiosk mode on a tablet. Families then find themselves by an exact phone number, a typed family code, or by scanning the family's QR. They see their children under 18 as "Ana R.". Children with a custody restriction are sent to a greeter. The family picks a room and gets the badge PIN once.

The kiosk is locked to `/kiosk/children`:
- it returns to the start screen after 60 s idle;
- leaving needs the admin's password;
- lookups are rate-limited in the database.

A shared check-in core enforces one active check-in per child per service. Family codes and QRs appear on the member Family page.

The e2e test runs at 1024×768 and 768×1024, plus one Spanish run, and includes a real QR scan through Chromium's fake camera.

## Consensus and required fixes

| # | Finding | Seats | Verified | Fix |
| :--- | :--- | :--- | :--- | :--- |
| R1 | **High.** When the kiosk ends abnormally, the tablet opens into the full admin app without a password. "Release this device" clears only `cc_kiosk`, and the cookie's 16 h `maxAge` drops it silently. In both cases the admin's Supabase session stays live (the kiosk has no 15-minute timeout wrapper, and `/kiosk` is a refresh surface), and `/sign-in` sends a signed-in user straight into the app. The release action was added by the orchestrator during the build. | A5 | Yes (`app/kiosk/children/actions.ts:254-289`, `app/sign-in/page.tsx:86-87`) | **Release and kiosk expiry sign the tenant session out on the server**, as well as clearing the cookie. The kiosk cookie outlives the server's 16 h limit, so an expired kiosk always reaches the locked screen and never silently disappears. Fix the `releaseHelp` copy. |
| R2 | **High.** `/api` is on the kiosk pass list, so anyone at the tablet can type `/api/reports/custom?entity=people` (the whole directory as CSV), giving-statement PDFs or `/api/stripe/connect/start` behind the live admin session. | A2, A5 | Yes (`lib/ccm-kiosk-constants.ts:17`; the test pins it, `tests/kiosk-proxy.test.ts:36`) | Remove `/api` from the pass list and flip the test. Restrict the static-asset bypass to `/_next/*`, `/vendor/*` and favicon/icon files, not any path ending `.json` or `.txt`. |
| R3 | **Medium.** The exit password can be left on screen. The idle timer is off on the start screen, so an Exit dialog opened there, with a half-typed password and a visibility toggle, never times out. | A3 | Yes (`ccm-self-checkin-kiosk.tsx:88-93`) | Keep the idle timer running whenever the exit dialog is open. Clear the password on close and on idle. |
| R4 | **Medium (child safety).** The pickup PIN stays on screen next to the child's name and room for up to 70 s, and checkout accepts the PIN alone. | A5 | Yes | Return the success screen to the start screen on its own after 20 s, and label the countdown visibly. |
| R5 | **Medium.** Staff check-ins lose their audit actor. The shared core writes with the service role, so the `audit_ccm_access()` trigger records `auth.uid()` as null. Before this branch it recorded the admin. | A1 | Yes (`lib/ccm-checkin-core.ts`; trigger in `20260607060000`) | Write an explicit `logAuditEvent` for every check-in in the core (staff and kiosk), using the login id as actor. |
| R6 | **Low–Medium.** Any family member can still write `families.checkin_code` through their own update and insert policies, setting a guessable code. A unique-index 23505 also tells them whether a code exists. | A5 | Yes (`20260412123000:17-48`; only SELECT was column-restricted) | Revoke insert and update on `checkin_code` and `checkin_code_rotated_at` from `authenticated` (column grants), and add a DB test. |
| R7 | `kioskCheckinAction` trusts the browser's `serviceId`, but the "already checked in" flags come from the resolved service. The household token stays valid for 3 minutes after a check-in. | A1, A5 | Yes | Require `serviceId === findCheckinService().id`. Clear the household token on the server after a successful check-in. |
| R8 | Kiosk UX and accessibility. A family can't switch language (the locale is the admin's browser cookie). Focus lands on the heading instead of the input. A single room still has to be tapped. There is no `/kiosk` `error.tsx`, so a family would be stuck on a bare page. The admin Start button has no pending state, so a double tap creates two sessions. ARIA: a nested alertdialog, an assertive per-second countdown, `aria-label` on a `<p>`, and "selected" announced twice. | A3 | Yes | Add a language picker on the kiosk start screen (reuse `components/language-select.tsx`; the kiosk only). Focus the input on the phone and code screens. Preselect when there is only one room. Add `app/kiosk/children/error.tsx` that returns to start. Add pending state on Start. Make the four ARIA fixes. |

## Recorded, not fixed

- **Checkout (child safety, for T2).** Checkout never reads custody restrictions or authorized pickups. `released_to_name` is free text. The update's error is never checked (`app/app/ccm-actions.ts` ~630). The QR comparison is plain `===`, though its comment promises constant time. All of this predates the branch. Kiosk check-ins also store no guardian name or phone.
- **Rooms.** Rooms are not filtered by age and capacity is not enforced (`children_rooms` has `age_min`, `age_max`, `capacity`), and one room applies to all the siblings in a pass. Owner decision below.
- **Only one open service at a time.** `findCheckinService` picks the newest. New Should row.
- **The admin session stays live on the tablet** for the whole kiosk (attended mode, by design). With R1 and R2 fixed, it is reachable only through devtools (calling another server action by ID), which is UNVERIFIED and accepted as residual. A dedicated low-privilege kiosk credential is a post-MVP row.
- **Rate-limit race.** The rate limit checks, then records, so parallel requests can exceed 5. It needs the admin's cookies. Low.
- **Kiosk session cleanup.** Old kiosk sessions are never pruned, and `household_family_id` stays readable by admins. Folded into the tenant-retention Should row.
- **Phone sources.** Phone lookup reads `profiles.phone` only, not `families.home_phone`.
- **No printed labels.** Post-MVP row.
- **The column-grant trap on `families`.** Future columns need explicit grants. It is documented in the migration header.

## Claims that were wrong or unsupported

1. **A4** said O13 is open. It is done (2026-10-06/07). This is the third round running.
2. **A4** listed "T3" as remaining work. It was folded into R1 on 2026-09-29. Third round running.
3. **A4** said G1.7 and G1.8 are open Must work. Both were moved after MVP.
4. **A4** scored a "Teacher" role. There is none. Third round running.
5. **A1** marked duplicate active check-ins on the hosted DB as UNVERIFIED. The orchestrator queried it read-only on 2026-10-08 and found 0, before the brief was approved.
6. **The spec-writer** (factory step, not a seat) named `profiles.date_of_birth` as the second birth-date field. It was dropped in `20260413220000`. The builder found the real one, `profile_sensitive_fields.date_of_birth`.

## Owner decisions needed

1. **How the kiosk is exited.** The owner chose the admin's password. A5 rates that Medium, because typing the full church-admin password on a semi-public tablet exposes the whole account to anyone watching. The alternative is a kiosk exit PIN set at start and stored hashed on the kiosk session.
2. **Rooms by age:** now, or as a Should row.

## Definition of done (evidence only)

- [ ] R1–R9 fixed, each with a test. R1 and R2 also need e2e: a stale or released kiosk must land on sign-in signed out, and `/api/...` from a kiosk must redirect.
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run test:surfaces` and `npm run build` are clean.
- [ ] Migration: `npm run lint:migrations`, a fresh reset and the DB tests pass. Hosted duplicates were 0, checked 2026-10-08. Rollback is stated.
- [ ] `ccm-kiosk.spec.ts` passes twice locally with retries at 0.
- [ ] Hosted migration applied **before** merge (owner action), then CI `verify` and the four `e2e` shards are green and GitHub's review has been read.
- [ ] Documenter: G2.2 done; Gap 2 and M4 closed on merge; the new rows; the T2 checkout notes; CHANGELOG; memory.

## Readiness

93 until merge. **95 proposed on merge with R1–R8 fixed: Gap 2 closes, so all five MVP gaps are closed.** The score stays below the high 90s until T2 (checkout safety) lands.
