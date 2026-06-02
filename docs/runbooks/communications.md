# Communications Runbook

Operator reference for the ChurchCore Ops communications subsystem (email + SMS delivery, suppressions, unsubscribe links, and webhooks).

---

## 1. Environment Variables

| Name | Description | Required | Example |
|---|---|---|---|
| `RESEND_API_KEY` | Resend API key (primary email provider) | Production | `re_abc123...` |
| `RESEND_FROM_EMAIL` | Sender address for Resend | Production | `hello@yourdomain.com` |
| `RESEND_WEBHOOK_SECRET` | Svix webhook signing secret from Resend dashboard | Production | `whsec_abc...` |
| `SENDGRID_API_KEY` | SendGrid API key (fallback email provider) | Optional | `SG.abc...` |
| `SENDGRID_FROM_EMAIL` | Sender address for SendGrid | Optional | `hello@yourdomain.com` |
| `TWILIO_ACCOUNT_SID` | Twilio account SID for SMS | Production (SMS) | `ACabc...` |
| `TWILIO_AUTH_TOKEN` | Twilio auth token for SMS | Production (SMS) | `abc123...` |
| `TWILIO_FROM_NUMBER` | Twilio phone number in E.164 format | Production (SMS) | `+15550001234` |
| `UNSUBSCRIBE_SECRET` | HMAC-SHA256 key for signing unsubscribe links | Production | 64-char hex string |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for unauthenticated DB writes (unsubscribe route) | Production | `eyJ...` |
| `NEXT_PUBLIC_APP_URL` | Public app base URL (used in unsubscribe link generation) | Production | `https://app.example.com` |

Generate `UNSUBSCRIBE_SECRET` with:

```sh
openssl rand -hex 32
```

When `RESEND_API_KEY` is absent the Resend adapter returns stub results — safe for local development. When both `RESEND_API_KEY` and `SENDGRID_API_KEY` are absent, all email sends return stub results.

---

## 2. Webhook Registration

### Resend

