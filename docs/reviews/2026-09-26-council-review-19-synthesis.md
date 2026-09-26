# Council Review 19 — Synthesis

**Date:** 2026-09-26
**Branch audited:** `feat/service-planning-rotation-planner`, commit `eca7bb1`. The branch is stacked on PR #151 (`7ef296f`, docs only, reviewed separately).
**Base branch:** `main` (`73680da`)
**Scope:** Diff-scoped. Service Planning Story 3, the rotation planner:
- ranked suggestions per position;
- reviewable whole-plan auto-fill with re-validation on apply;
- a per-volunteer monthly limit;
- two SECURITY INVOKER SQL functions (`get_volunteer_pool`, `get_volunteer_directory`);
- fixes to four production bugs (below);
- unit, action, loader, real-Postgres and e2e tests;
- `npm run test:db` added to CI.

## §0 Scope Note

The branch is one feature commit, about 2k lines across 17 files, half of them tests. It adds a migration, four server actions and new UI, so a full Council pass was required. It went through the feature-factory chain: research, story (approved), brief (approved), build, tests.

Before the Council, the e2e page sweep caught one more production bug, and it was fixed in `eca7bb1`. The volunteer directory crashed as soon as it had rows: Mantine `Table.*` dot-notation members are undefined in a server component. The page had never had rows, because its query was broken.

The four production bugs this branch fixes, all verified:
1. The assignment picker was always empty. Its query selected a non-existent `church_memberships.profile_id`.
2. The volunteer directory was always empty. PostgREST rejected its filter on an un-embedded relation.
3. Assigning on a plan with a service time violated `volunteer_shifts`' `ends_at > starts_at` CHECK.
4. The Supabase assign path had no same-day double-booking check. The local path always had one.

## 1. Cross-Agent Consensus

- **Authorization and tenant isolation are sound (Agents 1 and 2, verified).**
  - Page gates, `requireServicePlanWriteAccess`, and the manifest's `allowedRoles` all agree on church-admin, pastor and ministry-leader.
  - RLS (`can_manage_church`) gives all three roles complete data through the SECURITY INVOKER functions.
  - Another church's `p_church_id` returns nothing.
- **Errors in the plan page's modals are invisible (Agents 2 and 3, verified by me in source).**
  - `handleAssign` and `handleApplyAutoFill` report through `msg`, which renders behind the open modal.
  - A successful assign from the modal doesn't close it or update the page.
  - The suggestions fetch turns an `ok:false` into "No available volunteer" and never handles a thrown error, so it can hang on "Finding the best fits…".
  - The assign feedback gap exists on `main` too, but nobody could reach it there: the picker was always empty, so nobody could be assigned.
- **Nothing tells the admin why someone isn't suggested (Agents 3 and 4).** The full list shows no monthly-limit or same-day badge, and ineligible reasons are never displayed.
- **The planner's inputs are thinner in production than in the demo (Agents 1 and 4).**
  - Blockout dates can't be entered anywhere. Verified: nothing in `app/`, `components/` or `lib/` writes `volunteer_blocked_dates`.
  - Day bucketing is UTC.

## 2. Corrections and verifications during synthesis

1. **Agent 1's missing-index finding is verified.** `volunteer_shifts` indexes are the pkey, `plan_id`, `event_id` and `confirmation_token` only. Both functions do per-profile correlated scans of a church's shifts with no `church_id`/`assigned_user_id` index. This is a real scaling problem, and it is fixed in this branch (P1).
2. **Agent 4, finding 2: the example is wrong, the point stands.** Agent 4 said the seeded Greeter fill "is exactly this case". It isn't: Greeter requires `hospitality`, and Maya and Samuel have it. The underlying point is right, though. For a position with *no* required skills, auto-fill can propose any non-merged church member, including people who have never volunteered. Accepted, fixed in P4.
3. **Agent 4: "burnout-calculator isn't wired" is accurate.** It's also deliberate. The planner needs the whole pool's load in one query, and the calculator is per volunteer. Every apply still runs through `assignVolunteerAction`, which does call the calculator, so it remains the final word. The duplicated threshold constant is recorded as a follow-up.
4. **Agent 1: "the auto-fill race" is accepted as a real but narrow risk.**
   - A double-clicked Apply is already prevented: the button shows a loading state while pending.
   - The remaining case is two admins applying the same plan at the same moment.
   - The Supabase JS client can't open a transaction, so a proper fix is a transactional `assign_volunteer_shift` RPC. That is out of scope here and recorded as a follow-up.
