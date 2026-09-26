# Council Review 19 — Agent 2: Route & Page Audit

**Branch:** `feat/service-planning-rotation-planner`, diff-scoped to commit `eca7bb1` (Service Planning Story 3).

**Verdict:** no blocking route or page defects. Role gates line up across page, action and manifest. The Mantine dot-notation crash class has **zero remaining instances** in server components.

## 1. Role gating (verified)
- The directory page (`app/app/church-admin/volunteers/page.tsx:33-40`) and the plan page (`schedules/[id]/page.tsx:19-25`) both admit church-admin, pastor and ministry-leader.
- `requireServicePlanWriteAccess` (`volunteer-actions.ts:36-42`) admits the same three roles, and so does `tests/coverage-manifest.json`.
- No role can see a control and then get "Unauthorized" from its action.
- Policy note (inference): ministry-leaders can set the church-wide monthly limit for any volunteer.

## 2. Client → server action calls
- **Wiring is correct.** All four actions are exported from the `"use server"` module, and the argument shapes match the call sites.
- **Medium — `volunteer-schedule.tsx:1280-1283`: the suggestion `useEffect` swallows failures.**
  - `ok:false` is stored as `[]` and shown as "No available volunteer for this date".
  - The promise has no `.catch`, so if the action throws, the panel stays on "Finding the best fits…" forever.
- **Surfaced correctly:** `handleProposeAutoFill`/`handleApplyAutoFill` errors go through `setMsg`, per-row results show their errors, and `VolunteerFrequencyInput` shows its error.
- **Low — `volunteer-schedule.tsx:2244, 2315`: `window.location.reload()` isn't needed.** `applyPlanAutoFillAction` already calls `revalidatePath` on the current route, and the bundled Next docs (`01-app/01-getting-started/07-mutating-data.md`) say that updates the client router. Suggest `setAutoFill(null)`, plus `router.refresh()` if needed.

## 3. revalidatePath (verified)
The paths match real routes. Auto-fill doesn't revalidate the schedules list or the directory. That matches existing `assignVolunteerAction` behaviour, and both pages are dynamic.

## 4. Mantine dot-notation in server components (verified)
- **Why it crashes:** `@mantine/core`'s `Table.mjs` is `"use client"`, so dot members are undefined from a server component.
- **Scope of the search:** every `.tsx` in `app/`, `components/` and `lib/` that uses `<X.Y` JSX or non-JSX compound members.
- **Result:** 47 files, all of which have `"use client"` as their first statement. `app/hq/page.tsx` is a client page. The volunteer directory was the only server-component instance, and this commit fixed it.

## 5. Coverage manifest (verified)
- The seeded `dynamicParams.id` matches `supabase/seed.sql`. The plan date is relative, so it won't go stale.
- The spec pointer exists, and the four new exports are named in `app/app/rotation-planner-actions.test.ts`.
- **Low:** `volunteer-frequency-input.tsx` has no test, and the directory's new column is untested.

## 6. Summary

| Route | Status | Notes |
|---|---|---|
| `/app/church-admin/volunteers` | OK | Crash fix confirmed; the new column is untested |
| `/app/church-admin/volunteers/schedules/[id]` | OK with nits | Suggestion errors are swallowed; reload is unnecessary |
| 4 new server actions | OK | Gates and paths are correct |

**Top findings:**
1. Swallowed/hanging suggestion fetch (Medium).
2. Unneeded `window.location.reload()` (Low).
3. No test for the Monthly-limit input (Low).
4. `updateVolunteerFrequencyAction` upserts a volunteer profile for any church profile. It is tenant-scoped (Low).
5. No remaining dot-notation server components (informational).