1. Log in to [resend.com](https://resend.com) and open **Webhooks** in the left sidebar.
2. Click **Add Endpoint**.
3. Set the URL to: `https://<your-domain>/api/webhooks/resend`
4. Enable the following events:
   - `email.sent`
   - `email.delivered`
   - `email.delivery_delayed`
   - `email.bounced`
   - `email.complained`
   - `email.opened`
   - `email.clicked`
5. After saving, copy the **Signing Secret** (starts with `whsec_`) and set it as `RESEND_WEBHOOK_SECRET`.

### Twilio (SMS)

1. Log in to [console.twilio.com](https://console.twilio.com).
2. Navigate to **Phone Numbers** → **Manage** → your sending number.
3. Under **Messaging** → **A Message Comes In** or **Status Callback URL**, set:
   `https://<your-domain>/api/webhooks/twilio`
4. Enable the following status callback events:
   - `queued`, `failed`, `sent`, `delivered`, `undelivered`

---

## 3. Suppression Management SOP

### View suppressions

Run the following query in the Supabase SQL editor (tenant project):

```sql
select church_id, channel, contact, reason, notes, created_at
from public.communication_suppressions
where church_id = '<church-id>'
order by created_at desc;
```

Or use the Church Admin → Communications → Suppressions UI (when available).

### Manually add a suppression

```sql
insert into public.communication_suppressions
  (church_id, channel, contact, reason, notes, suppressed_by)
values
  ('<church-id>', 'email', 'member@example.com', 'unsubscribe', 'Manual operator add', null)
on conflict (church_id, channel, contact) do nothing;
```

### Automatic suppression (bounce/complaint flow)

1. Provider delivers an email.
2. A bounce or spam-complaint event fires the provider webhook.
3. Webhook route (`/api/webhooks/resend` or `/api/webhooks/sendgrid`) verifies the signature.
4. `recordProviderWebhookEvent` normalizes the event and writes a `communication_delivery_events` row.
5. If the status maps to `bounced` or `suppressed` (complaint), a row is automatically upserted into `communication_suppressions` with the appropriate reason (`bounce` or `complaint`).
6. A consent log entry is written for the affected profile.

### Remove a suppression

To un-suppress a contact (for example after a member confirms their email address is valid):

```sql
delete from public.communication_suppressions
where church_id = '<church-id>'
  and channel = 'email'
  and contact = 'member@example.com';
```

Audit the removal reason in the consent log or a note in the member record as appropriate.

---

## 4. Retry SOP

### When to retry

Retry delivery only for transient error codes. The following codes are considered retryable:

| Error Code | Meaning |
|---|---|
| `timeout` | Network or provider timeout |
| `rate_limited` | Provider rate limit exceeded |
| `provider_unavailable` | Provider returned 5xx |
| `network_error` | Fetch-level network failure |
| `temporary_failure` | Provider indicated a temporary failure |

Do **not** retry for permanent failures: `sendgrid_400`, `resend_422`, bad recipient address, etc.

### Identify retryable failures

In the communications hub, filter `communication_logs` for:

```sql
select id, church_id, recipient_id, status, error_code, retry_count, created_at
from public.communication_logs
where status = 'failed'
  and error_code in ('timeout','rate_limited','provider_unavailable','network_error','temporary_failure')
  and retry_count < 3
order by created_at desc;
```

### Retry limit

Maximum **3 retry attempts** per message (`retry_count < 3`). After 3 failures, mark the message `failed` permanently and do not retry automatically. A church admin can manually re-trigger delivery if appropriate.

---

## 5. Unsubscribe Links

### Generate a link

```typescript
import { generateUnsubscribeLink } from "@/lib/communications/unsubscribe";

const link = generateUnsubscribeLink(churchId, "member@example.com", "email");
```

Include this link in the footer of every outbound email. Set `UNSUBSCRIBE_SECRET` in the environment before calling.

### Token expiry

Links are valid for **30 days** from generation. After 30 days, clicking the link returns a `400` response with a message instructing the recipient to contact the church directly.

### What happens when a recipient clicks

1. `GET /api/unsubscribe` is called with the token parameters.
2. The HMAC signature is verified server-side using `UNSUBSCRIBE_SECRET`.
3. On success, a row is upserted into `communication_suppressions` with `reason = 'unsubscribe'` and `notes = 'Self-service unsubscribe link'`.
4. The recipient sees a plain-text confirmation: _"You have been unsubscribed successfully..."_
5. Future sends are blocked at the suppression check before the provider is called.

### Expired link — what to tell recipients

> "Your unsubscribe link has expired (links are valid for 30 days). Please reply to any message from us or contact the church directly and ask to be removed from our mailing list."

The church admin can then manually add the suppression via the SOP above.

---

## 6. Auto-Retry Cron Queue

### How it works

A cron job at `/api/cron/communications-retry` runs every 15 minutes (configured in `vercel.json`). It queries all `communication_logs` rows where:

```sql
status = 'failed'
AND retry_count < 3
AND error_code IN ('timeout','rate_limited','provider_unavailable','network_error','temporary_failure')
```

For each eligible row, it resolves the recipient contact from `profiles`, builds a synthetic session, and calls `sendWithSuppression`. Updates use conditional `WHERE retry_count < 3` to prevent race-condition double-increments.

### Environment requirements

| Name | Required |
|---|---|
| `CRON_SECRET` | Yes — must match the Vercel cron secret |
| `UNSUBSCRIBE_SECRET` | Yes — required for all email sends |

### Response codes

| Status | Meaning |
|---|---|
| 200 | All eligible retries succeeded (or none to retry) |
| 207 | Some retries still failed (see `failedAgain` count in body) |
| 401 | Missing or wrong `CRON_SECRET` |
| 503 | Tenant backend not configured |
| 500 | Unexpected error |

### Manual operator retry (scoped to one church)

A church **pastor** or **church-admin** can trigger `retryAllEligibleAction()` from the server action layer. This is scoped to their `church_id` — it does not retry other tenants.

### Retry limit

Maximum 3 attempts per message. After 3 failures the row stays `status='failed'` with `retry_count=3` and is no longer eligible for auto-retry. A church admin can manually re-trigger delivery if appropriate.
