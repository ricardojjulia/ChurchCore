# Council Review 47: synthesis (G2.1 phone-first member pages)

**Status: AMENDED.** This is the Council's recommendation; the owner decides. Merge once the required fixes below land and verify clean.

| | |
| :--- | :--- |
| Date | 2026-10-08 |
| Branch | `feat/phone-first-member-g2-1` (`abffd6e`), compared with `main` `28f1bda` |
| Related | DEVELOPMENT_PLAN.md §0 G2.1 (the first half of Gap 2, with G2.2); Council Reviews 14 and 15 (origin of the four named defects) |
| Tags | mobile, accessibility, timezone, member portal |
| Surfaces | `/app/member` (via `[role]`), `/app/member/schedule`, `/app/member/giving`, `/app/member/family`, `/app/calendar`, `/app/church-admin/volunteers/schedules/[id]`, `/app/church-admin/volunteers/role-types` |

This was a diff-scoped round. Five separate read-only agents each received their verbatim `improve-software.md` prompt plus a scope preamble. Their reports are condensed in `2026-10-08-council-review-47-agents-1-5.md`. The orchestrator checked every claim used below against source. The branch is frontend only: no migration, RLS, server-action or API change.

## What the branch does

At 390×844 the four member pages now meet all four criteria:
- every touch target is at least 44 px (a member-scoped `.touch-44`);
- no page scrolls sideways, also checked at 360;
- cards sit in a single column;
- each page's primary action is on the first screen.

The `.touch-44` rule targets Mantine's button and input classes directly, because Mantine 9 declares its height variables on the button element itself. The brief had assumed they were inherited, and the builder found that was wrong.

Fixed alongside:
- Member home and giving dates now use the church timezone. Before, they used the server's, so an 8 pm Sunday event showed as Monday.
- `/app/calendar` gets a real heading.
- The service-plan stat tiles stack on a phone.
- `RoleTypeManager` buttons name their role.

The new `member-phone-first.spec.ts` checks all of this with a mobile-layout helper. With `.touch-44` turned off, that helper flagged controls of 30 and 36 px, so it can fail.

## Consensus and required fixes

| # | Finding | Seats | Verified | Fix |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Three dialogs on these pages render in a portal outside `.touch-44`: family edit (`member-family-edit.tsx:87`), profile edit (`member-profile-edit.tsx:124`) and the recurring-gift drawer (`recurring-gifts-panel.tsx:318`). Their controls stay at Mantine's default of about 36 px. "Manage recurring" and "edit family" are primary actions in the story. | A2, A3 | Yes | `className="touch-44"` on all three. |
| R2 | The e2e test never opens a dialog, so R1 went unseen. | A2, A3 | Yes | Open the family edit, profile edit and (where seeded) recurring drawer in the spec, and run the 44 px collector inside the dialog. |
| R3 | Member home wraps the banner and content in a plain `Box`, so the shell's `gap="lg"` no longer separates them (`member-portal-home.tsx:128`). | A3 | Yes | `<Stack gap="lg" className="touch-44">`, as family already does. |
| R4 | `MemberFamilyEdit` types `triggerProps` as `Record<string, unknown>` and spreads it after `onClick`, so a caller could replace the handler. | A3, A4, A5 | Yes | Type it as `Partial<ButtonProps> & { "data-primary-action"?: boolean }` and spread it before `onClick`. |
| R5 | The double-tap guard reads `useTransition`'s `isPending`, which doesn't update until the next render, so two taps in one frame both pass. Decline has no guard at all. The server write is idempotent, so the effect is harmless. | A1 | Yes | A synchronous `useRef` latch on confirm and decline, released when the call settles. |
| R6 | The e2e test's inserted shift is +30 days out. It can land in the seeded plan's month and shift the rotation planner's church-wide month counts while `service-plan-rotation.spec.ts` runs in parallel. The rotation spec itself uses +60 days for exactly this reason. Separately, `.first()` on Confirm can pick `member-self-service.spec.ts`'s shift. | A1 | Yes | Move the shift to +60 days and scope the Confirm locator to this spec's shift. |
| R7 | The e2e direct-database helpers (`tests/e2e/fixtures/env.ts` `getTenantDbUrl`) don't refuse a non-local database. An exported hosted `SUPABASE_DB_URL` would make the specs write to production. Pre-existing; this spec adds one more writer. | A5 | Yes | Refuse non-loopback hosts unless `CI=true`. |

## Recorded, not fixed

These become new rows or carry forward:

- **Two serving lists (Medium, pre-existing).** Member home's "upcoming serving" reads `event_rosters`, while the schedule reads `volunteer_shifts`, so a shift the planner assigns never appears on home. New Should row.
- **The demo seed has no shift for the demo member,** so the demo schedule page is always empty. New Should row.
- **Re-answering shifts (pre-existing).** A member can re-confirm or re-decline their own answered future shift as often as they like (`respondToShiftAction` has no status transition rule). The impact is limited to their own row. Folded into the same Should row as the two serving lists.
- **English-only labels.** The new "Calendar" heading, the mobile "Recurring" badge and the `RoleTypeManager` labels are English, consistent with these files, which were not translated before. Tracked by the localization coverage gap already on file.
- **First-screen check with a new member.** It passed for the seeded member with a complete profile. A brand-new member sees up to two extra alerts above the quick actions. This is UNVERIFIED; the owner's rule is to reorder only if a test shows it doesn't fit.
- **The local-SQL branch of `respondToShiftAction`** lacks the Supabase branch's future-date guard and row-count check. It is a deprecated path under the Supabase-only mandate.

## Claims that were wrong or unsupported

1. **A4** said O13 (the temporary Resend key) is open. The owner replaced the key on 2026-10-06/07, and the plan marks O13 done.
2. **A4** listed "T3" as remaining Must work, for the second round running. T3 was folded into R1 on 2026-09-29. The remaining Must rows after G2.1 are G2.2, T1b, T2, R1 and R2.
3. **A4** scored a "Teacher" role at 65. There is no Teacher role in this app. Review 46's own Agent 4 said so, and the role list in the prompt is stale.
4. **The codebase researcher** (factory step, not a seat) made two errors:
   - It claimed Mantine's `sm` breakpoint "triggers at ~390px". The theme uses Mantine's defaults, where `sm` is 48em (768 px).
   - It proposed a "thumb reach" test (`y + height < 0.6 × viewport`) that measures the top of the screen, not the bottom.
   The story and brief corrected both.

## Definition of done (evidence only)

- [ ] R1–R7 fixed, each with a test where testable.
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run test:surfaces` and `npm run build` are clean.
- [ ] `member-phone-first.spec.ts` and `member-mobile-foundation.spec.ts` pass locally with retries at 0, including the dialog checks.
- [ ] CI `verify` and the four `e2e` shards are green, and GitHub's review has been read.
- [ ] Documenter has updated the plan: G2.1 done, the G4.2 merged status, O16 done (the owner pushed migration `20261009000000` on 2026-10-08 and the orchestrator verified it read-only), the new Should rows, CHANGELOG and memory.

## Readiness

The score stays at 92 until merge (it reached 92 with G4.2 and Gap 4). **93 is proposed on G2.1's merge with R1–R7 fixed.** Gap 2 still needs G2.2.
