# ChurchForge — Cloud Architecture

**Date:** April 17, 2026
**Status:** Recommended design for production SaaS deployment
**Audience:** Engineering, DevOps, and technical stakeholders

---

## Overview

ChurchForge is a multi-tenant SaaS platform. Each church is a fully isolated tenant with its own database. The existing codebase is already designed for this model: `tenant_connections`, `createTenantServerClient()`, and `shouldUseLocalTenantFallback()` all assume per-tenant database connections.

This document describes the recommended cloud architecture for a production deployment where each church accesses only its own tenant.

---

## Architecture Diagram

```text
                        ┌──────────────────────┐
  Browser / PWA ───────▶│     Vercel (Edge)    │
                        │   Next.js App Router  │
                        └──────────┬───────────┘
                                   │
                        ┌──────────▼───────────┐
                        │   Platform DB         │
                        │   (Supabase — 1 proj) │
                        │ • tenants             │
                        │ • tenant_connections  │
                        │ • platform_admins     │
                        │ • billing / routing   │
                        └──────────┬───────────┘
                                   │ resolve tenant → db_url
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
             ┌────────────┐ ┌────────────┐ ┌────────────┐
             │ Church A   │ │ Church B   │ │ Church C   │
             │ Supabase   │ │ Supabase   │ │ Supabase   │
             │ (US-East)  │ │ (EU-West)  │ │ (US-East)  │
             └────────────┘ └────────────┘ └────────────┘
```

---

## Tenant Isolation Model: Silo (Per-Tenant Database)

Each church gets its own dedicated Supabase project. This is the correct model for ChurchForge given the sensitivity of the data it stores.

### Why silo over a shared pool

| Concern | Silo (per-tenant DB) | Pool (shared DB + RLS) |
| --- | --- | --- |
| Child PII / custody data isolation | Hard isolation | RLS bug = cross-tenant exposure |
| GDPR / data deletion | Delete one project | Complex scoped deletion |
| Data residency (EU churches) | Each DB in correct region | All data in one region |
| Tenant DB size scaling | Independent per church | All churches share one limit |
| Debugging a specific church | Clean, isolated access | Filtered queries only |
| Cost | ~$25/church/month | ~$25 flat total |

The CCM module stores custody restrictions, court orders, child medical notes, and authorized pickup records. An RLS misconfiguration in a shared pool exposing one church's custody data to another is an unacceptable liability event. Hard isolation removes this risk entirely.

---

## Hosting Responsibilities — What Lives Where

Vercel hosts **only application code**. It has no database. All data — both platform routing data and church operational data — lives in Supabase projects.

```text
Vercel ($20/month)
└── Next.js app (code only)
    ├── reads tenant routing from → Platform Supabase ($25/month flat)
    └── connects to church data in → Church Supabase ($25/month per church)
```

This means every church that goes live adds one $25/month Supabase project to your infrastructure bill — independent of Vercel. Your SaaS subscription price per church must cover this cost before any margin is realised.

---

## Component Breakdown

### App Layer — Vercel

- **What:** Next.js App Router deployed on Vercel Pro
- **Why:** Global CDN, edge middleware, server actions run close to users, zero-config deployment from the existing codebase
- **Cost:** $20/month flat — does not increase as you add churches
- **Hosts:** Application code only. No database, no church data.
- **Configuration:** Environment variables point to the platform Supabase URL only. Per-tenant Supabase URLs are resolved at runtime from `tenant_connections`.
- **Plan:** Pro required — Hobby plan prohibits commercial use. Pro also unlocks preview deployment password protection (important: CCM screens must not be publicly accessible on preview URLs), team seats, higher serverless limits, and a GDPR-compliant DPA.
- **No code changes required** — `createTenantServerClient()` already reads from `tenant_connections`

### Platform Database — One Supabase Project

- **What:** A single Supabase Pro project that stores only routing, billing, and admin data
- **Tables stored here:** `tenants`, `tenant_connections`, `platform_admins`, `church_memberships`
- **Tables NOT stored here:** All church operational data (profiles, CCM, finance, ministry) — this lives in each church's own project
- **Cost:** $25/month flat regardless of tenant count
- **Region:** US East (default) unless primary user base is elsewhere

### Per-Tenant Databases — One Supabase Project Per Church

