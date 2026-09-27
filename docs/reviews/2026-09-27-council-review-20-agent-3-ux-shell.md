# Council Review 20 — Agent 3: UX & Shell Audit

**Branch:** `feat/blockout-dates-g1-4`, diff-scoped to commit `e54a856`.

**Verdict:** sound, and the public-link fixes make those pages work at all. But the feature's promise has a dead end, described below.

## Top 3 pain points
1. **"Please also decline that shift" is impossible once the shift is confirmed (verified).**
   - The member page shows Confirm and Decline only for pending shifts (`member-schedule.tsx:100`), and the link schedule shows Respond only for pending shifts.
   - The warning doesn't say which shift.
   - **Fix:** let volunteers decline a confirmed shift ("Can't make it") and name the shift in the warning.
2. **Vacations are painful.**
   - A range becomes one row per day: a 3-week trip is 21 rows, each with its own trash icon.
   - A single shared `isPending` blocks every button.
   - Re-adding a day with a new reason is silently ignored.
   - **Fix:** group consecutive days into one row with a single remove, track pending per row, and update the reason.
3. **English-only on a translated page, and raw DB errors (verified).**
   - `MemberScheduleView` is translated; the panel isn't, and `formatDay` hard-codes `en-US`.
   - `error.message` from Supabase reaches volunteers.
   - **Fix:** i18n keys in all locales, and a friendly error with a server-side log.

## Accessibility
- The inputs and buttons are labelled.
- After add or remove, focus drops to the page body.
- The roster "Unavailable" badge explains itself only in a tooltip, which keyboard and touch users can't open.
- The alert regions exist only when shown.
- A disabled Add button gives no hint about why.

## States
- An expired link makes the panel vanish silently. Say "This link has expired…".
- No "Saved" confirmation.

## Mobile (375px)
- `ActionIcon size="lg"` is 34px. Use `xl` (44px).
- The input row wraps raggedly; stack below `sm`.
- The link page's "Respond" is a small Badge; make it a Button.
- The directory is 1000px wide and the new column is last.

## Copy
- "To (optional)" is unclear. Suggest "First day" and "Last day (leave blank for one day)".
- The admin "Dates" button is vague.
- The native date format (mm/dd vs dd/mm) doesn't match the list format; add a weekday preview.

## Smaller
- "Today" is in UTC (G1.6).
- Link each warned date to its plan.
