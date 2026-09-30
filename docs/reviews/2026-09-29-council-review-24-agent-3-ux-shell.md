# Council Review 24 — Agent 3: UX & Shell

**Scope:** `feat/church-timezone-days-g1-6`, `ad09cab` vs `main`. Read-only.

## 1. Where shift dates and times are shown

| Surface | Zone | Verdict |
|---|---|---|
| Member schedule (`member-schedule.tsx:36-44`) | UTC (wall-clock) | OK |
| Portal confirm/schedule via `describePublicShift` (`lib/volunteer-portal.ts:50-62`) | UTC | Labels OK — but see issue 1 |
| Emails/SMS (`volunteer-notifications.ts:80-95`) | `service_date` + `service_time` | OK |
| Blockout panel days | UTC | OK |
| Admin plan dates (`volunteer-schedule.tsx:125-126`) | local-to-local | OK |
| **Run-of-service item times (`volunteer-schedule.tsx:625,627`)** | **browser** | **Wrong**: items come from `datetime-local` inputs with no offset, stored like shift times; after a reload a New York admin sees a 10:00 item as "6:00:00 AM" (and seconds are shown). Pre-existing. |
| Event picker labels (`:295,780`) | browser | Minor: `events.starts_at` is a real instant |
| "Responded"/"last reminder" (`:129-135`) | browser | Acceptable (real instants) |

## 2. Date messages

"You can't mark a date in the past" / "Past dates can't be changed" now use the church's day; a traveller ahead of the church can still see "past" for their own today, and the copy doesn't say whose calendar. "That shift isn't assigned to you, or it has already happened" joins two failures. The confirm page's expiry copy is now accurate.

## 3. Is the time zone shown?

No, anywhere. A short "Times are in the church's local time" line on the portal pages, the member schedule and the email footer would make ADR 0023's convention explicit. Cheap, not blocking.

## Top 3

1. **The portal schedule drops tonight's shift hours early** (`volunteer-actions.ts:2009`; verified) — the same bug G1.6 fixed, missed here; the two schedules disagree.
2. **Run-of-service times shown in the browser's zone** (`volunteer-schedule.tsx:625,627`; verified, pre-existing) — use `{hour, minute, timeZone: "UTC"}` per ADR 0023.
3. **The zone is never shown, and "past" copy doesn't say whose calendar** (inferred).
