Status: AMENDED
Date: 2026-10-06
Branch: feat/suppressions-page-s11 vs main (ad2219f)
Related: DEVELOPMENT_PLAN §0 row S11 (widened by Council Review 32); factory run docs/factory-runs/2026-10-06-s11-suppressions-page.md; docs/runbooks/communications.md §3
Tags: communications, consent, compliance, ui
Surfaces: /app/communications/suppressions (new page; pastor, church-admin, secretary); removeSuppressionAction (new, "use server", church-admin); suppressContactAction (changed: insert-or-refuse, returns { ok, error })

# Council Review 44 — Synthesis (S11: Suppressions page)

Five separate read-only agents reviewed the branch. Their reports are in `2026-10-06-council-review-44-agents-1-5.md`.

## Status

**AMENDED**: the branch is ready once the small fixes below land. The owner decides.

**What the branch delivers:**
- **The page.** A Suppressions page under Communications that church admins, pastors and secretaries can view. It lists each suppression with its reason in words, the matched member name, notes, who added it and the date, with a channel filter and a search box.
- **Adding (church admins only).** Admins can add a suppression. The add path now **refuses duplicates** where it used to upsert. The upsert would have let an admin re-add an unsubscribed address as "manual" and then remove it, which would have defeated the owner's lock.
- **Removing (church admins only).** Removal applies to **bounce and manual** suppressions only. It needs a reason of at least 5 characters, is audited, and only touches rows in the admin's own church.
- **Locked rows.** Unsubscribe/STOP and spam-complaint rows are shown but locked: "Only the person can opt back in."

## Fixes required

1. **The table can't scroll on phones** (A3, confirmed). The table sits in `Paper` with `overflow: "hidden"` (`components/application/communications-suppressions-workspace.tsx:254`), so columns are cut off at 390px. Fix: wrap it in `Table.ScrollContainer`, or set `overflowX: auto` with a minimum width, as other workspaces do.
2. **Results aren't announced** (A3, confirmed). The add and remove success and error feedback has no live region. Fix: put the feedback `Alert` in a `role="status" aria-live="polite"` region.
3. **The 1,000-row cap is silent** (A1, confirmed). `listChurchSuppressions` caps the list at 1,000 rows with no notice. Fix: return whether the list was truncated, and show "Showing the newest 1,000 suppressions; search to find others."
4. **The audit-failure message overstates the gap** (A5 and orchestrator). If the explicit audit write fails after the delete, the table's database audit trigger has already recorded the delete, so the deletion is not unaudited. Fix: reword the error to say the removal happened and was recorded, but the detailed audit entry (with actor and reason) failed, and the platform team should be told.

## Consensus

- **Authorization, tenancy, the lock and IDOR protection all hold** (A1, A2, A5).
  - Both actions authenticate and check their own role.
  - Every admin-client query is scoped by `church_id`.
  - The delete filter re-checks `reason in (bounce, manual)`.
  - Another church's suppression id returns "not found".
- **The gate matches `/app/communications/history`, the sub-nav item is everywhere, and the manifest and e2e test are in place** (A2).
- **The consent decision is sound** (A4, A5): locked types can only be re-enabled by the person. The legal points are recorded as UNVERIFIED, since they come from no legal review.

## Recorded, not fixed

- **Two audit rows per removal** (A1): one from the trigger, without the actor, and one explicit, with the actor and reason. This is complete and only noisy. Merging them is post-MVP.
- **No retention policy for suppressions** (A1). That is a policy question for later.
- **Pastors and secretaries get no "admins only" hint** (A3). That is minor and post-MVP.
- **Hydration duplicates** (A3). The e2e test notes that streamed markup briefly duplicates inputs before hydration. It was not reproduced as a user-facing defect, and the test waits for one input. Watch it if other streamed pages show it.

## Wrong or unsupported agent claims (6)

1. **A1:** "SELECT & INSERT for `authenticated` via can_manage_communications". S1 (`20261001000000`) dropped every authenticated insert policy on the communications tables; `authenticated` has **reads only** (A5 confirms this).
2. **A1:** "missing DELETE RLS policy … architectural debt". There is no authenticated delete path by design, and every write goes through the church-scoped admin client (ADR 0022). That is the intended pattern, not debt.
3. **A2:** called `suppressContactAction` a "new action". It existed; this branch changed it.
4. **A3:** "ADR 0026 … teal is not a spec color; replace `color="red"` with rose and `teal` with indigo". ADR 0026 explicitly keeps teal as ChurchCore's secondary accent (line 102), and `color="red"` for destructive actions is used about 116 times across the app.
5. **A3:** "the modal has no `aria-labelledby`; focus is not restored on close; `data-autofocus` is not standard". Mantine's `Modal` labels the dialog from its `title` and returns focus on close by default, and `data-autofocus` is Mantine's documented initial-focus mechanism.
6. **A4:** "automated preference centers (Should row S20/S21)" and "slack ~6 days".
   - S20 is "update card" and S21 is "cancel abandoned setups".
   - The Documenter's recount from the table is about 11 days of slack.
   - Its competitor table is unsourced.

## Score

**Readiness 89/100** on merge, up from 88. S11 is done, and M3 then needs only T1a.

## Prompt A — Council Review 44 fixes

**Files:**
- `components/application/communications-suppressions-workspace.tsx` and its test
- `lib/communications/suppressions.ts` and its test
- `app/app/communications/suppressions/page.tsx`
- `app/app/communications-actions.ts` and its test

**Work:** fixes 1–4.

**Verification:**
- `npx vitest run`
- lint, `tsc`, `test:surfaces`, build, the theme ratchet
- e2e `communications-suppressions.spec.ts`

## Definition of done

- [ ] Unit tests pass (count)
- [ ] Surfaces: `npm run test:surfaces` OK
- [ ] Lint: 0 errors
- [ ] Types: `npx tsc --noEmit` clean
- [ ] Build succeeds
- [ ] E2E: suppressions spec passes locally; CI `verify` and 4 `e2e` shards green before merge
- [ ] Migration: none on this branch
- [ ] Commits verified on GitHub
- [ ] GitHub review comments read, fixed or answered, threads resolved
- [ ] Documenter close-out committed. It must also record G5.1 merged (#188), O12 done and Gap 5 closed (2026-10-06), #189 merged, and S11.
