# ChurchCore — Observability Setup

Code-side wiring for error tracking and performance monitoring is in place. This document covers what's already done and what still requires a live account to activate — nothing here works end-to-end until you complete the account setup steps below.

Tracked against `docs/production-readiness-roadmap.md` Phase 3.

---

## Vercel Analytics + Speed Insights

**Code:** `@vercel/analytics` and `@vercel/speed-insights` are installed and wired into `app/layout.tsx` (`<Analytics />`, `<SpeedInsights />`).

**To activate:** nothing to install or configure — these components are no-ops unless the app is actually deployed on Vercel, and self-detect. Enable collection in the Vercel dashboard:

1. Project → Analytics tab → Enable
2. Project → Speed Insights tab → Enable

Takes effect on the next deploy. No env vars needed.

## Sentry (error tracking + performance traces)

**Code:**

- `instrumentation.ts` — server/edge init via the [Next.js instrumentation hook](https://nextjs.org/docs/app/guides/instrumentation), plus `onRequestError` wired to `Sentry.captureRequestError` for errors Next.js's own error-handling surfaces (API routes, Server Actions, RSC rendering).
- `instrumentation-client.ts` — browser-side init, plus `onRouterTransitionStart` for client-side navigation tracing.
- `app/global-error.tsx` — root-level error boundary (previously missing entirely — see Council Review 9's Agent 3 finding: "No `error.tsx` files at any `app/` segment"). Catches errors that escape every other `error.tsx` in the tree and reports them to Sentry.
- `next.config.ts` — wrapped with `withSentryConfig` (source map upload, cron monitor registration for the existing `shepherd-ai`/`communications-retry` Vercel crons).

All of the above is safe with no Sentry account connected: `Sentry.init({ dsn: undefined })` is a documented no-op (SDK stays inert, no console errors), and `withSentryConfig` skips source-map upload without `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT`. Verified via `npm run build` with no Sentry env vars set — clean, no warnings.

**To activate — this is what a live account gives you, and this repo cannot create one for you:**

1. Create a Sentry account and project at sentry.io (or self-hosted) if you don't have one — Next.js platform.
2. Get the DSN from Project Settings → Client Keys (DSN).
3. Set in `.env.local` (dev) and Vercel (Production + Preview):
   - `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` — same value, one for server, one for the browser bundle.
4. Optional, for readable stack traces (uploads source maps at build time): `SENTRY_AUTH_TOKEN` (Settings → Auth Tokens, needs `project:releases` scope), `SENTRY_ORG`, `SENTRY_PROJECT`.
5. Deploy. Trigger a test error (e.g. throw in a scratch route) and confirm it appears in the Sentry dashboard — **this repo has not verified an event actually arrives**, since that requires a live DSN this environment doesn't have. Do this before trusting the integration.

**PII note:** `sendDefaultPii: false` is set in both init calls. Given this app handles pastoral notes, prayer requests, and other sensitive fields (see `docs/security-assessment.md`), do not flip this to `true` without a deliberate review of what Sentry's default PII capture would include (IP addresses, request headers, cookies).

## What This Doesn't Cover

Per `docs/production-readiness-roadmap.md` Phase 3, still open:

- Log drain (Vercel → Axiom/Datadog/etc.) — not started.
- Uptime checks on `/app`, `/control`, `/portal` — not started.
