# Council Review Synthesis: Core Challenges & Next Actions — Council Review 7

**Date:** 2026-06-21  
**Review ID:** Council Review 7  
**Status:** Complete  

---

## 1. Cross-Agent Consensus

The 4 council agents reviewed the proposed volunteer sessional follow-up/verification feature and reached consensus on the following points:

1. **Database Schema Extension (Agent 1 & Agent 4):**
   - Add `confirmation_token` and `confirmation_token_expires_at` directly to `public.volunteer_shifts` to minimize join latency. Configure public RLS select/update permissions matching these token inputs.
2. **Public Routing Isolation (Agent 2 & Agent 3):**
   - Implement anonymous public routes `/portal/volunteer/confirm/[token]` and `/portal/volunteer/schedule/[token]`. Exclude PII and addresses from returns to prevent data leakage.
3. **Template Integration (Agent 2 & Agent 4):**
   - Hook token generation into the volunteer reminder engine (`sendVolunteerReminderAction`), appending the unique URL parameter to email/text payloads.

---

## 2. ADR Drafts

The council recommends adopting the following ADR:
- [ADR 0016: Volunteer Sessional Follow-up and Confirmation Architecture](file:///Users/rjulia/ChurchCore/docs/adr/0016-volunteer-sessional-followup-and-confirmation-architecture.md)

---

## 3. Implementation Prompts for next Factory Run

### Prompt A — Database Migration & RLS Policies

**ADR Reference:** ADR 0016  
**Files:** New SQL migration (e.g. `supabase/migrations/20260715000000_volunteer_sessional_tokens.sql`)  
**Scope:** Add token columns to `volunteer_shifts` and implement sessional token-access RLS policies.  

**Work:**
1. Create a migration file appending `confirmation_token` (text, unique) and `confirmation_token_expires_at` (timestamptz) columns to `public.volunteer_shifts`.
2. Add an index on `confirmation_token`.
3. Create RLS policies allowing anonymous SELECT and UPDATE operations on `volunteer_shifts` when matching `confirmation_token` and within expiration limits.

**Verification:**
- Run database migrations check scripts (`npm run check:schema`).

---

### Prompt B — Volunteer Token Generator & Public Server Actions

**ADR Reference:** ADR 0016  
**Files:** `app/app/volunteer-actions.ts`, `lib/volunteer-sessional.ts` (new server helper)  
**Scope:** Build token-generation helper functions and public server actions for confirmations.  

**Work:**
1. In `volunteer-actions.ts`, import `logAuditEvent`. Update `sendVolunteerReminderAction` to generate a secure random 32-character token if missing, saving it in the DB with a 14-day expiration.
2. Build a public server action `respondToPublicShiftAction(token, response, reason)`:
   - Validate token and expiration.
   - Update `confirmation_status = response` and `decline_reason = reason`.
   - Call `logAuditEvent` to audit the change.

**Verification:**
- Write unit tests verifying token validation, success status changes, and auditing calls.

---

### Prompt C — Public Portal Confirmation Pages & UI Layouts

**ADR Reference:** ADR 0016  
**Files:** `app/portal/volunteer/confirm/[token]/page.tsx`, `app/portal/volunteer/schedule/[token]/page.tsx`, `components/portal/volunteer-confirm-client.tsx` (new)  
**Scope:** Create user-facing confirm and schedule dashboards under the portal route tree.  

**Work:**
1. Create `app/portal/volunteer/confirm/[token]/page.tsx` pulling sessional details.
2. Build `components/portal/volunteer-confirm-client.tsx` rendering Event Title, Role Name, Date, Time, and buttons to Confirm/Decline with a decline reason modal.
3. Create `app/portal/volunteer/schedule/[token]/page.tsx` listing all pending and completed shifts assigned to the volunteer.

**Verification:**
- Confirm pages compile successfully with zero TypeScript or styling warnings.
- Run `npm run build` and `npm run test` to verify compliance.

---

## 4. Execution Order

1. **Prompt A** (Database schema) - Must run first.
2. **Prompt B** (Server actions) - Dependent on Prompt A.
3. **Prompt C** (UI Pages) - Dependent on Prompt B.
