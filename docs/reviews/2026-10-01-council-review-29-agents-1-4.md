# Council Review 29 — Agents 1–4 (S2: webhooks fail closed, F4)

**Scope:** `fix/webhooks-fail-closed-s2`, commit `26db13c` vs `main`, diff-scoped. Four distinct `codebase-researcher` agents (Read/Grep/Glob only, so read-only by tool access). The orchestrator checked each claim marked below against source.

## Agent 1 — Database & API

- **Verified:**
  - All four webhooks fail closed.
  - Stripe's 300-second window rejects NaN, stale and far-future timestamps.
  - SendGrid uses ECDSA P-256 over timestamp + body, with the correct `x-twilio-email-event-webhook-*` headers.
  - Twilio uses HMAC-SHA1 over URL + sorted params; duplicate keys and trailing slashes are handled.
  - F4 writes are scoped to the resolved log's church.
  - Delivery events are idempotent (unique `idempotency_key`; a replay returns early, before the log, suppression and consent writes).
  - Twilio 21610 → `unsubscribed` passes the `communication_logs` status check (the orchestrator confirmed in `pg_constraint`; the e2e test writes one).
- **Reported Medium, reclassified Low by the orchestrator:** "Stripe handlers trust `metadata.church_id`."
  - The metadata is set only by server code (`lib/stripe/donations.ts`, `lib/stripe/event-registrations.ts`).
  - The public registration action (`app/portal/actions.ts`) takes `churchId` from its input. But it creates a PaymentIntent only after loading the event's registration settings under that church, so a mismatched church never gets one.
  - That action's wider hardening is S10.
- **Low:** a Stripe header with several `t=` parts uses the first. Stripe sends one, so this is spec-compliant.
- **Inferred, not verified:** "provider message ids can't collide across churches." There is no unique constraint on `communication_logs.provider_message_id`. In practice the ids are provider-issued and globally unique; stub ids exist only outside production.

## Agent 2 — Routes & Pages

- **Verified:**
  - The four webhook manifest entries point at real tests.
  - The e2e happy paths assert what their names say and clean up in `finally`.
  - The UI already renders `unsubscribed` (`STATUS_COLORS` in the history workspace and message detail).
- **Wrong:**
  - The cron's secret is `CRON_SECRET`, not `VERCEL_CRON_SECRET`.
  - "`Date.now()` gives more than 999ms separation between shards": it's millisecond resolution. A same-millisecond collision across shards is improbable, not impossible.

## Agent 3 — UX & operator experience

- **Verified:**
  - A missing webhook secret is visible only in server logs: no readiness item, no admin surface. A deploy without `STRIPE_WEBHOOK_SECRET` silently stops donation reconciliation.
  - There is no way to remove a suppression in the app (no action, no button); `docs/runbooks/communications.md` gives SQL.
  - Suppression reasons render as raw codes (`communications-hub.tsx:815`).
  - The runbook has webhook registration steps for Resend and Twilio, but none for SendGrid.
- **Pre-existing gaps that S2 makes live:** bounces and STOPs now really write suppressions, and only SQL can undo one. No real provider sends until G5.1, so no real bounce can arrive before then.

## Agent 4 — Feature & Competitive

- **Verified:**
  - Every item of S2's definition of done is met.
  - Readiness +1 (75 → 76) is reasonable.
  - Owner action needed: confirm the webhook secrets and `NEXT_PUBLIC_APP_URL` on the hosted deploy.
- **Wrong:**
  - "Twilio doesn't forward inbound STOP messages": it does, to the number's incoming-message webhook. S2 doesn't handle them because there's no mapping from sending number to church.
  - "TCPA/CTIA compliance is met": overstated. Twilio itself blocks delivery after STOP; our suppression is bookkeeping that stops retries.
  - "Competitors do the same": no evidence was given.
