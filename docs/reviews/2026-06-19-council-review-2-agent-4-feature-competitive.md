# Council Agent 4: Security & Competitive Compliance — ChurchCore LMS

**Date:** 2026-06-19
**Auditor:** Agent 4 — Security & Competitive Compliance
**Status:** Complete

---

## 1. Compliance Feature Implementation

ChurchCore has integrated several regulatory compliance tools that are essential for modern SaaS systems:

* **GDPR Right-to-Erasure (M-2)**: Implemented in SQL via the `public.erase_profile_pii()` function. This procedure safely strips all personal identifiable information (PII) from user profile records while preserving the underlying row structure to maintain foreign key referential integrity with historic events, attendances, and logs.
* **Audit Logging (H-5)**: Handled by database triggers firing `public.audit_log_changes()`. Updates and deletions on sensitive tables (`profiles`, `profile_sensitive_fields`, `pastoral_notes`, etc.) write diff states into `public.audit_log` with actor identifiers.
* **Consent Immutability (H-4)**: The `consent_logs` table has its update policy disabled, making it append-only.

---

## 2. Competitive Security Analysis

A comparison of ChurchCore's security architecture against industry-leading platforms highlights significant advantages:

| Security Vector | Planning Center Online (PCO) | Breeze ChMS | ChurchCore LMS |
|-----------------|-----------------------------|-------------|----------------|
| **Multi-Tenancy** | Shared database, application-level isolation | Shared database, application-level isolation | Per-tenant database connection capability + PostgreSQL Row Level Security (RLS) |
| **Pastoral Notes Encryption** | Cloud storage encryption at rest only; plaintext in DB | Plaintext in database | **AES-256-GCM application-level encryption** in the data access layer |
| **Consent Logging** | No system-level ledger | No system-level ledger | **Immutable database-level append-only ledger** |
| **Data Erasure (GDPR)** | Manual DB purges required | Manual DB purges required | **Automated database procedure** preserving referential integrity |

---

## 3. Compliance and Security Gaps

* **Emergency Contact Consent (H-3)**: The application collects third-party emergency contact PII (`emergency_contact_name`, `emergency_contact_phone`) and maps it into `profile_sensitive_fields`. There is no workflow or legal gate asking the member if they have obtained consent from the third party to store their contact details.
* **Lack of Read-Audit Logging**: The audit log trigger only captures state modifications (write, update, delete). There is no audit record of who *read* a pastoral note or sensitive profile record.

---

## 4. Top 3 Security Compliance Gaps for MVP

1. **Third-Party Consent checkbox**: Add a required confirmation checkbox to emergency contact forms: "I verify that I have permission from this emergency contact to store their phone and name."
2. **Access/Read Auditing**: Implement read tracking for pastoral notes at the Server Action level, appending access records to the audit log.
3. **Key Rotation Plan**: Draft and document a rotation standard for the `PASTORAL_ENCRYPTION_KEY`.
