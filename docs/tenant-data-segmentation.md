# Tenant Data Segmentation

**Last updated:** 2026-06-07
**Scope:** Shared-database multi-tenancy — how church data is isolated when all tenants share a single Supabase project.

---

## Summary

Every church ("tenant") in ChurchCore shares the same PostgreSQL database. Data is isolated by a `church_id` column on every data table, enforced by PostgreSQL Row Level Security (RLS) at the database engine layer. A valid user JWT from Church A cannot read or write Church B's rows — the database refuses the query before the application layer is involved.

---

## How It Works

### 1. Every data table carries `church_id`

All tables that hold operational church data (`profiles`, `events`, `donations`, `ministries`, `groups`, `finance_*`, `attendance`, etc.) have a `church_id` UUID column that references `public.churches`. This is the tenant discriminator.

### 2. RLS is enabled on all data tables

As of the current migration set, **107 tables** have `ALTER TABLE … ENABLE ROW LEVEL SECURITY` and **244 policies** are defined. The RLS audit script (`scripts/audit-rls.mjs`) verifies no `church_id`-bearing table is left unprotected.

### 3. Three shared enforcement functions

All policies compose from three helper functions defined once in `20260409180000_initial_platform_foundation.sql`:

```sql
-- True if the calling user is a registered platform admin
public.is_platform_admin() → boolean

-- True if the calling user has an active membership in this church
public.belongs_to_church(target_church uuid) → boolean

-- True if the calling user holds an admin/pastor/leader role in this church
public.can_manage_church(target_church uuid) → boolean
```

Both `belongs_to_church` and `can_manage_church` query `public.church_memberships` for `auth.uid()` — the authenticated user's UUID from the Supabase JWT. There is no application-level way to override this value.

**`can_manage_church` role set:**
```sql
membership.role in ('church_admin', 'pastor', 'ministry_leader')
```

### 4. Typical policy patterns

```sql
-- Members can read their own church's profiles
CREATE POLICY "profiles_select_member"
  ON public.profiles FOR SELECT TO authenticated
  USING (belongs_to_church(church_id));

-- Only admin/pastor/leader can write donation records
CREATE POLICY "donations_manage"
  ON public.donations FOR ALL TO authenticated
  USING  (can_manage_church(church_id))
  WITH CHECK (can_manage_church(church_id));

-- A member can only read/update their own profile row
CREATE POLICY "profiles_select_self"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());
```

Every query from a tenant user resolves `auth.uid()` from their JWT and filters to their church's rows only. There is no API endpoint or query path that returns rows across churches for a normal user.

---

## Cross-Tenant Access

The only intentional cross-tenant access is **platform admins** — users registered in `public.platform_admins`. `is_platform_admin()` short-circuits `belongs_to_church` and `can_manage_church`, granting read access across all tenants. This is how the `/control` dashboard works.

Platform admin status is controlled exclusively by rows in `platform_admins`, which itself has an RLS policy:

```sql
CREATE POLICY "platform_admins_manage"
  ON public.platform_admins FOR ALL TO authenticated
  USING  (is_platform_admin())
  WITH CHECK (is_platform_admin());
```

Only an existing platform admin can add another. The initial row must be bootstrapped via the service role key.

---

## Service Role Key Caveat

The Supabase service role key bypasses RLS entirely. It is used in:

- Server-side admin operations (`createTenantAdminClient()`, `createControlPlaneAdminClient()`)
- Demo seed scripts
- Migration runners

These code paths always receive `church_id` explicitly from the authenticated session (`session.appContext.church.id`) and never derive it from user input. The service role key is a server-only secret (`SUPABASE_SERVICE_ROLE_KEY` / `CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY`) — it is never shipped to the browser bundle and is not accessible via any API route.

This is the standard shared-schema multi-tenancy tradeoff: **user-facing requests are database-enforced; server-admin operations are application-enforced**. An application-layer bug in a server action that mis-sets `church_id` could write to the wrong tenant. The `createTenantDataClient(session)` helper was introduced specifically to route impersonation sessions through the admin client while routing member sessions through the user client (RLS active), reducing this surface area.

---

## Capacity and Scaling Note

Because all tenants share one database, the resource limits are shared too. See the [Cloud Architecture](cloud-architecture.md) doc for the per-tenant DB (silo) vs. shared DB (pool) tradeoff analysis. The current shared model is appropriate for demo and early-stage production; the per-tenant silo path is already wired in the codebase via `tenant_connections` and requires no application code changes to activate.

---

## Related Docs

- [Cloud Architecture](cloud-architecture.md) — silo vs. pool decision and production topology
- [Security Assessment](security-assessment.md) — broader threat model and known gaps
- [Security Role-Access Matrix](security-role-access-matrix.md) — per-route role enforcement evidence
- [Control Plane](control-plane.md) — how tenant routing and platform admin access work
