# Council Agent 1: Database & API Audit — Council Review 7

**Date:** 2026-06-21  
**Auditor:** Agent 1 — Database & API State Audit  
**Status:** Complete  

---

## 1. Schema & Migration Analysis

For the volunteer sessional follow-up system:
- **Shift Token Storage:** We recommend extending the existing `public.volunteer_shifts` table with two nullable fields: `confirmation_token` (text, unique) and `confirmation_token_expires_at` (timestamptz). This avoids joining additional tables during high-volume API requests.
- **Row Level Security (RLS) Policy Extensions:** Add a public RLS select and update policy on `public.volunteer_shifts` allowing anonymous operations when matching a valid, unexpired token:
  ```sql
  create policy "volunteer_shifts_token_access"
  on public.volunteer_shifts
  for all
  using (
    confirmation_token is not null
    and confirmation_token_expires_at > now()
  );
  ```

---

## 2. API Design Requirements

We recommend adding the following server-side routines:
- **`generateShiftConfirmationTokenAction(shiftId)` [PASTOR/ADMIN ONLY]:** Generates a cryptographically random string using `gen_random_bytes(32)` and sets the expiry to 14 days.
- **`respondToPublicShiftAction(token, response, reason)` [PUBLIC/ANONYMOUS]:** Resolves the shift by token, updates `confirmation_status = response`, and invokes the audit logger.
- **`getPublicVolunteerScheduleByToken(token)` [PUBLIC/ANONYMOUS]:** Queries and returns a list of shifts sharing the profile associated with the token.

---

## 3. Database Security Controls

- **Token Hashing:** Store raw tokens in the DB, but ensure index lookups are restricted to exact equality matches (`=`).
- **PII Leakage Prevention:** The public API return payload must scrub profile metadata (DOB, email, phone) and return only event information.
