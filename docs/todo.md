# TODO

## Sprint 1 Next Steps

The v1.4 development plan now makes Sprint 1 the active priority. The immediate execution order is:

- Align the live Supabase schema to the v1.4 Sprint 1 model for `profiles`, `ministries`, `profile_ministries`, and categorized `events`
- Add a new migration instead of mutating the existing baseline migration in place
- Add ministry assignment flows on top of live `ministries` and `profile_ministries`
- Add event CRUD and RSVP mutation flows on top of the live categorized calendar read path
- Add RLS verification for cross-church read and write isolation

## Supabase Hookup

The backend decision in ADR 0001 is approved and the codebase now includes Supabase SSR auth foundations plus an initial SQL schema scaffold.

The remaining execution steps for a real backend connection are:

- Create or select the Supabase project for ChurchForge
- Copy `.env.example` to `.env.local`
- Set `NEXT_PUBLIC_SUPABASE_URL`
- Set `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Set `SUPABASE_DB_URL` for local direct-database fallback
- Set `NEXT_PUBLIC_APP_URL` as needed for auth confirmation redirects
- Apply `supabase/migrations/20260409180000_initial_platform_foundation.sql`
- Apply `supabase/migrations/20260410121500_tenant_view_audit.sql`
- Verify tenant-view audit rows are written for explicit enter and exit flows in `/control`
