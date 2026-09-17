"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

// Root-level error boundary (https://nextjs.org/docs/app/api-reference/file-conventions/error#global-error).
// Catches errors that escape every other error.tsx in the tree, including
// errors in the root layout itself. Reports to Sentry when configured
// (see instrumentation-client.ts) and falls back to Next's default error
// page UI. This was previously missing entirely -- unhandled errors at
// this level fell through to an unstyled default page with no reporting.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
