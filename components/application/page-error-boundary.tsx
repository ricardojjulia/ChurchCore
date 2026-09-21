"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Shared fallback for route-segment error.tsx boundaries (app/app, app/portal,
 * app/control). Reports to Sentry and offers Next's `reset()` retry, matching
 * the scoped-boundary convention already used for loading.tsx at these same
 * three roots (see PageLoadingSkeleton). Anything that escapes this still
 * falls through to app/global-error.tsx.
 */
export function PageErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <Stack gap="lg" p="lg">
      <Alert color="red" icon={<AlertTriangle size={16} />} title="Something went wrong" radius="md">
        <Stack gap="sm">
          <Text size="sm">
            This page ran into a problem loading. The issue has been reported.
          </Text>
          <Group>
            <Button size="sm" variant="light" color="red" leftSection={<RotateCcw size={14} />} onClick={reset}>
              Try again
            </Button>
          </Group>
        </Stack>
      </Alert>
    </Stack>
  );
}
