# Production Readiness Roadmap

**Last updated:** 2026-06-07
**Status:** Pre-production — demo environment active, real congregation data not yet loaded.

The path to production is three sequential phases. Do not skip ahead: security hardening on a pausing free-tier database is painful, and monitoring a system with open security findings is premature.

---

## Phase 1 — Upgrade Accounts ($45/month)

**Do this first.** Removes the infrastructure ceiling before any other work begins.

| Service | Plan | Monthly | Key unlocks |
|---------|------|---------|-------------|
| Supabase | Pro | $25 | 8 GB storage, no MAU cap, no project pausing, 250 GB bandwidth, daily backups + 7-day PITR |
| Vercel | Pro | $20 | Commercial use permitted, 1,000 GB bandwidth, 15-second function timeout, no cron limit |
| **Total** | | **$45** | |

**Steps:**
1. Upgrade Supabase tenant project (`xsmcurhmgmnxxppkorpq`) to Pro
2. Upgrade Supabase control-plane project (`iopydttovnyjgikprvol`) to Pro
3. Upgrade Vercel project to Pro
4. Verify cron jobs re-enable after Vercel upgrade (shepherd-ai + communications-retry)

**Capacity at this tier:** Comfortably supports hundreds of demo tenants and dozens of real production tenants on the shared-DB model. See [Tenant Data Segmentation](tenant-data-segmentation.md) for the architecture and [Cloud Architecture](cloud-architecture.md) for the per-tenant silo migration path when needed.

---

## Phase 2 — Security Hardening

**Complete before any real congregation data is loaded.** Full findings are in [Security Assessment](security-assessment.md). Priority order:

### Critical — fix immediately

#### C-3 · Member RLS exposes full profiles to all members

Any authenticated church member can run `select * from profiles` via the Supabase JS client and read every other member's DOB, address, phone, emergency contacts, and admin notes.

**Fix:** Rewrite `profiles_select_member_scope` to scope down to directory-safe columns only (name, email opt-in, phone opt-in) and honor the `directory_visible` flag. Sensitive columns (DOB, address, emergency contacts, notes) restricted to admin/pastor/secretary roles only.

#### C-2 · `profiles.notes` visible to all members

Admin staff notes on members are included in the full-profile SELECT above.

**Fix:** Resolved by the C-3 column-scope fix above — `notes` must not appear in the member-facing policy.

#### H-4 · `consent_logs` allows UPDATE

Consent records can be backdated or falsified. No legal standing.

**Fix:** Drop `consent_logs_update_management_scope` policy. Make the table append-only. Admins who need to record a consent change insert a new row; they never modify existing ones.

### High — fix before first paying church

#### H-1 · Pastoral notes unencrypted at rest

`pastoral_notes.content` and `care_assignments.summary` hold health diagnoses, addiction history, abuse disclosures, and mental health crises in plaintext UTF-8.

**Fix:** Application-level encryption (AES-256-GCM) on write, decrypt on read. Key stored in environment variable, not in the database. Consider Supabase Vault for key management at Pro tier.

#### H-5 · No audit trail

Cannot answer "who read or changed this record?" for a breach, DSAR, or compliance audit.

**Fix:** Append-only `audit_events` table with triggers on sensitive tables (profiles, pastoral_notes, care_assignments, donations). Log actor, action, table, row ID, timestamp.

#### M-2 · No right-to-erasure

GDPR Art. 17 / CCPA erasure requests cannot be honored without manual DB work.

**Fix:** `erase_profile(profile_id)` server action that nulls PII columns, deletes pastoral notes, anonymizes donation records, and logs the erasure in audit_events.

### Integrations — needed for live operations

| Integration | Status | What's needed |
|-------------|--------|---------------|
| Stripe | Stubbed (falls back when `STRIPE_SECRET_KEY` absent) | Real Stripe account, connected accounts per church, webhook endpoint verification |
| SendGrid | Stubbed (logs to console when key absent) | Real API key, sender domain verification, unsubscribe + bounce handling |
| Twilio SMS | Stubbed | Real account SID + auth token, phone number provisioning |

