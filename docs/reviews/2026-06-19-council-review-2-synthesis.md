# Council Review Synthesis: Security, Database & API Hardening — Sprint 1

**Date:** 2026-06-19
**Review ID:** Council Review 2
**Status:** Complete

---

## 1. Cross-Agent Consensus

The 4 council agents identified the following key areas of security, database, and session governance that need hardening:
* **Consent Log Immutability Gaps**: While the RLS policy on update is disabled, the `consent_logs` table lacks a database-level `BEFORE UPDATE OR DELETE` trigger to prevent updates. This should be locked down at the database engine level.
* **Third-Party Consent Consent check**: Members can input emergency contact details directly. A checkbox is required to ensure they verify consent from the contact before storing their PII.
* **Read-Auditing for Pastoral Care**: Pastoral care notes are encrypted via AES-256-GCM on write and decrypted on read, but there is no log recording *who* accessed/read the notes. Access read-auditing is required for legal and administrative compliance.
* **Session Inactivity Timeouts**: The frontend lacks an inactivity logout hook. If a user remains idle, their browser session is kept open indefinitely until cookie expiration.

---

## 2. ADR Mapping

* **ADR 0011: Immutability Controls, Consent Compliance, and Read-Audit Logging** has been drafted and accepted. It documents database trigger rules, consent validation requirements, and read-auditing tracking hooks.
  - File: [0011-immutability-controls-and-read-audit-logging.md](file:///Users/rjulia/ChurchCore/docs/adr/0011-immutability-controls-and-read-audit-logging.md)

---

## 3. Implementation Prompts

### Prompt A — Database-Level Trigger for Consent Immutability

**ADR Reference:** ADR-0011
**Files:** `supabase/migrations/20260714000000_consent_immutability.sql`
**Scope:** Create a database-level trigger on the `consent_logs` table that blocks any `UPDATE` or `DELETE` statements at the database engine level, guaranteeing immutability.

**Work:**
1. Create a migration file `20260714000000_consent_immutability.sql`.
2. Define a trigger function `public.prevent_mutability()` that raises an exception: `'Modification or deletion of consent log entries is prohibited.'`.
3. Create triggers `before update or delete on public.consent_logs` executing this function.

**Verification:**
- `npm run setup:local`
- Verification SQL command asserting that an update statement on `consent_logs` fails.

---

### Prompt B — Emergency Contact Consent Verification and Pastoral Read-Auditing

**ADR Reference:** ADR-0011
**Files:** `app/app/actions.ts`, `lib/actions/audit.ts`, `components/application/profile-form.tsx` (or other profile form files)
**Scope:** Implement a mandatory consent validation checkbox on the profile/emergency contact forms, and add read-access logging to the audit trail whenever pastoral notes are retrieved.

**Work:**
1. Add validation in `validateInput` / `UpdateProfileInput` checking that the user confirms consent for third-party emergency contacts when adding or updating emergency numbers.
2. In the pastoral note loading action, insert a read audit entry into `public.audit_log` with the target profile ID, actor ID, and operation `'READ_PASTORAL'`.
3. Create unit tests covering the consent checks and read audit log writes.

**Verification:**
- `npm run test`
- `npm run build`

---

### Prompt C — Client-Side Session Inactivity Timeout

**ADR Reference:** ADR-0011
**Files:** `components/application/app-shell.tsx`, `components/application/session-timeout-wrapper.tsx`
**Scope:** Add a client-side idle listener that redirects the user to `/sign-in` after 15 minutes of user inactivity (mouse move, key presses, scroll).

**Work:**
1. Implement a React context hook or component wrapper `SessionTimeoutWrapper` that listens to DOM events (`mousemove`, `keydown`, `scroll`, `click`).
2. If no event is triggered for 15 minutes, delete local state and redirect the user to `/sign-in` with a toast notification: "Your session has expired due to inactivity."
3. Wrap the main authenticated routes layout within `SessionTimeoutWrapper`.

**Verification:**
- `npm run lint`
- `npm run build`

---

## 4. Execution Order

1. **Prompt A** (High priority; locks down database-level immutability for compliance).
2. **Prompt B** (Medium priority; contact consent validation & read-auditing).
3. **Prompt C** (Low priority; idle session logout UX).
