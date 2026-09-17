# Council Agent 3: UX & Shell Audit — Council Review 7

**Date:** 2026-06-21  
**Auditor:** Agent 3 — UX & Shell Quality  
**Status:** Complete  

---

## 1. UI Elements & Layout Structure

We designed the user-facing confirmation flow:
- **`ChildrenSessionPage` design pattern:** Mimic the clean card design used in the parent check-in portal, using Mantine theme wrappers.
- **Decline Reason Overlay:** If a user clicks "Decline", render a text input modal asking for a reason, which is passed back to the database to help coordinators reschedule.
- **Mobile responsiveness:** Optimize layouts for mobile screens since over 90% of volunteer links will be tapped from SMS alerts or email applications.

---

## 2. Interactive Confirm/Decline Experience

- **Action Success States:** Upon clicking Confirm/Decline, show a clean, success banner (e.g. "Thank you for confirming! Your team leader has been notified.") and disable interactive controls to prevent double clicks.
- **Visual Status Badges:** Use color keys matching Mantine rules:
  - `confirmed` -> Teal
  - `declined` -> Red
  - `pending` -> Yellow
