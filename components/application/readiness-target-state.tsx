"use client";

import Link from "next/link";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseZap,
  Inbox,
  LockKeyhole,
} from "lucide-react";

export type ReadinessTargetStateKind =
  | "completed"
  | "empty"
  | "no-backend"
  | "permission-denied"
  | "validation-error";

export type ReadinessTargetStateAction = {
  label: string;
  href: string;
};

export type ReadinessTargetStateProps = {
  state: ReadinessTargetStateKind;
  title: string;
  description: string;
  detail?: string;
  primaryAction?: ReadinessTargetStateAction;
  secondaryAction?: ReadinessTargetStateAction;
};

const stateConfig = {
  completed: {
    color: "green",
    icon: CheckCircle2,
  },
  empty: {
    color: "gray",
    icon: Inbox,
  },
  "no-backend": {
    color: "orange",
    icon: DatabaseZap,
  },
  "permission-denied": {
    color: "red",
    icon: LockKeyhole,
  },
  "validation-error": {
    color: "yellow",
    icon: AlertTriangle,
  },
} as const;

export function ReadinessTargetState({
  state,
  title,
  description,
  detail,
  primaryAction,
  secondaryAction,
}: ReadinessTargetStateProps) {
  const config = stateConfig[state];
  const Icon = config.icon;

  return (
    <Alert
      color={config.color}
      icon={<Icon size={18} />}
      title={title}
      data-testid={`readiness-target-state-${state}`}
    >
      <Stack gap="sm">
        <Text size="sm">{description}</Text>
        {detail ? (
          <Text size="sm" c="dimmed">
            {detail}
          </Text>
        ) : null}
        {primaryAction || secondaryAction ? (
          <Group gap="sm">
            {primaryAction ? (
              <Button component={Link} href={primaryAction.href} size="xs" variant="light">
                {primaryAction.label}
              </Button>
            ) : null}
            {secondaryAction ? (
              <Button component={Link} href={secondaryAction.href} size="xs" variant="subtle">
                {secondaryAction.label}
              </Button>
            ) : null}
          </Group>
        ) : null}
      </Stack>
    </Alert>
  );
}
