import * as Sentry from "@sentry/nextjs";

// Server/edge Sentry init, per the Next.js instrumentation hook
// (https://nextjs.org/docs/app/guides/instrumentation). No-ops safely when
// SENTRY_DSN isn't set -- see docs/setup/observability.md.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      // Pastoral notes, prayer requests, and other sensitive fields must
      // never reach Sentry. Errors are logged server-side already
      // (see logAuditEvent); this only forwards the error shape, not
      // application data, unless explicitly attached.
      sendDefaultPii: false,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
