# Council Review 19 — Agent 3: UX & Shell Audit

**Branch:** `feat/service-planning-rotation-planner`, diff-scoped to commit `eca7bb1` (Service Planning Story 3). "Verified" means read in source; "inferred" means not run.

## 1. Accessibility
- **Verified:** the icon-only controls are labelled: "Save monthly limit for {name}", "Monthly limit for {name}", "Remove {name} from the proposal". Both modals are titled.
- **Verified:** "Apply 1 assignments" is a pluralization bug (`volunteer-schedule.tsx:2322`).
- **Verified:** status isn't conveyed by color alone; the badges carry text.
- **Inferred:** focus is lost when Remove deletes the focused button and when Apply is swapped for Done. Remove has no undo.
- **Pre-existing:** the Assign modal's search box has a placeholder and no label (`:2371`).

## 2. Loading, empty and error states
- **Verified, most serious:** errors raised inside an open modal go to `msg`, which renders behind the modal (`:2041`):
  - `applyPlanAutoFillAction` failure (`:1302`)
  - `handleAssign` failure (`:1326`)
  - `handleAssign` success (`:1318`), which also doesn't close the modal, update `detail`, or refetch suggestions. The just-assigned volunteer stays in Suggested, and a second click fails silently.
- **Verified:** the suggestions fetch has no `.catch` (`:1279`), and an `ok:false` shows as "No available volunteer".
- **Verified:** a single shared `isPending` spins unrelated buttons. Nothing gets stuck.
- **Verified:** when every slot is empty, the disabled button reads "Apply 0 assignments". It needs an empty-state line.

## 3. Mobile (375px)
- **Verified:** the directory has 8 columns in a `<Table>` in a plain `<Paper>`, with no scroll container. **Inferred:** at 375px it overflows the page sideways and the new column is off-screen.
- **Inferred:** the modal rows hold up.
- **Inferred:** the frequency input's error wraps into a narrow column.

## 4. Copy
The same concepts are worded differently in the three places:

| Concept | Suggested panel | Full list | Ineligible label |
|---|---|---|---|
| Recent shifts | "1 in last 30 days" | "3 shifts (30d)" | "High load (3+ in 30 days)" |
| Unavailable | — | "Blocked date" | "Unavailable that day" |
| Skills badge | gray | green | — |

- "skills, then rest and recent load" is jargon.
- "Served 3 days before" / "Last served 2 weeks before" should say "before this service".

## 5. Assigning volunteers who aren't suggested
- **Verified:** the full list disables only blocked dates. The three other ineligible cases are handled like this:

  | Volunteer | What happens |
  |---|---|
  | 3-shift threshold | Burnout confirmation |
  | At monthly limit | Assigned with no warning; there's no badge, and `assignVolunteerAction` doesn't check the limit |
  | Already serving that day | No badge; the server refuses, but the error lands behind the modal |

- **Inferred:** override is probably intended. Nothing tells the admin why someone isn't suggested: ineligible volunteers are filtered out and their reasons are never shown.

## 6. Top 3 pain points
1. **Assigning from inside the modal gives no feedback.** Close the modal and update `detail` on success, as `handleConfirmBurnoutAssign` already does. Show errors inside the modal. Refetch suggestions. Same for Apply.
2. **Nothing explains exclusions or monthly limits.** Show ineligibility badges in the full list, warn before exceeding a monthly limit, and use one set of labels.
3. **The directory is unusable on a phone.** Use `Table.ScrollContainer` or cards.

**Smaller:** pluralize Apply; add `.catch` and an error state to suggestions; give each action its own pending flag.
