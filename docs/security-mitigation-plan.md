# ChurchCore — Security Mitigation Plan

**Date:** 2026-04-13  
**Companion:** `docs/security-assessment.md`  
**Status:** Executing — see migration files and app code changes

---

## Execution Order

Migrations and code changes must be deployed together in a single release. Some migrations drop columns that app code still reads; the app code changes restore those reads from new locations. Deploy them atomically.

## Verification Evidence Refresh (2026-05-27)

- Post-merge verification commands for the mobile/children safety closure slice passed on `main`:
   - `npm run test -- app/app/ccm-actions.test.ts app/app/member-actions.test.ts app/portal/children/actions.test.ts lib/ccm-public-data.test.ts`
   - `npx playwright test tests/e2e/member-mobile-foundation.spec.ts`
   - `npm run lint`
   - `npm run build`
- Added targeted compliance coverage for member pending-review deletion behavior and cancellation in `lib/compliance/data-rights-actions.test.ts`.
- Added targeted pending-review workflow verification for profile/family change requests and ChurchAdmin review approvals/rejections in `app/app/actions.test.ts`, `lib/church-admin-people-data.test.ts`, and `lib/member-portal-data.test.ts`.
- Added Phase 3 communications adapter foundation test coverage in `lib/communications/provider-adapter.test.ts`.

## Verification Evidence Refresh (2026-05-29)

- Security evidence closure sprint verification passed for role-access and church-scope negative cases:
   - `npm run test -- app/app/church-admin/people/import/actions.test.ts app/app/church-admin-actions.test.ts app/app/communications-actions.test.ts`
- Added ChurchAdmin-only import dry-run role-gate tests in `app/app/church-admin/people/import/actions.test.ts`.
- Expanded event registration boundary tests in `app/app/church-admin-actions.test.ts` for church mismatch and non-scoped approval/settings updates.
- Expanded communications boundary tests in `app/app/communications-actions.test.ts` for out-of-scope retry attempts and suppression-consent scoping.

## Verification Evidence Refresh (2026-05-29, Finding 4/5/6 depth batch)

- Added paid-registration lifecycle default verification for ChurchAdmin/member/public registration write paths:
   - `app/app/church-admin-actions.ts`
   - `app/app/member-actions.ts`
   - `app/portal/actions.ts`
- Added focused paid-registration regression tests:
   - `app/app/church-admin-actions.test.ts`
   - `app/app/member-actions.test.ts`
- Added import commit role-gate and backend-gate verification in:
   - `app/app/church-admin/people/import/actions.test.ts`
- Added source-adapter mapping coverage for vendor import aliases in:
   - `lib/people-import-source-adapters.test.ts`
- Added security role-access matrix evidence index:
   - `docs/security-role-access-matrix.md`

## Verification Evidence Refresh (2026-05-29, WS-4)

- Security evidence maintenance is now consolidated in the weekly readiness docs and the role-access matrix.
- Documentation surfaces refreshed in this pass:
   - [docs/security-assessment.md](docs/security-assessment.md)
   - [docs/security-role-access-matrix.md](docs/security-role-access-matrix.md)
   - [docs/testing-schema.md](docs/testing-schema.md)
   - [docs/plans/2026-06-05-execution-brief.md](docs/plans/2026-06-05-execution-brief.md)
   - [docs/plans/mvp-competitive-go-no-go-checklist.md](docs/plans/mvp-competitive-go-no-go-checklist.md)
- Verification evidence referenced by this refresh:
   - `npm run setup:local`
   - `npm run smoke:local`
   - `npm run test:e2e:readiness`
   - `npm run test:e2e:onboarding`
   - `npm run test -- app/app/church-admin/people/import/actions.test.ts app/app/church-admin-actions.test.ts app/app/communications-actions.test.ts app/app/member-actions.test.ts`
   - `npm run lint`
   - `npm run build`

---

## Phase 1 — Critical (Block on real data)

### P1-A · Move `profiles.notes` to `pastoral_notes` (fixes C-2)

**Migration:** `20260413200000_security_notes_migration.sql`

1. Copy all non-null `profiles.notes` rows into `pastoral_notes` (attributed to a system actor, flagged as migrated).
2. Drop `profiles.notes`.

