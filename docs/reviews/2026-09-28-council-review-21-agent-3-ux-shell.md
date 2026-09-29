# Council Review 21 — Agent 3: UX & Shell Audit

**Branch:** `fix/session-church-profile-id`, commit `14461db`. Read from source; the app wasn't run.

## Error surfacing
- **Untranslated errors.** "Your account has no profile in this church." and "That shift isn't assigned to you." reach member-schedule toasts in English, even in Spanish.
- **Wrong message.** The self blockout panel says "Volunteer not found." to someone looking at their own dates.
- **Thrown errors:**
  - group join isn't caught, so it reaches the error page;
  - elders AI misreports it as "temporarily unavailable";
  - donor, data-rights and shepherd show generic text in production.

## Member schedule, now that it has data
- **Invalid date:** "Invalid Date" appears when `plan_id` is null, because `serviceDate` is empty (`member-schedule.tsx:95`).
- **es-PR dates:** es-PR users get English dates.
- **No times shown.**
- **Shared pending state** across every card.
- **Mismatched filters:** the local and Supabase date filters differ (`service_date >= current_date` vs `starts_at >= now()`).
- **Small buttons:** about 30px, not 44.

## Platform admin viewing a tenant
Member pages show empty lists and failing buttons with no explanation. The minimal fix is a translated notice, and disabling personal actions when `churchProfileId` is null.

## Top 3
1. Return `{ ok: false, code: "no_profile" }` instead of throwing.
2. Error codes, translated in all three locales.
3. Fix the member-schedule date line: fall back to `startsAt`, use the locale's date format, and show times.
