# ADR 0011: Immutability Controls, Consent Compliance, and Read-Audit Logging

* **Status:** Accepted
* **Date:** 2026-06-19
* **Authors:** Antigravity (Gemini Software Factory)
* **Decisions:** [2026-06-19-council-review-2-synthesis.md](file:///Users/rjulia/ChurchCore/docs/reviews/2026-06-19-council-review-2-synthesis.md)

---

## Context and Problem Statement

To reach production readiness and comply with GDPR, HIPAA-adjacent pastoral standards, and legal requirements, ChurchCore must address three security and privacy vulnerabilities identified in Sprint 1:
1. **Consent Record Mutability**: RLS policies block `UPDATE` statements for normal users, but database-level mutability controls are required to prevent administrators or platform operators from updating consent logs.
2. **Third-Party PII Consent**: Profiles collect emergency contact details (name and phone). GDPR/privacy regulations require members to verify they have consent from emergency contacts before storing their details.
3. **Pastoral Read-Auditing**: While pastoral notes are encrypted via AES-256-GCM, compliance audits require a historical log of *who* read sensitive counseling or care assignment contents.

---

## Decision Drivers

* **Regulatory Compliance**: Align with GDPR Article 17 (Right-to-Erasure) and append-only audit requirements.
* **Integrity**: Consent records must be append-only and immutable legal proofs.
* **Trust & Confidentiality**: Pastoral counseling history requires tracking of access events to prevent insider snooping.

---

## Proposed Decisions

### 1. Database-Level Trigger for Consent Immutability
Define a database trigger function `public.prevent_mutability()` that raises a fatal exception on any `UPDATE` or `DELETE` attempt. Attach it to `public.consent_logs` before any update or delete statement.

### 2. Third-Party Consent Attestation
Modify profile creation and editing forms to include a mandatory checkbox certifying that the member has permission from the emergency contact to store their details. Validate this gate at the Server Action layer.

### 3. Read-Auditing for Pastoral Records
Add a logging hook inside the Server Action files that retrieve pastoral notes (`lib/pastor-portal-data.ts` and `lib/church-admin-operations-data.ts`). Every read transaction inserts an access entry into `public.audit_log` with the target profile ID, actor profile ID, and operation type (`'READ_PASTORAL'`).

---

## Consequences

* **Positive**:
  - Legally defensible consent records.
  - Full audit trail of both read and write access on sensitive pastoral care files.
  - Reduced compliance risk for third-party PII.
* **Negative**:
  - Increased writes to the `audit_log` table for every read request to pastoral records, requiring a long-term archiving strategy.