No app code references `profiles.notes` in any read path. The column was never exposed to the member portal UI. Drop is safe.

**Residual risk after fix:** None for this field. Notes are now behind `can_access_pastoral_data()`.

---

### P1-B · Create `member_directory` view and tighten member profile RLS (fixes C-3)

**Migration:** `20260413210000_security_member_directory_view.sql`

1. Drop the current `profiles_select_member_scope` policy that exposes all columns to all members.
2. Create a tighter replacement:
   - Own profile (`user_id = auth.uid()`): always readable.
   - Admin/pastor (`can_manage_church(church_id)`): sees all rows.
   - All others: only rows where `directory_visible = true AND merged_at IS NULL`.
3. Create `public.member_directory` view that projects only safe columns and applies `contact_allowed` masking inline. This view is the canonical interface for member-facing directory queries.

**Safe columns in `member_directory`:**
`id`, `church_id`, `full_name`, `display_title`, `membership_status`, `family_id`, `contact_allowed`, and conditional `email`/`phone`.

**Excluded from view:** `date_of_birth`, `emergency_contact_name`, `emergency_contact_phone`, `notes`, `last_attendance`, `preferred_contact_method`, `spiritual_gifts`, `interests`, `avatar_url`, `is_pastoral`, `user_id`.

---

### P1-C · Move `date_of_birth`, `emergency_contact_name`, `emergency_contact_phone` to `profile_sensitive_fields` (fixes H-2, H-3, and reduces C-3 blast radius)

**Migration:** `20260413220000_security_sensitive_fields_table.sql`  
**App code changes:** `lib/member-portal-data.ts`, `lib/church-admin-people-data.ts`, `app/app/actions.ts`

1. Create `public.profile_sensitive_fields` table with its own strict RLS:
   - Self (own profile): SELECT, INSERT, UPDATE.
   - Church admin / pastor (`can_manage_church`): full access.
   - All others: no access.
2. Migrate existing data from `profiles` into the new table.
3. Drop `date_of_birth`, `emergency_contact_name`, `emergency_contact_phone` from `profiles`.
4. Update all read paths to JOIN `profile_sensitive_fields`.
5. Update all write paths to UPSERT into `profile_sensitive_fields`.

**Why a separate table instead of column-level revoke:**  
PostgreSQL column-level `REVOKE` applies to a role, not an RLS policy. Since all Supabase authenticated users share the `authenticated` role, column-level revoke would block admins and pastors too. A separate table with its own RLS is the correct solution.

---

### P1-D · Harden `tenant_connections` — no plaintext credentials (fixes C-1)

**Migration:** `20260413260000_security_credential_hardening.sql`

1. Add `vault_secret_name text` column to `tenant_connections`.
2. When populated, this name points to a Supabase Vault secret that holds the actual `db_url`. The `db_url` column is kept for backward compatibility but is deprecated — no new rows should populate it.
3. Add a `CHECK` constraint that at least one of `vault_secret_name` or `db_url` must be non-null (prevents silent misconfiguration).

**Required follow-up (manual):**  
For each existing `tenant_connections` row:
```sql
select vault.create_secret(db_url, 'tenant_db_' || tenant_id::text)
```
Then write the returned secret name to `vault_secret_name`, and null out `db_url`. This requires Supabase Vault to be enabled on the control-plane project (`pgsodium` extension).

Until Vault is provisioned, `db_url` continues to be used. The migration documents the intent and creates the structure to migrate into.

---

## Phase 2 — High (Before first real church onboards)

### P2-A · Make `consent_logs` insert-only (fixes H-4)

**Migration:** `20260413230000_security_consent_immutable.sql`

Drop `consent_logs_update_management_scope`. Consent is recorded by INSERT only. A change in consent is a new row, not a mutation of an existing one. Add a `CHECK` constraint: `consented_at <= now() + interval '5 minutes'` to prevent backdating.

---

### P2-B · Add audit log (fixes H-5)

**Migration:** `20260413240000_security_audit_log.sql`