- **What:** One Supabase project per church, provisioned at onboarding
- **Contains:** All church data — profiles, CCM sessions, financial records, ministry data, audit logs
- **Region:** Provisioned in the church's preferred region (critical for EU churches and GDPR data residency)
- **Lifecycle:** Free tier during trial/onboarding → Pro when the church goes live
- **Connection:** The `tenant_connections` row for each church holds its `supabase_url`, `anon_key`, and `service_role_key`
- **Important:** Each church Supabase project is a Supabase subscription — not part of Vercel. Vercel hosts only application code. Every church that goes live adds one independent $25/month Supabase project to your bill.

### Supporting Services

| Service | Purpose | Recommended Provider |
| --- | --- | --- |
| Transactional email | Auth magic links, notifications, late pickup alerts | Resend, AWS SES |
| Billing | Subscription and plan management | Stripe |
| Error monitoring | Production exception tracking | Sentry |
| Rate limiting / caching | API protection, session caching | Upstash Redis |
| File storage | Child photos, documents, authorized pickup photos | Each tenant's Supabase Storage (included) or S3 |

---

## Tenant Provisioning Flow

When a new church signs up, the following steps run automatically via a provisioning server action:

```text
1. Create Supabase project via Supabase Management API
   → returns project_url, anon_key, service_role_key

2. Run all migrations against the new project
   npx supabase db push --db-url <new_project_url>

3. Insert routing row into platform DB:
   INSERT INTO tenant_connections
     (tenant_id, backend_kind, connection_status, db_url, metadata)
   VALUES (...)

4. Run bootstrap seed for that church
   (children_rooms defaults, ministry setup, admin user)

5. Send invite email to church admin
   → sets password → logs in → sees their isolated tenant
```

Steps 1–4 can be fully automated using the Supabase Management API, which supports programmatic project creation, migration application, and secret management.

---

## Region Strategy

Supabase available regions: `us-east-1`, `us-west-1`, `eu-central-1` (Frankfurt), `eu-west-1`, `ap-southeast-1`, `ap-northeast-1`, and others.

| Church location | Recommended DB region | Reason |
| --- | --- | --- |
| United States | `us-east-1` or `us-west-1` | Latency |
| European Union | `eu-central-1` (Frankfurt) | GDPR data residency requirement |
| Australia / Asia Pacific | `ap-southeast-1` | Latency |

The platform database can remain in `us-east-1` — it contains no PII or church operational data.

---

## Recommended Development Setup

Before onboarding any real church, the recommended starting infrastructure is three paid subscriptions:

```text
Vercel Pro ($20/month)
└── Next.js app
    ├── Platform Supabase Pro ($25/month)
    │   └── tenants, tenant_connections, routing
    └── Church Dev Supabase Pro ($25/month)
        └── staging / integration environment
```

**Total: $70/month** for a production-grade development stack.

### Why provision a paid Church Dev project immediately

| Reason | Detail |
| --- | --- |
| Tests the real path | `createTenantServerClient()` → `tenant_connections` → church Supabase runs against actual cloud infrastructure. Issues that only surface on cloud (connection pooling, cold starts, migration edge cases) appear here — not on a real church's data. |
| Migration staging gate | Every schema change hits Church Dev before any real church project. It becomes your mandatory staging step. |
| Proves the provisioning flow | When you onboard your first paying church, you've already run the provisioning flow against Church Dev dozens of times. No surprises. |
| Always available | Pro means no pausing — Church Dev is available whenever you need it, including for demos and QA. |
| Real constraint testing | bcrypt at cost 12 under concurrent load, realtime subscriptions, file storage — all behave differently on cloud Pro vs. local Docker. |

### Two environments, two purposes

| Environment | How | Purpose |
| --- | --- | --- |
| Local (`npx supabase start`) | Docker, free | Fast daily feature development — instant resets, no network latency |
| Church Dev (cloud Pro) | Supabase Pro project | Integration testing, migration validation, staging, demos |

Keep both. Use local for speed during development. Use Church Dev to validate before anything touches a real church.

### Church Dev is a permanent fixture

When you onboard your first paying church, provision a fresh Supabase project for them. Church Dev is never used for real church data — it remains your permanent staging environment for the lifetime of the product.

---

## Platform and Church App Separation

ChurchForge operates as two distinct applications — the business management portal (used by ChurchForge staff) and the church-facing product (used by each church). These should be separated into two Vercel projects within one account.

### Two projects, not two accounts

Two Vercel accounts would double billing ($40/month) and split team management. Two projects within one Vercel Pro account is the correct approach — same team, one bill, full isolation between the apps.

```text
One Vercel Pro account ($20/month)
├── Project 1: platform.churchforge.com
│   └── Tenant management, billing, onboarding, super-admin
└── Project 2: *.churchforge.com (wildcard)
    └── graceharbor.churchforge.com
    └── firstbaptist.churchforge.com
    └── calvary.churchforge.com
```

