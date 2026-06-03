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
| `RESEND_API_KEY` | Resend API key (or set `SENDGRID_API_KEY` / `TWILIO_*` for those providers) |
| `SENDGRID_API_KEY` | SendGrid API key (if using SendGrid) |
| `SENDGRID_WEBHOOK_VERIFICATION_KEY` | SendGrid webhook verification public key |
| `TWILIO_ACCOUNT_SID` | Twilio account SID (if using Twilio) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |

### Application

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_APP_URL` | The production URL (e.g. `https://app.churchcore.io`) |
| `NEXTAUTH_SECRET` | Random 32-byte secret for Next.js session signing |

### CRITICAL: Do NOT set these in production

| Variable | Reason |
|---|---|
| `TENANT_DB_URL` | Setting this activates `shouldUseLocalTenantDbFallback()` — the local PostgreSQL code path. Do NOT set it in production. The Supabase client path is used when this variable is absent. |

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
