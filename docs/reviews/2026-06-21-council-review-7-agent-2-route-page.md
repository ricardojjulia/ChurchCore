# Council Agent 2: Route & Page Audit — Council Review 7

**Date:** 2026-06-21  
**Auditor:** Agent 2 — Route & Page Coverage  
**Status:** Complete  

---

## 1. Page & Route Architecture

The follow-up system requires adding two public Next.js page routes under the portal tree (which is open to unauthenticated traffic):

1. **`app/portal/volunteer/confirm/[token]/page.tsx` [NEW]:**
   - Resolves params `token`.
   - Renders a clean details layout showing the Event Title, Role Name, Ministry, Date, Time, and Notes.
   - Provides interactive action triggers to confirm or decline.
2. **`app/portal/volunteer/schedule/[token]/page.tsx` [NEW]:**
   - Resolves the token and retrieves all scheduled shifts for that user across all ministries.
   - Renders a calendar visual list displaying verification status cards.

---

## 2. Link Generation & Template Coordination

- **Reminder Integration:** In `sendVolunteerReminderAction` inside [volunteer-actions.ts](file:///Users/rjulia/ChurchCore/app/app/volunteer-actions.ts), if the channel is `email` or `sms`, the system must generate the token and construct the URL:
  ```
  ${process.env.NEXT_PUBLIC_SITE_URL}/portal/volunteer/confirm/${token}
  ```
- **Auditing Gaps:** Verify that clicking these links does not redirect users to the login panel, preventing UX breaks on mobile clients.
