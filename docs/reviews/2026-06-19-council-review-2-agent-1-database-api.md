# Council Agent 1: Database & API Security Audit — ChurchCore LMS

**Date:** 2026-06-19
**Auditor:** Agent 1 — Database & API State
**Status:** Complete

---

## 1. Schema & RLS Policy Security

The repository contains **78 database migrations** located under `supabase/migrations/`. 

* **Thoroughness of RLS**: 100% of the 103 tables containing a `church_id` column have Row Level Security (RLS) enabled and pass the automated `npm run audit:rls` integrity checks.
* **Access Control Functions**: RLS policies utilize composable SQL helper functions (`public.belongs_to_church()`, `public.can_manage_church()`, and `public.current_user_role()`) configured as `SECURITY DEFINER` with a fixed `search_path` (public). This prevents search-path hijacking attacks.
* **Volunteer/Teacher RLS Hardening**: The recent Sprint 1 fix resolved a critical role escape in `public.current_user_role()` by verifying volunteer assignments using the resolved `profiles.id` (associated with the user's auth ID) rather than directly querying `auth.uid()`, preventing standard volunteers from escalating access.

---

## 2. API Routes & Webhook Hardening

API endpoints located under `app/api/` were audited for potential exploit surfaces:

* `POST /api/ai`: Successfully validates the Supabase auth session. It implements a regex-based PII scrubber that strips email addresses and UUIDs/IDs from prompts before querying Anthropic Claude, preventing PII leaks to downstream LLMs.
* `GET /api/unsubscribe` & `POST /api/push/subscribe`: Hardened with an in-memory sliding-window rate limiter (`lib/rate-limit.ts`) restricting clients to 15 requests per minute, returning a `429 Too Many Requests` status.
* **Webhook Authentication**:
  - `POST /api/webhooks/stripe`: Performs cryptographic signature verification using the Stripe webhook secret, preventing event spoofing.
  - `POST /api/webhooks/resend` & `POST /api/webhooks/twilio`: Implements cryptographic signature checks matching Resend/Twilio signing keys.
  - `POST /api/webhooks/sendgrid`: Verifies signatures using SendGrid public keys.

---

## 3. User & Session Security Gaps

* **Plaintext Connection Strings in Control Plane**: While `tenant_connections` has `vault_secret_name` added via `20260413260000_security_credential_hardening.sql`, the application configuration resolver (`lib/supabase/config.ts`) still relies on plaintext `db_url` environment variables (`TENANT_DB_URL` / `CONTROL_PLANE_DB_URL`). Decoupling connection strings to use Supabase Vault secrets directly in the database runtime layer remains incomplete.
* **Client Impersonation Boundaries**: The server action client routing in `createTenantDataClient(session)` switches client contexts based on the `session.appContext.source` attribute (switching to `createTenantAdminClient()` if `source === "impersonation"`). This relies on application-level state validation. A breach of session cookies could allow out-of-scope database operations bypassing standard client RLS.

---

## 4. Top 3 Database & API Gaps for MVP

1. **Vault Connection Routing**: Integrate the database `vault_secret_name` in configuration client resolvers to completely remove plaintext database URL dependencies.
2. **Database-Level Immutability**: Add database `BEFORE UPDATE` trigger checks on `consent_logs` to reject updates at the database schema layer, reinforcing RLS policy restrictions.
3. **Session Token Expiry Enforcement**: Hardcode a session max-age boundary in the Supabase server client cookie configuration to reject stale client tokens.
