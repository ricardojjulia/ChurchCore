# Hosted ShepherdAI Rollout Runbook

This runbook documents the hosted rollout path used to activate the ShepherdAI scheduled evaluation flow in production.

## Scope

- App deployment target: Vercel project `church-core/church-core-ops`
- Supabase project ref: `xsmcurhmgmnxxppkorpq`
- Cron route: `/api/cron/shepherd-ai`

## Completed Steps

1. Linked repo to Vercel and deployed production alias.
2. Added production environment variables in Vercel:
   - `CRON_SECRET`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Linked local Supabase CLI context to hosted project:
   - `supabase link --project-ref xsmcurhmgmnxxppkorpq`
4. Pushed all repository migrations to hosted Supabase:
   - `supabase db push`
5. Added matching Preview variables for parity:
   - `CRON_SECRET`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
6. Seeded deterministic visitor rows for both tenant churches to validate first-time-visitor suggestion generation.
7. Patched scheduled ShepherdAI execution to use tenant admin client in no-session cron context.
8. Redeployed production alias so runtime picked up cron/auth and scheduler changes.

## Verification Results

- Authenticated cron call returns `200`:
  - `GET /api/cron/shepherd-ai` with `Authorization: Bearer <CRON_SECRET>`
- Unauthenticated cron call returns `401`.
- Production deployment status is `Ready`.
- Tenant discovery now returns 2 hosted churches.
- Targeted tenant cron executions returned non-zero suggestions:
  - `tenantId=980f4d98-1520-464d-ab4d-07118a2f67cc` -> `generatedSuggestions: 1`
  - `tenantId=3b749abd-c102-479f-9090-415057a03262` -> `generatedSuggestions: 1`
- Hosted `ai_suggestions` persistence confirmed for both tenant IDs.

## Hosted Account Provisioning

The following accounts were provisioned and linked to tenant data:

- `sarah@churchforge.app`
  - Church: `churchforge`
  - App role: `church_admin`
  - Platform role: `platform_admins` entry created
- `david@graceharbor.church`
  - Church: `graceharbor`
  - App role: `church_admin`

Church records created/confirmed:

- `churchforge` (`ChurchForge Demo Church`)
- `graceharbor` (`Grace Harbor Church`)

## Security Notes

- Passwords are not stored in repository documentation.
- Rotate any shared or temporary credentials after handoff.
- Keep `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` restricted to server environments only.

## Operational Notes

- A `200` response with `tenantCount: 0` indicates scheduler wiring is healthy but no tenant rows are available for evaluation.
- A `200` response with `evaluatedEntities: 0` in hosted cron context can indicate session-bound tenant reads under RLS; scheduled jobs must use the tenant admin client.
- To force a single tenant run, call:
  - `GET /api/cron/shepherd-ai?tenantId=<church_id>` with valid cron auth header.
