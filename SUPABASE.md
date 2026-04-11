# Supabase Local Development

This document records the current local Supabase development environment for ChurchForge.

These values are for local development only. They are not production-safe.

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

## Database

| Field | Value |
| --- | --- |
| URL | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

## Authentication Keys

| Key | Value |
| --- | --- |
| Publishable | `sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH` |
| Secret | `sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz` |

## Storage (S3)

| Field | Value |
| --- | --- |
| URL | `http://127.0.0.1:54321/storage/v1/s3` |
| Access Key | `625729a08b95bf1b7ff351a663f3a23c` |
| Secret Key | `850181e4652dd023b7a98c58ae0d2d34bd487ee0cc3254aed6eda37307425907` |
| Region | `local` |

## ChurchForge Environment Mapping

The local app should be configured with:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Local Dev Security Notice

- All services bind to `0.0.0.0`, so they are network-accessible and not limited to localhost.
- API keys and JWT secrets are shared local defaults and must never be used in production.
- Studio, pgMeta (`/pg/*`), and analytics have no authentication in this local setup.
