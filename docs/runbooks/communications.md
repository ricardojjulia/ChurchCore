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

**Which provider sends (G5.1, ADR 0006).** One selection, `selectEmailProvider()` (`lib/communications/select-email-provider.ts`), serves both email paths (the communications queue and the direct `sendEmail()` for receipts and notices): Resend when `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are both set; otherwise SendGrid when `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` are both set; otherwise not configured. A half-set pair counts as unset. The provider used is recorded on `communication_logs.provider` and its message id on `provider_message_id`, which is what the Resend (Svix) and SendGrid delivery webhooks match on. Resend sends carry one `Idempotency-Key` per message, created before the first send: `comm-log:<log id>` for every queue send and every cron retry of that message (the log row's id is generated before the send, so the first send and each retry share the key; Resend replays a repeated key's success without sending again, so a delivered-but-timed-out email is not sent twice), and kind-prefixed ids for the direct path (`donation:<id>`, `registration-payment:<id>`, `recurring-failure:<invoice id>`). Giving statements use `comm-log:<claim row id>`, a fresh key per claim. Keys last 24 hours at Resend. The failed-send history shows a plain-language reason and offers Retry only when the server says it can work. SendGrid has no idempotency header.

**Stubs.** When neither provider is configured, sends return stub results only where stubs are allowed (local development and demo, `lib/stub-mode.ts`). In production, both paths refuse with `provider_not_configured`: for the direct `sendEmail()` path (donation receipts, recurring-gift failure notices, event-registration receipts) the receipt stays unsent (`receipt_sent_at` unset), a warning is logged, and the Stripe webhook still answers 200 instead of being retried (Council Review 42).

**Provider errors.** Both providers map to the same codes. Transient (the retry cron re-sends, up to 3 attempts): `rate_limited` (429), `provider_unavailable` (5xx), `temporary_failure` (409, an idempotent request still in flight), `network_error`, `timeout` (15 s). Permanent (dead-lettered at once): `invalid_request` (400, 422, other 4xx), `provider_auth_error` (401, 403: check the API key and that the sender domain is verified), `provider_config_error` (404, 405).

**One-off receipt re-send.** After setting the provider keys, run `node scripts/resend-unsent-receipts.mjs` (dry run: counts only), then again with `--apply`. See the script header for the env vars.

**Every webhook below fails closed (S2, Council Review 29, 2026-10-01).** While its secret or verification key is unset, the route rejects every request — in every environment, including production. This used to be backwards for three of the four: SendGrid, Twilio and Resend accepted an unsigned request as valid whenever their secret was unset ("verification is disabled"), and Stripe only checked a signature at all when a secret existed. A deploy that forgets to set a webhook secret doesn't get a quieter, unverified webhook anymore — it gets no working webhook at all, so confirm the relevant secret is set (and, for Stripe, that payments actually reconcile) right after any deploy. This is also owner action **O4** in `DEVELOPMENT_PLAN.md` §0.3.

---

## 2. Webhook Registration

### Stripe

1. Go to [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks) and add an endpoint at `https://<your-domain>/api/webhooks/stripe`.
2. Select `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `customer.subscription.deleted`.
3. Copy the signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.
4. Stripe signatures are checked against a **300-second (5-minute) replay window** — an event signed more than 5 minutes ago, or timestamped in the future, is rejected even with a valid signature. Don't replay an old "Send test webhook" payload expecting it to still verify.

### SendGrid

1. In SendGrid, go to **Settings → Mail Settings → Event Webhook** (the **signed** Event Webhook, not the legacy unsigned one).
2. Set the HTTP POST URL to `https://<your-domain>/api/webhooks/sendgrid`.
3. Enable the events the app consumes: Delivered, Bounced, Spam Report (Complaint), Unsubscribe, Dropped/Failed.
4. Turn on **Signed Event Webhook Requests** and copy the **Verification Key** shown there — it's an **ECDSA (P-256) public key**, base64 DER by default (a PEM `-----BEGIN PUBLIC KEY-----` block also works). Set it as `SENDGRID_WEBHOOK_VERIFICATION_KEY`. This is a public key, not a shared secret — SendGrid signs each event with its matching private key, and `app/api/webhooks/sendgrid` verifies `timestamp + body` against it with `crypto.verify("sha256", ...)`.
5. Without `SENDGRID_WEBHOOK_VERIFICATION_KEY` set, the route rejects every SendGrid event (fail-closed).

