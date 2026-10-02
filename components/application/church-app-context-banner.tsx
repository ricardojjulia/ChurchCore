"use client";

import { ArrowUpRight, Building2 } from "lucide-react";
import { Badge, Group, Paper, Text } from "@mantine/core";

import { ReturnToControlPlaneButton } from "@/components/application/tenant-view-controls";
import type { AuthSession } from "@/lib/auth";

export function ChurchAppContextBanner({ session }: { session: AuthSession }) {
  if (session.appContext.kind !== "church") {
    return null;
  }

  return (
    <Paper
      radius="lg"
      p="md"
      style={{
        background:
          "linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(15, 23, 42, 0.78))",
        border: "1px solid #1e293b",
        boxShadow: "0 12px 34px #1e293b",
      }}
    >
      <Group justify="space-between" align="center" gap="md">
        <Group gap="sm" wrap="wrap">
          <Badge color="indigo" variant="light" radius="xl" leftSection={<Building2 size={12} />}>
            {session.appContext.church.name}
          </Badge>
          <Text size="sm" c="#94a3b8">
            {session.appContext.source === "impersonation"
              ? `Tenant view · ${session.appContext.roleId}`
              : `Role · ${session.appContext.roleId}`}
          </Text>
        </Group>

        {session.appContext.source === "impersonation" ? (
          <Group gap="sm">
            <Badge color="yellow" variant="light" leftSection={<ArrowUpRight size={12} />}>
              Explicit tenant view
            </Badge>
            <ReturnToControlPlaneButton />
          </Group>
        ) : null}
      </Group>
    </Paper>
  );
}
