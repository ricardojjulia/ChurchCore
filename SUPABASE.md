# Supabase Local Development

This document records the local Supabase workflow for ChurchForge without committing live local tokens into the repository.

These instructions are for local development only. They are not production-safe.

Architectural note:

- Under ADR 0002, this single local Supabase setup is transitional only.
- The target architecture is a separate control-plane database and a separate tenant data plane.
- Do not treat this file as the long-term production topology.

## Development Tools

| Tool | URL |
| --- | --- |
| Studio | `http://127.0.0.1:54323` |
| Mailpit | `http://127.0.0.1:54324` |
| MCP | `http://127.0.0.1:54321/mcp` |

## APIs

| Service | URL |
| --- | --- |
| Project URL | `http://127.0.0.1:54321` |
| REST | `http://127.0.0.1:54321/rest/v1` |
| GraphQL | `http://127.0.0.1:54321/graphql/v1` |
| Edge Functions | `http://127.0.0.1:54321/functions/v1` |

## Getting Local Values

Use these commands on your own machine instead of copying token values from the repository:

```bash
npx supabase status
npx supabase status --output env
```

The second command prints the JWT-format keys that ChurchForge expects in `.env.local`.

## ChurchForge Environment Mapping

The local app should be configured with values derived from `npx supabase status --output env`:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...   # ANON_KEY from supabase status --output env
SUPABASE_SERVICE_ROLE_KEY=eyJ...              # SERVICE_ROLE_KEY from supabase status --output env
SUPABASE_DB_URL=postgresql://postgres:<local-db-password>@127.0.0.1:54322/postgres
```

> **Important:** ChurchForge uses `@supabase/ssr`, which requires the JWT `eyJ...` anon key from `npx supabase status --output env`, not the `sb_publishable_*` format shown by the default status output.

## Local Dev Security Notice

- All services bind to `0.0.0.0`, so they are network-accessible and not limited to localhost.
- Local API keys, storage credentials, and JWT secrets are shared dev defaults. Do not reuse them outside local Supabase.
- Studio, pgMeta (`/pg/*`), and analytics have no authentication in this local setup.
