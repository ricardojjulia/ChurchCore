# Council Review 20 — Agent 2: Route & Page Audit

**Branch:** `feat/blockout-dates-g1-4`, diff-scoped to commit `e54a856`.

## 1. Role gating (verified)
- **Directory:** the page gate matches the actions' gate (church-admin, pastor, ministry-leader).
- **`/app/member/schedule` is `member`-only.** Staff who volunteer can manage their own dates only through the directory, and only if they're listed there. A secretary has no signed-in path at all. This predates the diff; staff also can't accept or decline in-app.
- **One failure takes down the page.** `listMyBlockoutDatesAction` throws on a DB error inside the page's `Promise.all`, so a failed read takes down the whole member schedule.

## 2. Client → action calls (verified)
- All 9 exports come from the `"use server"` module, and the argument shapes match.
- Every path handles errors.
- `revalidatePath` targets are correct, including the plan pages via `"layout"`.

## 3. Public token pages
- **Link states render correctly:**
  - An invalid or expired link shows "Invalid or Expired Link" on the confirm page, and "No Upcoming Assignments" with no panel on the schedule.
  - A declined shift's token stays valid.
  - Event-only shifts render correctly, and so do shifts with neither a plan nor an event.
- **Server components may call `"use server"` functions** (bundled Next docs, `use-server.md`). Those functions are also POST endpoints, gated by the token.
- **Bug (verified):** `app/portal/volunteer/schedule/[token]/page.tsx:95` uses `shift.confirmation_token ?? token`. Only reminders create tokens, so a sibling shift that was never reminded opens the page's own shift. **This is the wrong shift.**
- **Wrong claim in the commit message (verified):** nothing emails `/portal/volunteer/schedule/…`. Reminder emails link to the confirm page, and only the confirm page links to the schedule (`volunteer-confirm-client.tsx:166`).
- **(Inferred)** Formatting times in UTC is right for planner-written shifts; other writers would show the wrong time.

## 4. Coverage manifest (verified)
- All 9 exports are registered, and the test pointers are right.
- `sweepMode: "invalid-token"` should stay. The valid-token path is covered by the rotation spec, but it runs with the admin `storageState`, not anonymously.

## 5. The same `start`/`"end"` bug elsewhere (verified)
Two instances remain, both on the deprecated local-SQL path:
- `app/app/church-admin/onboarding/actions.ts:68,76`: the sandbox-hydrate insert;
- `app/api/reports/custom/route.ts:73-76`: the events export (known item S3).

## 6. Summary

| Route | Status | Notes |
|---|---|---|
| `/app/member/schedule` | Pass, with gap | Member only; a failed read takes down the page |
| `/app/church-admin/volunteers` | Pass | |
| `/portal/volunteer/confirm/[token]` | Pass | |
| `/portal/volunteer/schedule/[token]` | Bug | Respond falls back to the wrong token |
| Roster badge | Pass | |

**Top findings, ranked:**
1. **(Medium)** Respond falls back to the wrong token.
2. **(Low–Medium)** Staff have no self-service blockout panel.
3. **(Low)** `start`/`"end"` on the local-SQL paths.
4. **(Low)** A failed blockout read takes down the member page.
5. **(Low)** The e2e portal journeys run authenticated, and the "emailed schedule link" wording is wrong.
