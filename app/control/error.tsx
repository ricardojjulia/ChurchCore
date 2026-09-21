"use client";

import { PageErrorBoundary } from "@/components/application/page-error-boundary";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PageErrorBoundary error={error} reset={reset} />;
}