1. Create `public.audit_log` table: `(id, table_name, record_id, operation, actor_id, changed_at, old_values jsonb, new_values jsonb)`.
2. Create `audit_log_changes()` trigger function (SECURITY DEFINER, captures `auth.uid()`).
3. Attach triggers (AFTER INSERT OR UPDATE OR DELETE) on:
   - `profiles`
   - `profile_sensitive_fields`
   - `pastoral_notes`
   - `care_assignments`
   - `consent_logs`
4. Platform-admin only RLS on `audit_log` — no one else can read or write it directly.

**Note:** This records writes, not reads. Read audit requires `pgaudit` extension and is a future enhancement.

---

### P2-C · Add GDPR right-to-erasure procedure (fixes M-2)

**Migration:** `20260413250000_security_erasure_procedure.sql`

Create `public.erase_profile_pii(target_profile_id uuid, actor_profile_id uuid)` SECURITY DEFINER function:

1. Verifies actor is a church admin or platform admin.
2. Nulls out all PII on `profiles`: `email`, `full_name → '[Erased]'`, `phone`, `address`, `avatar_url`, `preferred_contact_method`.
3. Deletes the `profile_sensitive_fields` row entirely.
4. Deletes all `attendance` records.
5. Deletes all `pastoral_notes` where `profile_id = target`.
6. Deletes all `care_assignments` where `profile_id = target`.
7. Deletes all `consent_logs` where `profile_id = target`.
8. Sets `directory_visible = false`, `contact_allowed = false`, `merged_at = now()` to soft-remove from all views.
9. Writes an `audit_log` entry with `operation = 'ERASE'`.

The profile row itself is preserved (tombstone) to maintain foreign key integrity across other tables (`event_rsvps`, `volunteer_shifts`, `ministry assignments`).

---

## Phase 3 — Medium (Before public launch)

### P3-A · Encrypt `pastoral_notes.content` and `care_assignments.summary`

**Approach:** `pgp_sym_encrypt` / `pgp_sym_decrypt` from `pgcrypto` (already enabled).

**Key management:** Store the encryption key in Supabase Vault. The application fetches it at startup from a Vault secret. The DB stores only ciphertext. A read of the DB without the Vault key yields unreadable data.

**Impact:** Requires app-level changes to encrypt on write, decrypt on read. This is a breaking change to the data layer and should be done as a dedicated sprint.

**Migration:** New migration (not in this batch) — depends on Vault being operational for P1-D.

---

### P3-B · Consent UI enforcement

Add consent collection UI (for `directory_visible`, `contact_allowed`, and communication preferences) tied to `consent_logs` INSERT on change. Currently these flags are settable without a corresponding consent record.

---

### P3-C · Data retention policy

Add a configurable `retention_months` column to `churches`. A scheduled job (pg_cron or an external worker) should purge `attendance` records older than the configured window and archive `pastoral_notes` / `care_assignments` that have been closed for more than the configured period.

---

## Ongoing Posture

| Control | Status after this release |
|---|---|
| Connection strings in plaintext | Deprecated — Vault migration path documented |
| Member reads admin notes | Fixed — notes column removed from profiles |
| Member reads all profile columns | Fixed — RLS tightened + directory view |
| DOB + emergency contacts exposed to all members | Fixed — separate table, strict RLS |
| Consent records mutable | Fixed — update policy dropped |
| Audit trail for sensitive writes | Fixed — audit_log table + triggers |
| GDPR erasure | Fixed — erasure function implemented |
| Pastoral content encryption | Planned — Phase 3 |
| Special-category data protection (spiritual_gifts) | Planned — Phase 3 |
| Read audit trail (pgaudit) | Future |
| Emergency contact consent disclosure | Future — requires UX + legal review |

---

## Migration Reference

| File | Fixes | Status |
|---|---|---|
| `20260413200000_security_notes_migration.sql` | C-2 | Executed |
| `20260413210000_security_member_directory_view.sql` | C-3, M-4 | Executed |
| `20260413220000_security_sensitive_fields_table.sql` | H-2, H-3, C-3 | Executed |
| `20260413230000_security_consent_immutable.sql` | H-4 | Executed |
| `20260413240000_security_audit_log.sql` | H-5 | Executed |
| `20260413250000_security_erasure_procedure.sql` | M-2 | Executed |
| `20260413260000_security_credential_hardening.sql` | C-1 | Executed |