5. **Agent 1's pre-existing finding is verified in source.** `assignVolunteerAction` doesn't check that the position belongs to the plan, that the profile belongs to the church, or that the position has capacity. It's cheap, and the planner depends on the same guarantees, so it is fixed here (P2).
6. **Agent 2: "`window.location.reload()` isn't needed; `revalidatePath` already updates the page". Wrong for this component, found during P3.**
   - `ServicePlanBuilder` keeps the plan in `useState(initialDetail)`. A router refresh fetches new server props but never updates that state, so the roster would stay stale.
   - The fix that shipped: all three assignment paths (a normal assign, a burnout override, and applied auto-fill results) add the new shift to local state through one `addAssignedShift` helper. Done then simply closes the modal. No reload, no router refresh.
7. **Scores accepted.** Agent 4: Volunteer Scheduling 84% (from 80%; the 80% was generous given the empty picker), gap 1 about 85% closed, MVP readiness **70/100 (+1)**.

## 3. ADR Assessment

**No new ADR.** The branch follows existing conventions:
- SECURITY INVOKER functions under RLS (as in ADR 0022's scoping rules);
- Supabase-only new code;
- the coverage manifest.

The same-day rule is now enforced identically in the planner (SQL) and in `assignVolunteerAction`. That is documented in code comments and in `docs/testing.md`'s DB-test layer.

## 4. Implementation Prompts

### In this branch (proposed; needs human approval)

**P1 — Database: indexes, set-based functions, grants, RLS-exercising tests.**
- Add `volunteer_shifts (church_id, assigned_user_id, starts_at)`.
- Rewrite both functions as one grouped aggregate over the church's shifts, joined to profiles, instead of correlated subqueries per profile.
- Make the directory's year filter a range, so it is sargable.
- `revoke execute … from public, anon` on both functions.
- Extend `tests/database/volunteer-pool-functions.test.ts` to call the functions as `authenticated` with JWT claims, proving three things:
  - a church admin gets full data;
  - a ministry leader gets the same counts;
  - another church's admin gets nothing.

**P2 — Assignment integrity.**
- `assignVolunteerAction` verifies that the position is on the plan in the caller's church, the profile is in the church, and the position has an open slot.
- `applyPlanAutoFillAction` re-applies the "at least one required skill" rule.
- Action tests for each.

**P3 — Plan page and directory UX.**
- **Modal feedback:**
  - a successful assign closes the modal and updates the roster, the same way the burnout-override path already does;
  - assign and auto-fill errors show inside the modal;
  - the suggestions fetch has an error state and a `.catch`.
- **Refresh:** replace `window.location.reload()` with closing the modal plus `router.refresh()`.
- **Full list badges:** "At monthly limit" and "Already serving that day", with the same-day row disabled. Consistent labels across all three places ("N shifts in 30 days", "Unavailable that day").
- **Copy:**
  - timing chips say "… before this service";
  - plainer subtitle for the Suggested panel;
  - pluralize "Apply N assignment(s)";
  - an empty-state line when auto-fill found no one.
- **Directory:** `Table.ScrollContainer` for phone widths.
- **Tests:** a component test for the Monthly-limit input.

**P4 — Planner rule: only known volunteers are suggested or auto-filled.**
- `get_volunteer_pool` returns `is_volunteer`: the person has a volunteer profile or has ever had a shift.
- The planner treats non-volunteers as ineligible, with the reason "Not a volunteer yet". The full list still shows everyone, so an admin can assign a first-timer by hand.
- Unit and DB tests.

### Follow-ups (not in this branch)

- **FS3-1 (High, adoption).** Blockout date entry: volunteer self-service from the member schedule page, plus admin entry in the directory. Without it, "Unavailable that day" only fires on seed data. **Recommended as the next story, before Story 4.**
- **FS3-2 (Medium).** Notify volunteers on assignment, auto-fill included, with the accept/decline link. Suggest a replacement after a decline.
- **FS3-3 (Medium).** A transactional `assign_volunteer_shift` RPC to close the two-admins-at-once race.
- **FS3-4 (Medium).** Church-timezone day bucketing: shifts, blocked dates and conflicts are UTC days today.
- **FS3-5 (Low).** Share the 3-shifts-in-30-days rule between `lib/burnout-calculator.ts` and the planner, and align their windows.
- **FS3-6 (Low, competitive).** Multi-week auto-scheduling, household "schedule with", and volunteer-set preferred frequency.

## 5. Resolution (approved by the owner 2026-09-26: P1–P4 in this branch, blockout entry next)

All four prompts landed in this branch.

**P1 — database.**
- New index `volunteer_shifts_church_assignee_starts_idx`.
- Both functions are rewritten as grouped aggregates, one pass per table. The directory's year filter is now a range.
- EXECUTE is revoked from `public` and `anon`.
- The migration hadn't left the branch, so it was edited in place, with `drop function if exists` so a re-applied local migration picks up the new return type.
- `tests/database/volunteer-pool-functions.test.ts` now runs as `authenticated` with JWT claims. It proves:
  - a church admin and a ministry leader get the same complete pool;
  - another church's admin gets nothing from either function;
  - anon can't execute either function.
- The existing count and window tests pass unchanged against the rewrite: 9/9.

**P2 — assignment integrity.**
- `assignVolunteerAction`, on the Supabase path, refuses a position that isn't on the plan in the caller's church, a volunteer outside the church (or merged), and a position with no open slot.
- `applyPlanAutoFillAction` re-applies the required-skill rule and reports ineligibility in plain words (e.g. "Unavailable that day").

**P4 — planner rule.**
- `get_volunteer_pool` returns `is_volunteer`: the person has a volunteer profile or has ever been scheduled.
- Non-volunteers are ineligible for suggestions and auto-fill, with the reason "Not a volunteer yet". They can still be assigned by hand.

**P3 — UX.**
- **Modal feedback:**
  - a successful assign closes the modal and shows the volunteer on the position;
  - assign and apply errors appear inside the open modal (`role="alert"`);
  - suggestions show an error state, with a `.catch`, and refetch after each assignment.
- **Full list badges:** "At monthly limit (n/max)", and "Already serving that day" with Assign disabled. The latter also covers people already on this plan.
- **One set of labels** from `lib/rotation-planner.ts`: "N shifts in 30 days", "Unavailable that day", "… before this service".
- **Copy:** a plainer subtitle for the Suggested panel, "Apply 1 assignment" pluralized, and an empty-state line when auto-fill finds no one.
- **Plan counts:** removing an assignment now reopens the slot, so the Auto-fill button comes back.
- **Directory:** `TableScrollContainer` (900px minimum) for phones.

**Tests added:**
- 6 component tests for the plan page's feedback and badges;
- 4 for the Monthly-limit input;
- a directory row test;
- 6 action tests, for the integrity checks and the skill rule;
- 1 planner test for the known-volunteer rule;
- 4 DB tests.

**Verification:**
- `npx tsc --noEmit`: clean.
- `npm run lint`: 0 errors, 7 warnings, all pre-existing.
- `npx vitest run`: 147 files, 1,754 tests passed.
- `npm run test:db`: 27 passed.
- `npm run test:surfaces`: OK.
- `npm run lint:migrations`: PASS.
- `npm run test:e2e:local` on the rotation journey plus every volunteers page × role: 42 passed.
- `npm run build`: passed, inside the e2e runner.

## 6. Execution Order (as planned)

P1 → P2 → P4 → P3. The database and action changes land before the UI that surfaces them. Then re-run:
- `npx tsc --noEmit`
- `npm run lint`
- `npx vitest run`
- `npm run test:db`
- `npm run test:surfaces`
- `npm run lint:migrations`
- the rotation journey and volunteer pages via `npm run test:e2e:local`

Then the Documenter close-out.