### Full separated architecture

```text
                    ┌─────────────────────────────┐
                    │   platform.churchforge.com   │
                    │   Vercel Project 1           │
                    │   (your business portal)     │
                    │                              │
                    │ • Tenant onboarding          │
                    │ • Billing / Stripe           │
                    │ • Provision new churches     │
                    │ • Super-admin dashboard      │
                    └──────────────┬──────────────┘
                                   │
                        ┌──────────▼───────────┐
                        │   Platform Supabase   │
                        │ • tenants             │
                        │ • tenant_connections  │
                        │ • slugs / subdomains  │
                        │ • billing records     │
                        └───────────────────────┘

                    ┌─────────────────────────────┐
                    │   *.churchforge.com          │
                    │   Vercel Project 2           │
                    │   (the church app)           │
                    │                              │
                    │ graceharbor.churchforge.com  │
                    │ firstbaptist.churchforge.com │
                    │ calvary.churchforge.com       │
                    └──────────────┬──────────────┘
                                   │ subdomain → tenant lookup
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
             ┌────────────┐ ┌────────────┐ ┌────────────┐
             │ Church A   │ │ Church B   │ │ Church C   │
             │ Supabase   │ │ Supabase   │ │ Supabase   │
             └────────────┘ └────────────┘ └────────────┘
```

### Wildcard subdomain routing

Vercel Pro supports wildcard domains (`*.churchforge.com`). Next.js middleware reads the subdomain from the incoming hostname, looks up the tenant slug in the platform DB, and resolves the correct church Supabase connection:

```typescript
// middleware.ts — Project 2 (church app)
export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";
  const subdomain = hostname.split(".")[0]; // "graceharbor"

  // Look up tenant by slug → get their Supabase db_url
  // Attach to request headers for server components to consume
}
```

The `tenants.slug` column already exists in the schema. `graceharbor`, `firstbaptist`, etc. become subdomains automatically — no code change per church.

### DNS setup

```text
churchforge.com           → marketing site
platform.churchforge.com  → Vercel Project 1
*.churchforge.com         → Vercel Project 2 (wildcard CNAME)
```

One wildcard DNS record covers every church subdomain at onboarding — no manual DNS entry per church.

### Impact on existing codebase

| Area | Current | With subdomains |
| --- | --- | --- |
| Tenant resolution | From session/auth context | From subdomain in middleware |
| `tenants.slug` | Already exists | Becomes the subdomain |
| `createTenantServerClient()` | Already works per-tenant | No change needed |
| Platform admin routes | Mixed into church app | Moved to Project 1 |
| DNS | Single domain | Wildcard CNAME → Vercel |

### Recommended rollout sequence

| Phase | Action |
| --- | --- |
| Now | Continue building on the current single app with Church Dev on cloud Pro |
| Before first paying customer | Split into two Vercel projects, configure wildcard subdomain routing |
| At launch | Platform app handles onboarding and billing; church app is the product |

The codebase changes for the split are modest — middleware subdomain resolution and extracting super-admin/provisioning routes into their own project.

---

## Vercel Traffic Analysis — How Many Churches on $20/Month

Vercel Pro pricing does not scale per tenant or per church. It scales on bandwidth and serverless execution time. ChurchForge's usage pattern — a church management app with Sunday-heavy, low-frequency CRUD traffic — is extremely light on both.

### Vercel Pro included resources

| Resource | Included per month | Overage rate |
| --- | --- | --- |
| Bandwidth | 1 TB | $0.15/GB |
| Serverless execution | 1,000 GB-hours | $0.18/GB-hour |
| Build minutes | 6,000 minutes | $0.01/minute |
| Team members | Unlimited | — |
| Deployments | Unlimited | — |

### Bandwidth estimate per church

| Factor | Value |
| --- | --- |
| Active users per church per month | ~100 |
| Page loads per user per month | ~5 (Sunday-heavy) |
| Average page payload (Next.js server components) | ~200 KB |
| **Bandwidth per church per month** | **~100 MB** |

```text
1 TB included ÷ 100 MB per church = ~10,000 churches
before hitting the bandwidth ceiling
```

### Serverless execution estimate per church

| Factor | Value |
| --- | --- |
| Server action calls per church per month | ~500 |
| Average execution time | ~200 ms (300–400 ms for bcrypt check-in calls) |
| Memory allocation | 128 MB |
| Execution per request | ~25 MB-seconds |
| **Total per church per month** | **~12,500 MB-seconds = ~0.003 GB-hours** |

