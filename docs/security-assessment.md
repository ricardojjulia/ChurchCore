# ChurchCore Ops — Security & Privacy Assessment

**Date:** 2026-04-13  
**Scope:** Full database schema (all 10 migrations as of this date)  
**Classification:** Internal — restricted to engineering leads and pastoral leadership

---

## Executive Summary

If the ChurchCore Ops Supabase database were read by an unauthorized party today — through a leaked service key, a misconfigured RLS policy, a SQL injection, or an insider — the exposure includes the real names, home addresses, phone numbers, dates of birth, emergency contacts, pastoral care notes, attendance records, and spiritual data of every person enrolled in every church on the platform.

No data is encrypted at rest beyond what Supabase provides at the storage layer. No column-level access restrictions exist. Several RLS policies are broader than they need to be. One table (`tenant_connections`) stores database connection strings — including credentials — in plaintext.

This is fixable. None of it requires a redesign. All of it should be fixed before real congregation data is loaded.

## Recent Evidence Refresh (2026-05-27)

- Branch-independent post-merge verification on `main` completed for the Phase 2 closure slice:
	- `npm run test -- app/app/ccm-actions.test.ts app/app/member-actions.test.ts app/portal/children/actions.test.ts lib/ccm-public-data.test.ts`
	- `npx playwright test tests/e2e/member-mobile-foundation.spec.ts`
	- `npm run lint`
	- `npm run build`
- Additional compliance test coverage now includes pending-review member data-rights behavior in `lib/compliance/data-rights-actions.test.ts`.
- Member profile/family pending-review hardening now enforces staff gatekeeping via `member_change_requests` and ChurchAdmin queue review actions, reducing direct self-service overwrite risk on canonical profile/family records.
- Focused verification for pending-review workflows now includes `app/app/actions.test.ts`, `lib/church-admin-people-data.test.ts`, and `lib/member-portal-data.test.ts`.
- Communications provider Phase 3 foundation started with adapter/retry/idempotency contract tests in `lib/communications/provider-adapter.test.ts`.

## Recent Evidence Refresh (2026-05-29)

- Security-evidence closure verification for competitive-readiness slices now includes focused role-access and church-scope negative coverage:
	- `npm run test -- app/app/church-admin/people/import/actions.test.ts app/app/church-admin-actions.test.ts app/app/communications-actions.test.ts`
- Added role-access matrix coverage for ChurchAdmin-only import dry-run execution in `app/app/church-admin/people/import/actions.test.ts`.
- Added cross-tenant negative coverage for event registration and approval boundaries in `app/app/church-admin-actions.test.ts`.
- Added cross-tenant negative coverage for communications retry/suppression workflows in `app/app/communications-actions.test.ts`.

## Recent Evidence Refresh (2026-05-29, Finding 4/5/6 depth batch)

- Added paid-registration lifecycle default persistence coverage so ChurchAdmin/member/public registrations now write deterministic `payment_status` values (`pending` for paid non-waitlisted registrations, `not_required` otherwise):
	- `app/app/church-admin-actions.ts`
	- `app/app/member-actions.ts`
	- `app/portal/actions.ts`
- Expanded regression evidence for paid-registration lifecycle defaults in:
	- `app/app/church-admin-actions.test.ts`
	- `app/app/member-actions.test.ts`
- Added migration-tooling security boundary evidence for import commit role/backend gates in:
	- `app/app/church-admin/people/import/actions.test.ts`
- Added explicit role-access matrix reference document for sensitive route/action verification:
	- `docs/security-role-access-matrix.md`

---

## Findings by Severity

### CRITICAL

---

#### C-1 · `tenant_connections.db_url` — Connection strings in plaintext

**Table:** `public.tenant_connections`  
**Column:** `db_url text`

Raw database connection strings (including host, port, username, and password) for every tenant database are stored in plaintext in the control-plane Supabase database. A single read of this table by an unauthorized actor gives them direct database access to every church tenant. This is the highest-impact single query possible.

**Affected:** Every church tenant.  
**Attack vector:** Leaked service key, SQL injection on control plane, misconfigured RLS, insider.

---

#### C-2 · `profiles.notes` — Admin notes visible to all church members

**Table:** `public.profiles`  
**Column:** `notes text`

The `profiles_select_member_scope` policy allows any authenticated church member to read all profiles in their church, including all columns. The `notes` column holds freeform administrative text entered by church staff. Any member who queries `profiles` directly — including via the Supabase JS client — can read staff notes on every person in the congregation.

**Affected:** All member-facing notes entered by church admins.  
**Attack vector:** Authenticated member issuing `select notes from profiles` via Supabase client.

---

#### C-3 · Member RLS policy exposes full profiles to all members

**Policy:** `profiles_select_member_scope`  
**Scope:** `belongs_to_church(church_id)` — no column restriction, no `directory_visible` filter

Any authenticated member can read every column of every profile in the church — not just directory-visible ones. This includes:

| Column | Risk |
|---|---|
| `date_of_birth` | + name + address + phone = identity theft package |
| `emergency_contact_name` | Third-party PII without consent |
| `emergency_contact_phone` | Same |
| `last_attendance` | Behavioral tracking |
| `preferred_contact_method` | Personal preference |
| `membership_status` | May be sensitive (inactive, transferred) |
| `notes` | See C-2 |

The `directory_visible = false` flag only controls whether the member appears in the UI. It does not restrict which columns the policy returns.

