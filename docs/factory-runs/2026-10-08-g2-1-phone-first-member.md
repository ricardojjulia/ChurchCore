# Factory run: G2.1 — phone-first member flows (2026-10-08)

**Plan row:** `DEVELOPMENT_PLAN.md` §0 G2.1 (Must, 1.5 days, M4; the first half of Gap 2, with G2.2). **Branch:** `feat/phone-first-member-g2-1`, commits `abffd6e` (feature) and `e07e73f` (Council fixes), on top of `main` `28f1bda` (G4.2, merged as #195). **Council:** Review 47, AMENDED, R1-R7 fixed ([synthesis](../reviews/2026-10-08-council-review-47-synthesis.md), [agent reports](../reviews/2026-10-08-council-review-47-agents-1-5.md)). **Migration:** none. Frontend only: no RLS, server-action or API change.

## Intent
A member on a phone should be able to read and tap member home, schedule, giving and family at 390x844 without pinching, side-scrolling or mis-tapping, so they can confirm a service slot, give, and update their family. Four criteria on all four pages: every touch target at least 44 px, no horizontal scroll (also at 360), a single-column layout, and the primary action on the first screen. It also closes four defects named in Council Reviews 14 and 15.

## Owner decisions (2026-10-08)
- Keep the 2-up quick-action grid on member home (each target at least 44 px); every other card is one column.
- "Thumb reach" means the primary action is fully visible on the first screen, between the header's bottom edge and the bottom nav's top edge. No sticky bars in G2.1.
- "Give now" is the giving primary action.
- The giving history drops its Type column below `sm` (a Recurring badge goes in the Fund cell).
- Reorder content only if a test shows the primary action does not fit.

## Design
- **Member-scoped `.touch-44`** in `app/globals.css`. It raises Mantine buttons, inputs, switches, checkboxes and action icons to 44 px. The brief assumed the Mantine height variables were inherited from an ancestor; the builder found that Mantine 9 sets `--button-height-*` on the button element itself, so the rule uses descendant selectors on the component classes. Staff pages do not use it. Drawers and modals carry the class because they render in a portal.
- **Church timezone dates.** `formatInstantParts` in `lib/church-time.ts` formats a real instant in the church's zone (`session.appContext.church.timezone`). Member home and giving no longer use the server's zone, so an 8 pm Sunday event no longer reads Monday. Volunteer shift times stay wall-clock (ADR 0023).
- **Calendar heading** is an h1 in the calendar hub, not the shell (the shell title stays plain text).
- **Number-input spinners are hidden on member pages**: members type amounts, and the spinner arrows are small tap targets.
- Each page marks its first-screen primary action with `data-primary-action`. Schedule's Confirm, Decline and Can't make it stack on a full-width row on a phone.

## The four named defects (Council Reviews 14/15), now fixed
1. Service-plan detail stat tiles (`SimpleGrid cols={3}`) now stack on a phone and sit three across from `sm`.
2. `/app/calendar` has a real "Calendar" heading; the `KNOWN BUG` assertion in `member-mobile-foundation.spec.ts` is flipped.
3. Member home dates use the church timezone, not the server's.
4. `RoleTypeManager` Edit and Deactivate buttons are named with the role ("Edit Vocalist").

## The e2e helper and its negative controls
`tests/e2e/fixtures/mobile-layout.ts` holds the shared checks: overflow, 44 px touch targets (`collectTouchViolations(page, root?)`, where a root locator lets it check a dialog), side-by-side cards, first-screen primary action, and bottom nav. `member-phone-first.spec.ts` applies them to the four pages and, after R2, inside the family edit, profile edit and recurring-gift dialogs. The spec inserts a pending shift for the member because the seed has none.

Negative controls (builder-run): with `.touch-44` off, the helper flags 30 px and 36 px controls on home; with the family modal's class off, it flags a 28 px close button and a 36 px input. So the helper can fail.

## Council Review 47 fixes (R1-R7)
- **R1** the family edit, profile edit and recurring-gift dialogs render in a portal outside `.touch-44` and stayed at about 36 px: `className="touch-44"` on all three.
- **R2** the e2e never opened a dialog: it now opens each and runs the collector inside.
- **R3** member home's banner and content sit in a `Stack gap="lg"` again.
- **R4** `MemberFamilyEdit` `triggerProps` is typed (`Partial<ButtonProps> & { "data-primary-action"?: boolean }`) and spread before `onClick`.
- **R5** a synchronous `useRef` latch on confirm and decline, released when the call settles. The server write is idempotent, so the effect was harmless.
- **R6** the e2e shift moves to +60 days (it could land in the seeded plan's month and shift the rotation planner's counts) and the Confirm locator is scoped to this spec's shift.
- **R7** the e2e direct-database helpers refuse a non-loopback host unless `CI=true`.
- **3 seat claims and 2 researcher errors were wrong** (see the synthesis): Agent 4 said O13 is open, listed "T3" as remaining Must work for the second round running, and scored a "Teacher" role that does not exist; the codebase researcher said Mantine's `sm` triggers at about 390 px (it is 768 px) and proposed a thumb-reach test that measures the top of the screen.

## Verification
Orchestrator-run on `e07e73f`:
- `npx vitest run`: 222 files, 2,909 tests pass.
- `npx tsc --noEmit`: clean.
- `npm run lint`: 0 errors, 1 warning.
- `npm run test:surfaces`: OK.

Builder-run:
- `npm run build`: OK.
- `member-phone-first.spec.ts` plus `member-mobile-foundation.spec.ts`: 27/27, twice, retries 0.
- Negative controls as above.
- Page-role sweep `calendar|member`: 170/170 on rerun, after a local sign-in redirect flake (the known local auth flake, `feedback_local_e2e_environment`; CI is the judge).

**Not verified:** CI (`verify` and the four `e2e` shards) and GitHub's PR review have not run (no PR yet); a brand-new member with extra alerts above the quick actions on home (the first-screen check passed for the seeded member with a complete profile).

## Residual risk
- **Brand-new member, first screen (UNVERIFIED).** Up to two extra alerts can sit above the quick actions. The owner's rule is to reorder only if a test shows it does not fit; no such test exists yet.
- **Two serving lists (pre-existing, Medium).** Home's "upcoming serving" reads `event_rosters`; the schedule reads `volunteer_shifts`. Row S28.
- **Re-answering shifts (pre-existing).** `respondToShiftAction` has no status-transition rule, so a member can re-confirm or re-decline their own answered future shift. Own row only. Folded into S28.
- **Local-SQL branch of `respondToShiftAction`** lacks the Supabase branch's future-date guard and row-count check. Deprecated path.
- **English-only labels** (the Calendar heading, the mobile Recurring badge, the `RoleTypeManager` labels), consistent with those files; tracked by the localization coverage gap.
- The demo seed has no future shift for the demo member, so the demo schedule is always empty. Row S29.

## Follow-up
Open the PR; get `verify` and the four `e2e` shards green; read GitHub's review before merging; resolve threads. After merge, G2.1 is `Done (#PR)`. Then G2.2 (kiosk, M4 due Oct 30). New rows S28 and S29. MVP readiness 92 since G4.2 merged; 93 proposed on this merge. After this merge the remaining Must rows are G2.2, T1b, T2, R1 and R2: 7.0 days against 22 working days (Oct 8 - Nov 6), 15.0 days of slack.
