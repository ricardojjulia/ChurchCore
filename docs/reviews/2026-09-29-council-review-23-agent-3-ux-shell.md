# Council Review 23 — Agent 3: UX & Shell

**Scope:** `feat/assignment-notifications-g1-5`, `83b7a2d` + `a99cfea` vs `main` (G1.5), docs excluded. Read-only.

## 1. What the admin sees

Strings: `volunteer-schedule.tsx:1403` ("{name} assigned as {role}." + `describeNotification`, always a green toast, even when the second sentence is a skip or failure); `:1434` (same, with "(bypass audit logged)"); `:1519` (red: "Reminder logged for {name}, but {reason}"); `:1520` (green: "Reminder sent to {name}. Email sent." — repetitive); `:2209` ("Marked this date off ({reason}). Find a replacement."); `:2237` (Find replacement); `:2385-2388` (per-row auto-fill outcome, dimmed when sent, orange otherwise); `lib/volunteer-notifications.ts:112-121` and `app/app/volunteer-actions.ts:2585-2593` (the sent/skipped/failed reasons).

Plain, no internal codes; only partly actionable ("no email or phone on file" gives no link to the profile; "failed" doesn't say Remind retries). Find replacement makes sense; the blockout reason is clear and React-escaped.

## 2. The volunteer's message (`volunteer-notifications.ts:84-107`)

- Date and time correct; time shown as wall-clock with no timezone label (acceptable). Inferred edge case: the no-plan fallback `new Date(starts_at).toISOString().slice(0,10)` (`volunteer-actions.ts:2560`) can shift the date by a day.
- **No church name anywhere** (verified): subject and body say only "{role} for {planName}". An SMS from an unknown number with no church name looks like spam.
- **SMS length:** roughly 300–400 characters (2–3 segments), and the note has no length limit.
- Link to `/portal/volunteer/confirm/{token}`; falls back to `http://localhost:3000` without `NEXT_PUBLIC_APP_URL` (inferred production risk).
- No HTML injection: the email is plain text (no `html` passed to `sendWithSuppression`).

## 3. Loading and double-submit

Assign, Remind and Remove share one `isPending`, so double-submit is blocked (every button spins together). The reminder counter increments even when nothing was delivered (`:1500-1512`, verified), so "1 reminder · last …" looks like a successful contact.

## 4. i18n

The component has no `useI18n`/`t()` at all, so the new hardcoded strings match their surroundings. Not a regression.

## 5. Accessibility

Toasts use `Alert` (`role="alert"`). The per-row auto-fill outcome (`:2385`) has no live region (inferred not announced). Buttons are labelled; colour isn't the only signal.

## 6. Top 3

1. **A skipped or failed notification shows in a green success toast** (`volunteer-schedule.tsx:1401-1404`, `:1432-1435`; verified). Show yellow when the status isn't "sent", as the reminder path already does.
2. **No church name in the email or SMS** (`volunteer-notifications.ts:87-99`; verified). Also trim the SMS to about 2 segments.
3. **"Find a replacement." has no action for a volunteer who blocked the date but didn't decline** (`:2209` vs `:2228`; verified): Find replacement shows only for declines, and if the position is otherwise full, Assign is disabled, so the admin must know to Remove first.

Minor: the reminder count increments on a failed send; "Reminder sent… Email sent." repeats; the deprecated local-SQL reminder path returns ok without a notification.