**Affected:** All profiles in a church, regardless of privacy flags.  
**Attack vector:** Authenticated member issuing any `select * from profiles` query.

---

### HIGH

---

#### H-1 · `pastoral_notes.content` and `care_assignments.summary` — Unencrypted pastoral data

Pastoral notes and care assignment summaries routinely contain: health diagnoses, addiction history, mental health crises, marital breakdown, abuse disclosures, suicide ideation, and criminal history. These fields are stored as UTF-8 plaintext in the database with no application-level encryption.

A single leaked database credential exposes the full pastoral case history of every person in every church.

**Affected:** All pastoral notes and care assignment summaries.  
**Attack vector:** Any read access to the database — service key, direct DB connection, RLS bypass.

---

#### H-2 · `date_of_birth` + name + address + phone — Identity theft combination

The combination of full name, date of birth, home address, and phone number is sufficient to pass knowledge-based authentication at most financial institutions, open credit lines, and file fraudulent tax returns. All four fields are stored in plaintext on the `profiles` table with no column-level restriction. The current member RLS policy exposes all four to any authenticated member (see C-3).

**Affected:** Any profile with date_of_birth populated.

---

#### H-3 · Emergency contacts — Unconsented third-party PII

`emergency_contact_name` and `emergency_contact_phone` belong to individuals who have no account with ChurchCore Ops, have not accepted any privacy policy, and do not know their data is stored. Under GDPR Article 13/14 and California CPRA, you have disclosure obligations to these third parties.

**Affected:** All profiles with emergency contact data.

---

#### H-4 · `consent_logs` allows UPDATE — Consent records are mutable

The `consent_logs_update_management_scope` policy allows church admins to update existing consent entries. Consent records must be append-only to serve as legal records of what a person agreed to and when. The ability to update them means consent history can be backdated or falsified, eliminating their legal standing.

**Affected:** All consent records across all churches.

---

#### H-5 · No audit trail for sensitive data access or modification

There is no record of who read or wrote which profile, pastoral note, or care assignment. In the event of a breach, a data subject access request (DSAR), or a compliance audit, the question "who accessed this record on this date?" cannot be answered.

**Affected:** All sensitive tables.

---

### MEDIUM

---

#### M-1 · `spiritual_gifts` and `interests` — Special-category data stored without encryption

Religious beliefs data is a GDPR Article 9 special category requiring explicit consent and heightened protection. `spiritual_gifts` (jsonb) and `interests` (text[]) are unencrypted plaintext columns on `profiles`. They appear in the full member RLS SELECT.

---

#### M-2 · No right-to-erasure procedure

GDPR Article 17 requires that individuals can request deletion of their personal data. There is no function in the schema that erases PII while preserving referential integrity. The `merge_duplicate_profile` function soft-marks merged profiles but leaves all PII in place. A genuine erasure request cannot be honored without manual database work.

---

#### M-3 · No data retention limits

Attendance records, pastoral notes, and care assignments accumulate indefinitely with no configurable retention window. Long-lived pastoral data increases the blast radius of any future breach.

---

#### M-4 · `families.address` and `families.home_phone` — Household PII

Household addresses and phone numbers are accessible to all authenticated members via `families_select_member_scope`. A member who knows a family's ID can retrieve their home address — a stalking and targeting risk.

---

### LOW / INFORMATIONAL

---

#### L-1 · `volunteer_profiles.availability` and `training` stored as open jsonb

No schema validation on structure. Could contain PII depending on what is entered.

#### L-2 · `profiles.avatar_url` — External URL with no validation

External image URLs are stored without validation. Could point to tracking pixels or content that leaks client IP addresses when rendered.

#### L-3 · `event_rsvps.note` — Freeform text on RSVPs

Members can write freeform notes on RSVPs. No length limit beyond application-layer validation. Potentially sensitive (health-related RSVP reasons).

---

## Data Map: PII and PHI by Table

| Table | PII Fields | PHI-adjacent | Admin-only | Notes |
|---|---|---|---|---|
| `profiles` | name, email, phone, address, DOB | notes | pastoral notes moved here | Too much on one table |
| `profile_sensitive_fields` (planned) | DOB, emergency name/phone | — | admin + self | Must be created |
| `families` | address, home_phone | — | — | Member-accessible via RLS |
| `pastoral_notes` | — | content (full PHI risk) | pastor-only | No encryption |
| `care_assignments` | — | summary (PHI risk) | pastor-only | No encryption |
| `attendance` | checked_in_at, status | behavioral | admin/self | Indefinite retention |
| `consent_logs` | — | legal record | admin/self | Must be immutable |
| `tenant_connections` | db_url (credentials) | — | platform admin | Critical: plaintext creds |

---

## What Is Working

The core RLS architecture is correctly designed:

- `belongs_to_church()` / `can_manage_church()` as composable helper functions is the right pattern
- Pastoral data is gated behind `can_access_pastoral_data()` — pastor-only rows
- The tenant/church separation in the control plane is sound
- `consent_logs` exists — most apps don't have this at all
- The member self-update action has an explicit allowlist — no role escalation possible
- The `merge_duplicate_profile` function checks actor authorization before merging

The problems are column-level exposure within correct rows, one overtly dangerous plaintext column, and missing safeguards (audit log, erasure, consent immutability).

---

*See `security-mitigation-plan.md` for the ordered remediation plan and migration reference.*
