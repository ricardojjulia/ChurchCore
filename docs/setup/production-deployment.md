# Production Deployment Guide

First-time deployment of ChurchCore Ops to Vercel + Supabase (net-new tenant project).

---

## 1. Prerequisites

- Vercel account with a project linked to this repository.
- Two Supabase accounts or organizations — one for the control plane, one for the tenant app. They must be separate Supabase projects.
- Stripe account with webhook signing enabled.
- Resend (or SendGrid/Twilio) account for outbound communications.
- Node 20+ and `npm` available locally for running migrations.
- `supabase` CLI (`npm install -g supabase`) logged in with `supabase login`.
- Access to the repository's `.env.local` for reference. Never commit secrets.

---

## 2. Create the Tenant Supabase Project

1. Log in to app.supabase.com and create a new project. Name it something like `churchcore-tenant-prod`.
2. Choose a strong database password and note it.
3. After provisioning, go to **Project Settings → API**:
   - Copy **Project URL** — this is `TENANT_SUPABASE_URL`.
   - Copy **anon / public key** — this is `TENANT_SUPABASE_PUBLISHABLE_KEY`.
   - Copy **service_role secret** — this is `TENANT_SUPABASE_SERVICE_ROLE_KEY`.
4. Go to **Project Settings → Database** and copy the connection string (Transaction Pooler recommended for serverless). Do NOT set this as `TENANT_DB_URL` in production — see the critical note in section 4.

---

## 3. Create the Control Plane Supabase Project

1. Create a second new project. Name it something like `churchcore-control-plane-prod`.
2. After provisioning, go to **Project Settings → API**:
   - Copy **Project URL** — this is `CONTROL_PLANE_SUPABASE_URL`.
   - Copy **anon / public key** — this is `CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY`.
   - Copy **service_role secret** — this is `CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY`.
3. Go to **Project Settings → Database** and copy the connection string. This is `CONTROL_PLANE_DB_URL`.

---

## 4. Apply Migrations

### Tenant project

```bash
supabase db push --db-url "postgresql://postgres:<password>@<host>:5432/postgres"
```

Use the Direct Connection string from the tenant project settings for migrations (not the pooler). All migration files in `supabase/migrations/` apply to the tenant project.

### Control plane project

```bash
supabase db push --db-url "postgresql://postgres:<password>@<host>:5432/postgres" \
  --migrations-dir supabase/control-plane/migrations
```

---

## 5. Required Environment Variables

Set all of the following in Vercel under **Project → Settings → Environment Variables**. Apply them to the **Production** environment (and Preview if desired).

### Tenant Supabase

| Variable | Description |
|---|---|
| `TENANT_SUPABASE_URL` | Tenant project URL from step 2 |
| `TENANT_SUPABASE_PUBLISHABLE_KEY` | Tenant anon key from step 2 |
| `TENANT_SUPABASE_SERVICE_ROLE_KEY` | Tenant service role key from step 2 |

### Control Plane Supabase

| Variable | Description |
|---|---|
| `CONTROL_PLANE_SUPABASE_URL` | Control plane project URL from step 3 |
| `CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY` | Control plane anon key from step 3 |
| `CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY` | Control plane service role key from step 3 |
| `CONTROL_PLANE_DB_URL` | Control plane direct DB connection string from step 3 |