### Twilio (SMS)

1. Log in to [console.twilio.com](https://console.twilio.com).
2. Navigate to **Phone Numbers** → **Manage** → your sending number.
3. Under **Messaging** → **A Message Comes In** or **Status Callback URL**, set:
   `https://<your-domain>/api/webhooks/twilio`
4. Enable the following status callback events:
   - `queued`, `failed`, `sent`, `delivered`, `undelivered`
5. **`NEXT_PUBLIC_APP_URL` must be the exact public URL Twilio calls** (scheme, host, and path — e.g. `https://app.example.com`, no trailing slash). Twilio's HMAC-SHA1 signature is computed over that exact URL plus the sorted POST body; behind a proxy or load balancer, the request's own `Host` header usually isn't the public one, so the route resolves the signed URL from `NEXT_PUBLIC_APP_URL` instead. A wrong or unset value rejects every Twilio webhook even with a correct `TWILIO_AUTH_TOKEN`.
6. ChurchCore's own outbound sends now set a `StatusCallback` pointing at `/api/webhooks/twilio` (needs `NEXT_PUBLIC_APP_URL` too) — without it, Twilio never calls back at all for that message: no delivery status, and no error code when the recipient has replied STOP.
7. **Twilio error 21610** ("recipient has opted out") arrives as an `undelivered`/`failed` status callback with `ErrorCode=21610`. The route records this as an `unsubscribed` delivery event and writes an SMS suppression — the member won't receive another text until the suppression is removed (§3). Twilio itself already refuses to deliver to a number that replied STOP; this suppression is ChurchCore's own bookkeeping so it stops retrying and shows the reason to an admin. Twilio does **not** forward the inbound STOP message itself to ChurchCore today — there's no mapping from a sending number back to a church to route it to (tracked as a deferred item in `DEVELOPMENT_PLAN.md` §0.5).

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

---

## 3. Suppression Management SOP

### View suppressions

Open **Communications → Suppressions** (`/app/communications/suppressions`). Church admin, pastor and secretary can view the list: channel, contact, the member name when a church profile has that email or phone, the reason in words, notes, who added it (manual only) and the date. Filter by channel or search by contact or name.

### Manually add a suppression

Church admin only: use the "Add a suppression" form on the page (channel, contact, optional notes). A bad email, an empty contact or a contact that is already suppressed is refused with a message; an existing suppression is never overwritten, so an unsubscribe cannot be turned into a removable one.

### Automatic suppression (bounce/complaint flow)

1. Provider delivers an email.
2. A bounce or spam-complaint event fires the provider webhook.
3. Webhook route (`/api/webhooks/resend` or `/api/webhooks/sendgrid`) verifies the signature.
4. `recordProviderWebhookEvent` normalizes the event and writes a `communication_delivery_events` row.
5. If the status maps to `bounced` or `suppressed` (complaint), a row is automatically upserted into `communication_suppressions` with the appropriate reason (`bounce` or `complaint`).
6. A consent log entry is written for the affected profile.

### Remove a suppression

Church admin only, on the Suppressions page: **Remove** on a row, then give a reason of at least 5 characters. The removal is written to `audit_log` (actor, contact, channel, original reason, notes and your removal reason).

| Reason shown | Can staff remove it? |
|---|---|
| Bounced | Yes, for example once the member confirms the address is valid |
| Added by staff | Yes |
| Unsubscribed (link or STOP) | **No.** Locked. Only the person can opt back in. |
| Marked as spam | **No.** Locked. Only the person can opt back in. |

Unsubscribe and spam-complaint rows are consent records (and, for SMS, STOP is a TCPA-style obligation). The page deliberately has no button for them. SQL is the exception path, and only with the person's documented consent (for example a written request to be re-subscribed). Record that consent first, then:

```sql
delete from public.communication_suppressions
where church_id = '<church-id>'
  and channel = 'email'
  and contact = 'member@example.com';
```

Also add an `audit_log` entry describing the consent and who ran the SQL.

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
