import * as Sentry from "@sentry/nextjs";

// Client-side Sentry init. No-ops safely when NEXT_PUBLIC_SENTRY_DSN isn't
// set -- see docs/setup/observability.md.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
