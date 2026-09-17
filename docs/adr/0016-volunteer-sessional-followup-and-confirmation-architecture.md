# ADR 0016: Volunteer Sessional Follow-up and Confirmation Architecture

* **Status:** Proposed  
* **Date:** 2026-06-21  
* **Authors:** Antigravity (Gemini Software Factory)  
* **Decisions:** [2026-06-21-council-review-7-synthesis.md](file:///Users/rjulia/ChurchCore/docs/reviews/2026-06-21-council-review-7-synthesis.md)  

---

## Context and Problem Statement

Volunteers are scheduled across multiple ministries (Worship, Men, Women, Married, Young Adults, Youth, Pastors, Children's Church, Parking, Security, Ushers, Tithe/Offerings, etc.). To confirm their availability, they currently must log in to the full ChurchCore portal. This sign-in requirement creates friction, resulting in low confirmation rates.

We need a sessional follow-up mechanism where schedulers can dispatch email or text alerts containing a secure, single-click link. This link must allow the volunteer to review details and confirm/decline their shift from any mobile device without logging in. Additionally, volunteers should be able to view their consolidated upcoming shifts across all ministries on a unified schedule view.

---

## Decision Drivers

* **Frictionless UX:** Allow single-click responses via secure, temporary tokens.
* **Security & Token Isolation:** Tokens must be cryptographically secure, church-scoped, and expire. No private details (PII, addresses) should be exposed via public token links.
* **Multi-Ministry Parity:** Support all key volunteer roles (Worship team, parking, security, ushers, children's ministry, etc.) with identical verification mechanics.

---

## Proposed Decisions

### 1. Database Schema Extension
Extend the `public.volunteer_shifts` table with secure token fields:
- `confirmation_token` (text, unique, nullable) - Cryptographically random sessional token.
- `confirmation_token_expires_at` (timestamptz, nullable) - Expiration timestamp (default: 14 days from generation).

Enable Row Level Security (RLS) policies on `volunteer_shifts` to allow public anonymous read/update of shifts *only* when matching a valid `confirmation_token` and within its expiration window.

### 2. Token-Gated Confirmation Portal Route
Create a new public route in Next.js:
- **Route:** `app/portal/volunteer/confirm/[token]/page.tsx`
- **Behavior:** This page queries the database by token (using an invoker-rights service role or public security-definer function). It renders shift details (Event Title, Ministry, Start/End times, Role Title) and provides "Confirm" and "Decline" actions.
- **Data Minimization:** Exclude all sensitive user profile columns (DOB, email, phone, addresses) from the public view.

### 3. Public Multi-Shift Calendar Route
Create a consolidated schedule view:
- **Route:** `app/portal/volunteer/schedule/[token]/page.tsx`
- **Behavior:** Displays a unified dashboard listing all shifts assigned to the profile linked to the provided token. Allows batch confirmation across all ministries.

### 4. Public Server Action
Expose a public/anonymous server action `respondToPublicShiftAction(token, response, reason)`:
- Validates the token and expiration.
- Updates the shift status (`confirmation_status = 'confirmed' | 'declined'`).
- Audit logs the response via `logAuditEvent`.

---

## Consequences

* **Positive:**
  - Dramatically improves volunteer response rates by eliminating portal sign-in barriers.
  - Keeps member PII isolated and secure behind expiration envelopes.
* **Negative:**
  - Generates additional token storage columns on the shift table.
  - Expiration policies must be clearly communicated to prevent stale link errors.
