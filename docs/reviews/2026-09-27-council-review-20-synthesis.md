# Council Review 20 — Synthesis

**Date:** 2026-09-27
**Branch audited:** `feat/blockout-dates-g1-4` (draft PR #156), commit `e54a856`
**Base branch:** `main` (`7761707`)
**Roadmap item:** G1.4, blockout dates (`DEVELOPMENT_PLAN.md` §0.3, milestone M1)
**Scope:** Diff-scoped:
- volunteers mark days they can't serve, as a signed-in member, through a volunteer link, or through an admin in the directory;
- the plan roster flags volunteers who block a day they're assigned;
- `vbd_own` RLS is tightened;
- the public volunteer link pages are fixed.

## §0 Scope Note

The branch is one feature commit: 22 files, a migration, 9 new server actions, and new UI on three pages. It needs a full Council pass. The owner approved the story and brief on 2026-09-27.

While building it, three production bugs turned up on the public volunteer link pages. Their queries selected `events.start` / `"end"`, but the columns are `starts_at` / `ends_at`, so:
- every accept/decline link showed "invalid or expired";
- every schedule link was empty;
- the schedule's Respond links all used the page's own token;
- times came from the event, not the shift.

## 1. Cross-Agent Consensus

- **Tenant and profile scoping hold in the app (Agents 1, 2).**
  - The page gates and the action gates match.
  - Token actions take the volunteer and the church from the database, never from the caller.
  - The self actions go through RLS.
  - The new `vbd_own` is correct.
- **The Respond fallback still opens the wrong shift (Agents 1, 2 and 4; verified by me in source).**
  - The link uses `shift.confirmation_token ?? token`, and only the manual reminder action creates tokens (`app/app/volunteer-actions.ts:1439–1509`). Assigning a volunteer creates none.
  - So on the link schedule, a pending shift that was never reminded falls back to the page's token. **Respond then confirms or declines the wrong shift.**
  - The commit fixed this only for shifts that have their own token.
- **"Please also decline that shift" is a dead end for confirmed shifts (Agents 3 and 4; verified).**
  - Both volunteer pages offer Decline only on pending shifts (`components/application/member-schedule.tsx:100`, and the link schedule's Respond).
  - Declining a confirmed shift is allowed on the server (`respondToShiftAction`), and the single-shift confirm page already allows it.
- **Only the `member` role has a self-service panel (Agents 2 and 4).** Staff who volunteer can manage their own dates only through the directory, and only if they're listed there. Secretaries have no signed-in path. This predates the diff: staff also can't accept or decline in-app.

## 2. Corrections and verifications during synthesis

1. **Agent 1: `vbd_manage` doesn't check that the profile is in the church. Verified** against the policy and the unique key `(profile_id, blocked_date)`.
   - Through PostgREST, church A's admin can plant a row for a church B profile, which silently blocks B's own blockout for that day.
   - The app path checks the church; the database must too. **Fixed in this branch (P1).**
2. **Agent 2: "nothing emails the schedule link". Verified.**
   - Reminder emails link to `/portal/volunteer/confirm/[token]`, and only that page links to the schedule.
   - The commit message and draft PR call it the "emailed schedule link". **That's our own write-up error, the second round running that our write-up rather than an agent was wrong** (see the `feedback_council_synthesis_scrutiny` memory).
   - The PR description and CHANGELOG will say "the schedule page, linked from the emailed confirm link".
3. **Agent 4: "tokens exist only after a manual reminder". Verified.**
   - Blockouts by link are therefore reachable only after an admin sends a reminder.
   - Creating a token on assignment, with an expiry that runs to the shift date, belongs to G1.5 (notifications). G1.5's definition of done is amended to say so. This PR stops the wrong-shift fallback on its own.
4. **Agent 2: `start` / `"end"` in two more places. Verified.**
   - They are `app/app/church-admin/onboarding/actions.ts:68,76` (sandbox hydrate) and `app/api/reports/custom/route.ts:73–76`. Both are on the deprecated local-SQL path.
   - The onboarding one is a one-line fix, done here (P5).
   - The reports one is already tracker row S3. S3's definition of done gains it.
5. **Agent 3: raw DB errors reach volunteers. Verified:** `addBlockouts` and `removeBlockout` return `error.message`.
6. **Scores: Agent 4's figures are accepted.**
   - Volunteer Scheduling re-based to about 81% (Review 19's 84% counted a response loop that didn't work), then 86%.
   - Gap 1 about 87%.
   - **MVP readiness 71/100 (+1).**

## 3. ADR Assessment

**No new ADR.** This applies existing patterns:
- RLS scoped by church;
- the public-token trust model already used by `respondToPublicShiftAction`;
- Supabase-only code.

The token scope (a shift token also allows blockout writes for its lifetime) is documented in the code comments and in G1.5's definition of done.

## 4. Implementation Prompts (proposed; need owner approval)

**P1 — Database.**
- A migration makes `vbd_manage` require that the row's profile belongs to the row's church, in both `using` and `with check`.
- Add a `(church_id, blocked_date)` index.
- DB tests for the cross-church planting case, and for a declined shift's token still working.

**P2 — Tokens and responses.**
- On the link schedule, show Respond only when the shift has its own unexpired token. Otherwise show "Ask your team leader to resend your link". Make Respond a real button.
- Offer Respond on confirmed shifts too, not only pending ones.
- On the member schedule, add "Can't make it" (decline, with an optional reason) for confirmed shifts.
- The "already scheduled" warning names each shift (date and role) and points to where to decline it.

**P3 — Panel UX.**
- Consecutive days with the same reason group into one row ("Oct 3 – Oct 24 · Family trip"), with a single remove. The remove actions accept a range.
- Pending state is tracked per row.
- Re-adding a day updates its reason.
- DB errors map to a friendly message and are logged server-side.
- A failed read on the member page shows an error in the panel instead of taking down the page.
- **Translation:** all panel text goes through `useI18n` (en, es, es-PR), and dates use the viewer's locale while staying in UTC.
- **Controls and mobile:**
  - 44px touch targets;
  - inputs stack full width below `sm`;
  - labels "First day" and "Last day (leave blank for one day)";
  - a weekday preview of the chosen range;
  - an explicit "This link has expired" message on the link page;
  - a short "Saved" confirmation.
- The roster "Unavailable" badge gets visible text instead of a tooltip-only explanation.

**P5 — Housekeeping.**
- Fix `start` / `"end"` in the onboarding sandbox-hydrate insert.
- Correct the "emailed schedule link" wording.

### Tracker changes (made in this branch)

- **G1.5**'s definition of done gains:
  - a token is created on every assignment (manual and auto-fill);
  - the token's expiry runs to the shift date plus a buffer;
  - the roster shows the blockout reason.
- **S3**'s definition of done gains the `start` / `"end"` fix in `/api/reports/custom`.
- **New Stretch row G1.10:** recurring blockouts, e.g. "every other Sunday" (Agent 4's top remaining parity gap).
- **§0.5 "Deferred to after MVP"** gains:
  - a team blockout calendar;
  - household blockouts;
  - a self-service schedule for staff roles (staff can manage their dates in the directory today);
  - moving blocked dates on profile merge.

## 5. Resolution (owner approved P1–P5, 2026-09-27)

All five prompts landed on this branch.

**P1 — database.**
- `vbd_manage` now requires the row's profile to belong to the row's church, in both `using` and `with check`.
- New index `vbd_church_date_idx`.
- The migration was renamed `20260927000000_volunteer_blocked_dates_policies.sql`.
- Two new DB tests (7 in all):
  - church A's admin can't plant a day on a church B volunteer;
  - an admin doesn't see a mis-tagged row.

**P2 — responses.**
- On the link schedule, Respond (now a real button) appears only when the shift has its own unexpired token, and on confirmed shifts too ("Can't make it?"). Otherwise it reads "To change this, contact your team leader."
- The member schedule offers "Can't make it" on confirmed shifts.
- The "already scheduled" hint names each shift (date and role), and says where to decline it.
- A declined shift's unexpired token still works; it's the same volunteer, and this is documented in code and tested.

**P3 — panel.**
- A run of consecutive days with the same reason shows as one entry ("Oct 11 – Oct 13 · 3 days") and is removed with one tap: the remove actions take a range and were renamed `remove…BlockoutDatesAction`.
- Pending state is per row.
- Re-adding a day updates its reason.
- Results carry an error `code`, which the panel translates. Database errors become "Couldn't save", with the real error logged.
- **Translation:**
  - all panel text is in the new `blockoutDates` catalog namespace, for en, es and es-PR;
  - dates use the viewer's locale;
  - `memberSchedule.cantMakeIt` is added.
- **Controls:**
  - 44px remove buttons and Add button;
  - inputs stack full width on phones;
  - "First day" and "Last day (leave blank for one day)" labels;
  - a weekday preview;
  - live regions that are always present;
  - focus returns to the list after a remove and to "First day" after an add;
  - a "Saved." confirmation.
- **Page states:**
  - a failed read on the member page shows an error in the panel;
  - an expired link says so;
  - the roster shows "Unavailable · Marked this date off. Find a replacement." as visible text.

**P5 — housekeeping.**
- The onboarding sandbox-hydrate insert uses `starts_at` / `ends_at`.
- The "emailed schedule link" wording is corrected in code comments and in the PR.

**Tracker:**
- G1.5 gains "token created on every assignment, valid to the shift date plus 7 days" and "the roster shows the blockout reason".
- S3 gains the reports `start` / `"end"` fix.
- New Stretch row G1.10 (recurring blockouts); the cut-line order is updated.
- §0.5 gains four deferred items.

**Found during verification and fixed:**
- the renamed actions tripped `test:surfaces`' export-drift check (manifest updated);
- `component={Link}` on a Mantine `Button` in a server component is rejected by Next ("Functions cannot be passed directly to Client Components") — now `component="a"`;
- the e2e label changed with the copy.

**Verification:**
- `npx tsc --noEmit`: clean.
- `npm run lint`: 0 errors, 1 pre-existing warning.
- `npx vitest run`: 152 files, 1,793 passed.
- `npm run test:db`: 34 passed.
- `npm run test:surfaces`: OK.
- `npm run lint:migrations`: PASS.
- `npm run test:e2e:local`:
  - the rotation, confirm-link and blockout journeys, twice each: 12 passed;
  - the volunteers, member-schedule, portal and onboarding page × role sweep: 108 passed.

## 6. Execution Order (as planned)

P1 → P2 → P3 → P5 → tracker updates. Then re-run:
- `npx tsc --noEmit`
- `npm run lint`
- `npx vitest run`
- `npm run test:db`
- `npm run test:surfaces`
- `npm run lint:migrations`
- the rotation and blockout journeys plus the member, volunteers and portal page sweeps

Then the Documenter close-out.