```text
1,000 GB-hours included ÷ 0.003 GB-hours per church = ~333,000 churches
before hitting the execution ceiling
```

### Practical answer

**Hundreds to low thousands of churches** can run on a single $20/month Vercel Pro plan before any overage appears. For ChurchForge's traffic pattern, bandwidth is the binding constraint — and even that supports ~10,000 churches on the included 1 TB.

### When to upgrade Vercel

You do not upgrade Vercel because of church count or raw traffic. The upgrade triggers are business and compliance driven:

| Trigger | Why |
| --- | --- |
| Uptime SLA requirement | Pro has no SLA — Enterprise does |
| SSO / SAML for your internal team | Enterprise feature |
| Advanced DDoS protection / IP allowlisting | Enterprise security controls |
| Dedicated support / TAM | Pro is ticket-based only |
| SOC 2 / HIPAA BAA compliance audit | Enterprise compliance features |

---

## Supabase Free Tier vs. Pro for Tenant Projects

| Limit | Free Tier | Pro Tier |
| --- | --- | --- |
| Database size | 500 MB | 8 GB |
| RAM | 500 MB shared | 1 GB dedicated |
| Project pausing | After 1 week inactivity | Never paused |
| Egress | 5 GB/month | 250 GB/month |
| File storage | 1 GB | 100 GB |
| Support | Community | Email |
| Cost | $0 | $25/month |

**Recommended lifecycle:**

- **During development / onboarding trial:** Free tier per tenant
- **At go-live:** Upgrade to Pro

The project pausing behavior on the free tier is the critical risk for production — a church arriving on Sunday morning to a paused database is operationally unacceptable for the CCM check-in kiosk. Free tier is appropriate only while no live service sessions are being run.

---

## Cost Model at Scale

| Stage | Vercel | Platform DB | Church Dev | Live Church DBs (Pro) | Est. total/month |
| --- | --- | --- | --- | --- | --- |
| **Dev (recommended start)** | $20 | $25 | $25 | — | **$70** |
| Trials only (free tier churches) | $20 | $25 | $25 | $0 | ~$70 |
| 5 live churches | $20 | $25 | $25 | $125 | ~$195 |
| 10 live churches | $20 | $25 | $25 | $250 | ~$320 |
| 25 live churches | $20 | $25 | $25 | $625 | ~$695 |
| 50 live churches | $20 | $25 | $25 | $1,250 | ~$1,320 |
| 100 live churches | $20 | $25 | $25 | $2,500 | ~$2,570 |

Church Dev ($25/month) is a fixed cost that never goes away — it is your permanent staging environment regardless of how many churches you onboard.

At 50 churches on a $50–100/month SaaS subscription, monthly revenue is $2,500–5,000 against ~$1,320 infrastructure — a healthy margin. The $25/church Supabase cost should be factored into your minimum subscription price per church.

---

## What Is Already Built

The good news: the codebase already supports this architecture. No structural changes are required.

| Component | Status |
| --- | --- |
| `tenant_connections` table with `db_url` | ✅ Done |
| `createTenantServerClient()` resolving per-tenant client | ✅ Done |
| `shouldUseLocalTenantFallback()` for local dev | ✅ Done |
| RLS policies on all tenant tables | ✅ Done |
| CCM module with hard tenant isolation | ✅ Done |
| Finance module with church-scoped RLS | ✅ Done |

### Still to Build

| Component | Notes |
| --- | --- |
| Provisioning automation | Server action that calls Supabase Management API to create a new project, run migrations, seed bootstrap data |
| Stripe billing integration | Subscription lifecycle, plan tiers, upgrade triggers |
| Admin onboarding flow | Church sign-up form → provisioning → invite email |
| Monitoring / alerting | Per-tenant health checks, error budgets |

---

## Self-Hosting Alternative

If data sovereignty is a requirement (all data on your own infrastructure), Supabase publishes an official Docker Compose stack that runs the full platform — PostgreSQL, PostgREST, GoTrue auth, Realtime, Storage, Studio, and Kong — on any VPS.

```sh
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
# configure secrets
docker compose up -d
```

Minimum server spec for the full stack: **2 vCPU / 4 GB RAM**.
A $12–20/month VPS (Hetzner, DigitalOcean) comfortably runs a single-church self-hosted instance.

See `docs/setup/` for local development setup instructions, which use the same Docker stack via `npx supabase start`.

---

*Last updated: April 17, 2026*
