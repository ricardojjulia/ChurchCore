# TODO

## Sprint 1 Next Steps

The v1.5 development plan now makes Sprint 1 the active priority. The immediate execution order is:

- Implement ADR 0002 and stop deepening the shared control-plane-plus-tenant backend model
- Define the control-plane schema separately from the tenant schema
- Continue hardening the separate backend configuration for control-plane and tenant connections
- Continue tenant-side Sprint 1 work for `profiles`, `ministries`, `profile_ministries`, and categorized `events`
- Add ministry assignment flows on top of live tenant-side `ministries` and `profile_ministries`
- Add RLS verification for cross-church read and write isolation inside the tenant data plane

## Supabase Hookup

ADR 0001 is approved for Supabase as a backend option, and ADR 0002 now requires control-plane and tenant data separation.

The remaining execution steps for a real backend connection are:

- Create or select the control-plane backend and database
- Create or select the tenant backend and database model
- Copy `.env.example` to `.env.local`
- Keep the current single-backend env vars only as a transitional local-development path until the split config lands
- Set `NEXT_PUBLIC_APP_URL` as needed for auth confirmation redirects
- Define tenant registry and routing metadata in the control-plane backend
- Move church operational schema work into the tenant backend path
- Keep direct Postgres fallback checks aligned with split control-plane and tenant backend configuration so local SQL paths exercise the same surface boundaries as Supabase REST paths
- Continue replacing remaining shared-backend assumptions in control-plane data loaders and tenant data loaders now that auth, proxy, and shared helper boundaries are explicit
- Continue tightening tenant-side query parity where local SQL and Supabase relation reads still differ, especially nested counts and multi-table church-scoped joins
- Add broader automated action coverage for tenant write-side ownership checks now that calendar, church-admin event, and ministry mutations enforce explicit church-boundary validation
- Verify tenant-view audit rows are written through an explicit cross-boundary support flow instead of a casual shared-table model