### Stripe

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...`) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret from Stripe (see step 6) |

### Communications

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Resend API key (primary email provider) |
| `RESEND_FROM_EMAIL` | Verified sender address for Resend (e.g. `noreply@yourdomain.com`) |
| `RESEND_WEBHOOK_SECRET` | Resend webhook signing secret (`whsec_...`) — see step 8 |
| `SENDGRID_API_KEY` | SendGrid API key (if using SendGrid instead of Resend) |
| `SENDGRID_FROM_EMAIL` | Verified sender address for SendGrid |
| `SENDGRID_WEBHOOK_VERIFICATION_KEY` | SendGrid webhook verification public key — see step 8 |
| `TWILIO_ACCOUNT_SID` | Twilio account SID (if using Twilio for SMS) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Provisioned Twilio phone number in E.164 format (e.g. `+12125551234`) |
| `UNSUBSCRIBE_SECRET` | HMAC secret for unsubscribe link signing — generate with `openssl rand -hex 32` |

### Security — Data Encryption

| Variable | Description |
|---|---|
| `PASTORAL_ENCRYPTION_KEY` | AES-256-GCM key for encrypting `pastoral_notes.content` and `care_assignments.summary` at rest. **Required in production.** Generate with `openssl rand -base64 32`. Must be exactly 32 bytes after base64 decode. |

> **PASTORAL_ENCRYPTION_KEY — Critical notes:**
> - Without this key set, the application throws on any pastoral note read or write in production.
> - Loss of this key means permanent loss of all encrypted pastoral notes. Back it up in a secrets manager.
> - After first setting this key in production, run the plaintext backfill script against any pre-existing pastoral data (see section 12).
> - Key rotation requires a full re-encryption backfill — do not rotate casually.

### Web-Push Notifications (optional)

Generate a VAPID key pair with `npx web-push generate-vapid-keys` and set:

| Variable | Description |
|---|---|
| `VAPID_PUBLIC_KEY` | VAPID public key (URL-safe base64) — used by the server for signing |
| `VAPID_PRIVATE_KEY` | VAPID private key (URL-safe base64) — keep secret |
| `VAPID_SUBJECT` | Contact URI for the push provider: `mailto:admin@example.com` or your HTTPS origin |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Same value as `VAPID_PUBLIC_KEY` — must be set for the browser to subscribe |

If these are not set, push notification dispatch is skipped gracefully and all other features continue to work.

### Application

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_APP_URL` | The production URL (e.g. `https://app.churchcore.io`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Same as `TENANT_SUPABASE_URL` — required for browser-side Supabase client |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same as `TENANT_SUPABASE_PUBLISHABLE_KEY` — required for browser-side auth |
| `CRON_SECRET` | Secret token for authenticating cron route invocations — generate with `openssl rand -hex 32`. Include in `Authorization: Bearer <CRON_SECRET>` header when manually triggering cron routes. |

### CRITICAL: Do NOT set these in production

| Variable | Reason |
|---|---|
| `TENANT_DB_URL` | Setting this activates `shouldUseLocalTenantDbFallback()` — the local PostgreSQL code path. Do NOT set it in production. The Supabase client path is used when this variable is absent. |
| `CONTROL_PLANE_DB_URL` | Same as above for the control plane. Setting this bypasses the Supabase control plane client. Do NOT set in production. |

---

## 6. Vercel Deployment Steps

1. Go to your Vercel project dashboard.
2. Confirm the repository is connected and the root directory is set correctly.
3. Under **Settings → General**, set **Framework Preset** to `Next.js`.
4. Under **Settings → Environment Variables**, add all variables from section 5.
5. Trigger a deployment by pushing to `main` or clicking **Redeploy** from the last successful build.
6. After deployment completes, note the production URL (e.g. `https://app.churchcore.io`).
7. Set `NEXT_PUBLIC_APP_URL` to that URL and redeploy if it was not set before the first deploy.

---

## 7. Stripe Webhook Registration

1. Go to [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks).
2. Click **Add endpoint**.
3. Set the endpoint URL:
   ```
   https://<your-production-domain>/api/webhooks/stripe
   ```
4. Select these events to listen for:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `customer.subscription.deleted`
5. Click **Add endpoint** to save.
6. On the webhook detail page, click **Reveal** next to the signing secret.
7. Copy the `whsec_...` value and set it as `STRIPE_WEBHOOK_SECRET` in Vercel environment variables.
8. Redeploy so the new variable takes effect.
9. Use the Stripe Dashboard **Send test webhook** button to verify each event type returns `200`.

---

## 8. Communications Webhooks

### Resend

1. In the Resend dashboard, go to **Webhooks**.
2. Add a new webhook endpoint:
   ```
   https://<your-production-domain>/api/webhooks/resend
   ```
3. Enable events: `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.opened`.
4. Copy the signing secret and set `RESEND_WEBHOOK_SECRET` in Vercel.

### SendGrid (if using)

1. In SendGrid, go to **Settings → Mail Settings → Event Webhook**.
2. Set the HTTP Post URL:
   ```
   https://<your-production-domain>/api/webhooks/sendgrid
   ```
3. Enable: Delivered, Bounced, Spam Report, Unsubscribe, Failed.
4. Enable **Event Webhook Signature Verification** and copy the verification key to `SENDGRID_WEBHOOK_VERIFICATION_KEY`.

### Twilio (if using)

1. In the Twilio Console, navigate to your phone number's messaging configuration.
2. Set the **A MESSAGE COMES IN** webhook URL:
   ```
   https://<your-production-domain>/api/webhooks/twilio
   ```
3. Set method to `HTTP POST`.
4. Twilio uses HMAC-SHA1 with `TWILIO_AUTH_TOKEN` for signature verification — no additional configuration needed beyond having `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` set.

---

## 9. Vercel Cron Routes

The following cron jobs are registered in `vercel.json` and run automatically on Vercel Pro or Enterprise plans:

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/shepherd-ai` | `0 */6 * * *` | Shepherd AI periodic tasks (every 6 hours) |
| `/api/cron/communications-retry` | `*/15 * * * *` | Retry failed communication sends (every 15 minutes) |

No additional configuration is needed. Verify cron jobs are enabled under **Vercel Project → Settings → Cron Jobs** after deployment.

---

## 10. Post-Deploy Smoke Check

Run these checks after the first production deployment.

### Auth

1. Visit `https://<domain>/sign-in`.
2. Sign in with a test church admin account.
3. Confirm redirect to `/app/church-admin` and that the church name appears in the header.

### Stripe webhook

1. Send a test `payment_intent.succeeded` event from the Stripe Dashboard.
2. Verify the Stripe Dashboard shows the delivery attempt returned `200`.

### Communications

1. Use the communications hub to send a test email to a test address.
2. Verify the email is delivered and the `communication_logs` row shows `status = 'sent'`.

### Cron routes

1. Manually trigger `/api/cron/communications-retry` by sending a `GET` request with the Vercel cron authentication header (`Authorization: Bearer <CRON_SECRET>`).
2. Verify the response is `200`.

### RLS smoke check

1. Using the Supabase Table Editor with a non-admin role, attempt to query `profiles` for a different `church_id`.
2. Confirm zero rows are returned.

---

## 11. Rollback Procedure

### Application rollback

1. In the Vercel dashboard, go to **Deployments**.
2. Find the last known-good deployment.
3. Click the three-dot menu and select **Promote to Production**.
4. Vercel routes traffic to the previous build within seconds — no downtime.

### Database rollback

Schema migrations are append-only. If a migration introduced a breaking change:

1. Write a corrective migration (a new `supabase/migrations/<timestamp>_fix_<name>.sql`) that reverses the problematic schema change.
2. Apply it via `supabase db push` against the production connection string.
3. Do not delete or edit existing migration files.
4. Open a PR documenting the corrective migration, the root cause, and the impact window.

### Environment variable rollback

If a bad env var was deployed:

1. In Vercel, edit the variable back to the last known-good value.
2. Redeploy by clicking **Redeploy** on the last-good deployment (not the current one).

---

## 12. Pastoral Encryption Backfill (First-Time Setup)

If you are deploying into an environment that already has `pastoral_notes` or `care_assignments` rows written before the Phase 2 security hardening (PR #111, 2026-06-07), those rows are stored as plaintext. After provisioning `PASTORAL_ENCRYPTION_KEY`, run the following backfill to encrypt them:

```bash
TENANT_SUPABASE_URL=https://<ref>.supabase.co \
TENANT_SUPABASE_SERVICE_ROLE_KEY=<service_role_jwt> \
PASTORAL_ENCRYPTION_KEY=<your_base64_32_byte_key> \
node scripts/backfill-pastoral-encryption.mjs
```

> **This script does not yet exist.** It must be written before deploying to a production environment with existing pastoral data. For a brand-new deployment with no prior data, this step can be skipped — all new writes will be encrypted automatically.

Until the backfill runs, `decryptPastoralField()` returns the plaintext value as-is for legacy rows and emits a `console.warn`. This is safe but means those rows are not encrypted at rest. The warning disappears once all rows are backfilled.

---

## Local Development — Required `.env.local` Configuration

The following `.env.local` settings are required for the local dev environment to function correctly under the Supabase-only architecture (v3.2.0+):

```
# Tenant Supabase (local, started with `supabase start`)
TENANT_SUPABASE_URL=http://127.0.0.1:4201
TENANT_SUPABASE_PUBLISHABLE_KEY=<local anon key from `supabase status`>
TENANT_SUPABASE_SERVICE_ROLE_KEY=<local service_role key from `supabase status`>
TENANT_DB_URL=postgresql://postgres:postgres@127.0.0.1:4202/postgres

# Browser-side Supabase client (same project as TENANT_SUPABASE_*)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4201
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<same anon key as TENANT_SUPABASE_PUBLISHABLE_KEY>

# Control plane — MUST use a local URL pattern in local dev (even if control plane isn't running)
# This makes shouldUseLocalControlPlaneFallback() return true, enabling auth session building
# from the local tenant DB for demo users. In production Vercel, use the real production URL.
CONTROL_PLANE_SUPABASE_URL=http://127.0.0.1:4211

# Pastoral encryption — omit in local dev to use plaintext fallback (prints a console warning)
# Set to a real base64 32-byte key to test encrypted round-trips locally:
#   PASTORAL_ENCRYPTION_KEY=$(openssl rand -base64 32)
# PASTORAL_ENCRYPTION_KEY=

# Cron secret — required to manually invoke /api/cron/* routes
# Generate with: openssl rand -hex 32
# CRON_SECRET=

# Unsubscribe HMAC secret — required for comms unsubscribe links
# Generate with: openssl rand -hex 32
# UNSUBSCRIBE_SECRET=
```

**Important:** If `CONTROL_PLANE_SUPABASE_URL` is set to the production URL (`https://<ref>.supabase.co`) in `.env.local`, auth session building will try to load demo user memberships from the production control plane, where they don't exist. This causes all sign-in sessions to resolve as preview (no data). Always use a local URL pattern (`http://127.0.0.1:4211`) for `CONTROL_PLANE_SUPABASE_URL` in local development.

The local control plane Supabase at port 4211 does not need to be running — the URL just needs to be a local pattern so `shouldUseLocalControlPlaneFallback()` evaluates to `true` and the auth system uses the local tenant DB for demo user session building.