---

## Phase 3 — Monitoring

**Set up after security is clean.** No point instrumenting a system with open findings.

### Recommended stack (lowest effort, best fit for Next.js on Vercel)

| Tool | Purpose | Setup effort |
|------|---------|--------------|
| **Sentry** | Error tracking + performance traces + server action monitoring | ~1 hour — first-class Next.js SDK, works natively on Vercel |
| **Vercel Analytics** | Core Web Vitals, page performance, real user data | ~5 min — built into Vercel Pro, zero code changes |
| **Vercel Speed Insights** | Function duration, cold start visibility | ~5 min — same |
| **Vercel Log Drain** | Ship logs to a log management service (Axiom, Datadog, etc.) | ~30 min |

### Dynatrace (if enterprise requirement)

Dynatrace **can** instrument this application but cannot use its primary OneAgent product — Vercel serverless functions are ephemeral and OneAgent requires a persistent host process.

**What works:**
- **RUM** (Real User Monitoring) — JS snippet in `app/layout.tsx`, 30 min setup
- **Server traces** — `instrumentation.ts` + OpenTelemetry SDK → Dynatrace OTLP endpoint, 1–2 days
- **Log ingestion** — Vercel log drain → Dynatrace log API, 1 hour
- **Synthetic monitoring** — HTTP/browser checks against the Vercel URL, config only

**What doesn't work:**
- OneAgent auto-instrumentation (no persistent process on serverless)
- Automatic dependency/topology discovery
- Code-level bytecode hotspot analysis
- Deep PurePath tracing on individual requests

Supabase calls appear as opaque HTTP calls to `*.supabase.co` — latency and status visible, but no query text or explain plans.

**Verdict:** Use Dynatrace via OTel if your organization already has an enterprise license and wants unified observability across a broader estate. If choosing fresh for this app, Sentry + Vercel's native tooling covers the same ground in an hour with less setup.

---

## Summary Checklist

```
Phase 1 — Accounts
  [x] Supabase Pro — tenant project
  [x] Supabase Pro — control-plane project
  [x] Vercel Pro
  [x] Verify cron jobs active

Phase 2 — Security  (PR #111 merged 2026-06-07)
  [x] C-3: Column-scope member RLS (+ C-2 resolved) — member_directory view
  [x] H-4: Make consent_logs append-only — idempotent migration re-asserts
  [x] H-5: Add audit_log church_id + actor_role + church-admin SELECT + logAuditEvent()
  [x] H-1: Encrypt pastoral notes at rest — lib/crypto/pastoral.ts (AES-256-GCM)
  [x] M-2: Implement right-to-erasure action — lib/actions/erasure.ts
  [ ] Set PASTORAL_ENCRYPTION_KEY in Vercel production + preview (openssl rand -base64 32)
  [ ] Run pastoral plaintext backfill script (if pre-existing pastoral data exists)
  [ ] Wire Stripe (real account + webhooks)
  [ ] Wire SendGrid (domain verified + bounce handling)
  [ ] Wire Twilio SMS

Phase 3 — Monitoring
  [ ] Sentry Next.js SDK installed + source maps
  [ ] Vercel Analytics enabled
  [ ] Vercel Speed Insights enabled
  [ ] Log drain configured
  [ ] Uptime check on primary routes (/app, /control, /portal)
```

---

## Related Docs

- [Tenant Data Segmentation](tenant-data-segmentation.md) — how RLS enforces isolation today
- [Security Assessment](security-assessment.md) — full finding details and evidence
- [Cloud Architecture](cloud-architecture.md) — silo vs. shared DB and per-tenant migration path
- [Control Plane](control-plane.md) — tenant routing and platform admin access
