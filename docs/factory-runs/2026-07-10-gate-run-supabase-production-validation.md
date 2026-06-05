# Factory Run: First Real Supabase Gate Run — Production Path Validation

Date: 2026-07-10
Type: Gate validation run (smoke, e2e readiness, e2e onboarding)
Release context: v3.2.0 — first release under Supabase-only architecture

---

## Intent

Run `npm run smoke:local`, `npm run test:e2e:readiness`, and `npm run test:e2e:onboarding` for the first time under the Supabase-only architecture (after `shouldUseLocalTenantFallback()` was locked to always return `false`). The gates had been passing for months, but they were exercising the local SQL bypass rather than the real Supabase production paths. This run validated the Supabase paths directly.

---

## What we expected to find

With the local SQL bypass removed, every data loader and server action that previously short-circuited through `queryTenantLocalDb` now runs through `createTenantServerClient()` with Supabase RLS enforced. Any Supabase path that was written but never tested would surface here.

The production audit assessment predicted there could be other divergences like the GL column mismatch we already found. This run confirmed that prediction.

---

## Bugs found and fixed

### Bug 1 — PGRST201 FK ambiguity in accounts data loader

**File:** `lib/church-admin-accounts-data.ts`  
**Symptom:** Smoke test failed at `/app/church-admin/accounts` — submitted portal request not visible.  
**Root cause:** `account_requests` has two FK columns to `profiles` (`profile_id` and `reviewed_by`). PostgREST requires FK disambiguation when multiple relationships exist. The unqualified `profiles(full_name, member_number, account_status)` join returned `PGRST201`; `data` was null; `pendingRequests` silently returned empty.  
**Impact:** Every church admin opening the portal accounts queue in production Supabase mode saw zero pending requests. The gate was previously passing only because the local SQL path bypassed PostgREST entirely.  
**Fix:** `profiles!account_requests_profile_id_fkey(full_name, member_number, account_status)`  
**Note:** 17 other tables have multiple FK columns to `profiles`. Any future Supabase queries on those tables using unqualified `profiles(...)` joins need the same disambiguation.

### Bug 2 — Wrong RPC parameter name for portal registration

**File:** `app/portal/actions.ts`  
**Symptom:** Onboarding e2e test failed — "Request received" confirmation appeared (registration submitted), but the onboarding email did not appear in the admin accounts queue.  
**Root cause:** `supabase.rpc("submit_account_request", { request_church_id: churchId, ... })` — the function's actual parameter name is `target_church_id`. Supabase RPC named parameters don't fall back to positional matching. The function raised "A church is required" and the error was thrown, preventing the registration from being stored.  
**Impact:** Every portal registration via the public form in production Supabase mode failed silently (the form showed a success-ish response but the request was never stored).  
**Fix:** Changed the parameter key from `request_church_id` to `target_church_id`.

### Bug 3 — `generate_member_number()` search_path excluded pgcrypto

**File:** `supabase/migrations/20260710020000_fix_generate_member_number_search_path.sql`  
**Symptom:** Onboarding e2e test failed at account approval — server returned 500 with "function gen_random_bytes(integer) does not exist".  
**Root cause:** `generate_member_number()` had `SET search_path TO 'public'`, which excludes the `extensions` schema where pgcrypto's `gen_random_bytes` lives in Supabase. The local Postgres pool connection used the database-level search_path (which included `extensions`), so the function worked via `queryTenantLocalDb` but failed when called via `supabase.rpc()`.  
**Impact:** Account approval (the admin approving a portal request) always threw a 500 in production Supabase mode. The local SQL path computed the member number without going through the RPC, so the gate had been passing while hiding this failure.  
**Fix:** Migration adding `extensions` to the function's search_path and using `extensions.gen_random_bytes()` explicitly.

### Environment gap — local GoTrue doesn't support admin invite endpoint

**File:** `app/app/church-admin-actions.ts` (`inviteChurchMember`)  
**Symptom:** Onboarding e2e test failed at approval — "Request approved" or "Invite sent" notification never appeared; server logged 404 from `POST /auth/v1/admin/invite`.  
**Root cause:** Supabase CLI v2.89.1 bundles a GoTrue version that doesn't expose `POST /auth/v1/admin/invite`. The production Supabase cloud supports it; local development does not.  
**Impact:** Account approval worked in production but failed in local dev, preventing the e2e onboarding test from completing.  
**Fix:** `inviteChurchMember` now tries `inviteUserByEmail` first; if it fails, falls back to `createUser` with `email_confirm: false`. GoTrue sends a confirmation email via SMTP to Mailpit (same as a real invite from the test's perspective). Production behavior (invite email) is unchanged.

---

## Session diagnostic approach

1. Identified accounts page showed no pending requests even though DB had 9 rows.
2. Direct Supabase REST API call with the admin's JWT returned all 9 rows — RLS worked correctly.
3. Discovered the Next.js page's Supabase client was returning null `data` (not an error) — silently empty because PostgREST returned PGRST201 for the ambiguous FK join.
4. Found 18 tables with multiple FK columns to `profiles` — documented as follow-up cleanup.
5. Fixed accounts FK → smoke test passed `/app/church-admin/accounts` ✅
6. Portal registration RPC param fix → "Request received" appeared in onboarding test ✅
7. Admin approval threw 500 on `generate_member_number` → RPC search_path fix ✅
8. Admin invite returned 404 → `inviteChurchMember` fallback to `createUser` ✅

---

## Verification results

```
npm run smoke:local       ✅ 21/21 checks passed (all real Supabase paths)
npm run test:e2e:readiness ✅ 3 passed, 1 expected skip (control-plane context)
npm run test:e2e:onboarding ✅ 1 passed — full onboarding flow: register → approve → invite → sign in → profile hydrated
npm run test               ✅ 711 passed, 77 files
npm run lint               ✅ 0 errors
npm run build              ✅ 97 routes, 0 TypeScript errors
```

---

## Residual risk and follow-up

- 17 other tables have multiple FK columns to `profiles` (`care_assignments`, `communication_logs`, `council_notes`, `daily_work_items`, `elder_notes`, `finance_journals`, `kingdom_impacts`, `member_change_requests`, `mentor_couples`, `mentorship_pairs`, `pastoral_notes`, `profiles`, `support_pairings`, `volunteer_hours_log`, `volunteer_match_suggestions`, `workflows`, `young_adult_career_mentorships`). Any Supabase query joining `profiles(...)` from these tables without FK disambiguation will fail with PGRST201. Audit and fix in a follow-on PR before adding new Supabase select paths on these tables.
- The local GoTrue invite endpoint gap will be resolved when the Supabase CLI is upgraded to a version that ships a GoTrue supporting `POST /auth/v1/admin/invite`. At that point the fallback in `inviteChurchMember` will never activate in local dev either.
- The `CONTROL_PLANE_SUPABASE_URL` in `.env.local` was changed from the production URL to `http://127.0.0.1:4211` to trigger the local control plane fallback for auth session building. This change is gitignored (`.env.local`) and must be documented in `docs/setup/` as a required local dev configuration step.
