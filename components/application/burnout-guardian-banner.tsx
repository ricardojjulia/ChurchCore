"use client";

import { Alert, Stack, Text } from "@mantine/core";
import { AlertTriangle } from "lucide-react";

export function BurnoutGuardianBanner({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;

  return (
    <Alert
      icon={<AlertTriangle size={16} />}
      title="Burnout Guardian"
      color="yellow"
      radius="xl"
      variant="light"
    >
      <Stack gap="xs">
        <Text size="sm">
          The following volunteers are currently serving in more than 3 ministries. Consider
          reviewing their workload with pastoral care.
        </Text>
        {warnings.map((warning) => (
          <Text key={warning} size="sm" fw={500}>
            &bull; {warning}
          </Text>
        ))}
        <Text size="xs" c="dimmed" fs="italic" mt={4}>
          AI-assistive disclaimer: This check is rule-based. Pastoral discernment should guide all
          conversations about serving capacity.
        </Text>
      </Stack>
    </Alert>
  );
}
