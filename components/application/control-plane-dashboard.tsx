"use client";

import Link from "next/link";
import { Banknote, Building2, Headset, ShieldCheck } from "lucide-react";
import {
  Badge,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import { ApplicationShell } from "@/components/application/app-shell";
import { ReturnToControlPlaneButton, TenantViewLauncher } from "@/components/application/tenant-view-controls";
import type { AuthSession } from "@/lib/auth";
import {
  billingQueue,
  controlPlaneSections,
  getControlPlaneSection,
  supportQueue,
  type ControlPlaneDashboardData,
  type ControlPlaneSectionId,
} from "@/lib/control-plane";

const sectionIcons = {
  overview: ShieldCheck,
  tenants: Building2,
  billing: Banknote,
  support: Headset,
} as const;

const priorityColor = {
  healthy: "teal",
  warning: "yellow",
  critical: "red",
} as const;

export function ControlPlaneDashboard({
  session,
  sectionId,
  dashboardData,
}: {
  session: AuthSession;
  sectionId: ControlPlaneSectionId;
  dashboardData: ControlPlaneDashboardData;
}) {
  const activeSection = getControlPlaneSection(sectionId) ?? controlPlaneSections[0];
  const navItems = controlPlaneSections.map((section) => ({
    href: section.id === "overview" ? "/control" : `/control/${section.id}`,
    label: section.label,
    description: section.description,
    icon: sectionIcons[section.id],
    active: section.id === activeSection.id,
  }));

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/control"
      calendarHref={null}
      sectionLabel="Control Plane"
      title="Control"
      description="Tenants, billing, support"
      sidebarTitle="Control"
      sidebarDescription="Internal"
      navItems={navItems}
      topActions={
        <Group gap="sm" wrap="wrap" justify="flex-end">
          <Button component={Link} href="/control" radius="xl" variant="default">
            Control home
          </Button>
        </Group>
      }
    >
      <Paper withBorder radius="xl" p="xl">
        <Title order={2}>Overview</Title>

        {session.appContext.kind === "church" ? (
          <Group mt="lg">
            <Badge color="yellow" variant="light">
              Tenant view active
            </Badge>
            <Text c="dimmed" size="sm">
              Viewing {session.appContext.church.name} as{" "}
              {session.appContext.roleId}.
            </Text>
            <ReturnToControlPlaneButton />
          </Group>
        ) : null}

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" mt="xl">
          {dashboardData.metrics.map((metric) => (
            <Paper
              key={metric.label}
              withBorder
              radius="xl"
              p="md"
              bg="gray.0"
            >
              <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                {metric.label}
              </Text>
              <Title order={3} mt="sm">
                {metric.value}
              </Title>
              <Text c="dimmed" size="sm" mt="sm">
                {metric.detail}
              </Text>
            </Paper>
          ))}
        </SimpleGrid>
      </Paper>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <Paper withBorder radius="xl" p="xl">
          <Title order={3} size="h4">
            {activeSection.label}
          </Title>

          <Stack gap="sm" mt="lg">
            {(activeSection.id === "overview" || activeSection.id === "tenants"
              ? dashboardData.tenantItems
              : activeSection.id === "billing"
                ? billingQueue
                : supportQueue
            ).map((item) => (
              <Paper key={JSON.stringify(item)} radius="xl" p="md" bg="gray.0">
                {"church" in item ? (
                  <>
                    <Group justify="space-between" align="flex-start">
                      <div>
                        <Text fw={600}>{item.church}</Text>
                        <Text c="dimmed" size="sm" mt={6}>
                          {"stage" in item ? item.stage : item.status}
                        </Text>
                      </div>
                      {"priority" in item ? (
                        <Badge
                          color={
                            priorityColor[
                              item.priority as keyof typeof priorityColor
                            ]
                          }
                          variant="light"
                        >
                          {item.priority}
                        </Badge>
                      ) : null}
                    </Group>
                    <Text size="sm" mt="sm">
                      {item.detail}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text fw={600}>{item.title}</Text>
                    <Text c="dimmed" size="sm" mt={6}>
                      {item.detail}
                    </Text>
                  </>
                )}
              </Paper>
            ))}
          </Stack>
        </Paper>

        <Paper withBorder radius="xl" p="xl">
          <Title order={3} size="h4">
            Tenant view
          </Title>
        <Stack gap="sm" mt="lg">
          {session.tenantViews.map((tenant) => (
            <Paper key={tenant.id} radius="xl" p="md" bg="gray.0">
                <Group justify="space-between" align="center" gap="md">
                  <div>
                    <Text fw={600}>{tenant.name}</Text>
                    <Text c="dimmed" size="sm" mt={6}>
                      Open the church app for this tenant.
                    </Text>
                  </div>
                  <TenantViewLauncher church={tenant} />
                </Group>
              </Paper>
            ))}

            <Paper withBorder radius="xl" p="md">
              <Text fw={600}>Recent tenant-view audit</Text>
              <Stack gap="sm" mt="md">
                {dashboardData.auditItems.length ? (
                  dashboardData.auditItems.map((item) => (
                    <Paper key={item.id} radius="xl" p="md" bg="gray.0">
                      <Group justify="space-between" align="flex-start" gap="md">
                        <div>
                          <Text fw={600}>{item.church}</Text>
                          <Text c="dimmed" size="sm" mt={6}>
                            {item.detail}
                          </Text>
                        </div>
                        <Badge
                          color={item.eventType === "enter" ? "teal" : "gray"}
                          variant="light"
                        >
                          {item.when}
                        </Badge>
                      </Group>
                    </Paper>
                  ))
                ) : (
                  <Text c="dimmed" size="sm">
                    No tenant-view audit entries yet.
                  </Text>
                )}
              </Stack>
            </Paper>
          </Stack>
        </Paper>
      </SimpleGrid>
    </ApplicationShell>
  );
}
