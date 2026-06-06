"use client";

import Link from "next/link";
import { Banknote, Building2, Headset, MessageSquare, PlusCircle, ShieldCheck } from "lucide-react";
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useState } from "react";
import { notifications } from "@mantine/notifications";

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
  "demo-feedback": MessageSquare,
} as const;

const priorityColor = {
  healthy: "teal",
  warning: "yellow",
  critical: "red",
} as const;

function ProvisionTenantModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  return (
    <Modal opened={opened} onClose={onClose} title="Provision New Tenant" transitionProps={{ duration: 0 }}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Full tenant provisioning — domain setup, role mapping, billing initialisation, and
          connection registration — is coming in a future release.
        </Text>
        <TextInput label="Church name" placeholder="e.g. Sunrise Community Church" disabled />
        <TextInput label="Slug" placeholder="e.g. sunrise-community" disabled />
        <Button fullWidth disabled>Provision (coming soon)</Button>
      </Stack>
    </Modal>
  );
}

export function ControlPlaneDashboard({
  session,
  sectionId,
  dashboardData,
}: {
  session: AuthSession;
  sectionId: ControlPlaneSectionId;
  dashboardData: ControlPlaneDashboardData;
}) {
  const [provisionOpen, setProvisionOpen] = useState(false);
  const activeSection = getControlPlaneSection(sectionId) ?? controlPlaneSections[0];
  const navItems = controlPlaneSections.map((section) => ({
    href: section.id === "overview" ? "/control" : `/control/${section.id}`,
    label: section.label,
    description: section.description,
    icon: sectionIcons[section.id],
    active: section.id === activeSection.id,
  }));

  const isOverviewOrTenants =
    activeSection.id === "overview" || activeSection.id === "tenants";
  const queueItems = activeSection.id === "billing" ? billingQueue : supportQueue;

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
      <ProvisionTenantModal opened={provisionOpen} onClose={() => setProvisionOpen(false)} />

      {/* Header card */}
      <Paper withBorder radius="xl" p="xl">
        <Group justify="space-between" align="flex-start" gap="md">
          <div>
            <Badge color="churchBlue" variant="light" mb="sm">Platform</Badge>
            <Title order={2}>Overview</Title>
            <Text c="dimmed" size="sm" mt={6}>Core platform status and tenant access.</Text>
          </div>
          {session.appContext.kind === "church" ? (
            <Group gap="sm" wrap="wrap">
              <Badge color="yellow" variant="light">Tenant view active</Badge>
              <ReturnToControlPlaneButton />
            </Group>
          ) : null}
        </Group>
        {session.appContext.kind === "church" ? (
          <Text c="dimmed" size="sm" mt="md">
            Viewing {session.appContext.church.name} as {session.appContext.roleId}.
          </Text>
        ) : null}
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" mt="xl">
          {dashboardData.metrics.map((metric) => (
            <Paper
              key={metric.label}
              withBorder
              radius="xl"
              p="md"
              bg="#f8fbff"
              style={{ borderLeft: "4px solid #2563eb" }}
            >
              <Text size="xs" tt="uppercase" fw={700} c="dimmed">{metric.label}</Text>
              <Title order={3} mt="sm">{metric.value}</Title>
              <Text c="dimmed" size="sm" mt="sm">{metric.detail}</Text>
            </Paper>
          ))}
        </SimpleGrid>
      </Paper>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        {/* Left panel: tenant list or queue */}
        <Paper withBorder radius="xl" p="xl">
          <Group justify="space-between" align="center" mb="lg">
            <Title order={3} size="h4">{activeSection.label}</Title>
            {isOverviewOrTenants ? (
              <Button
                size="xs"
                variant="light"
                color="teal"
                radius="xl"
                leftSection={<PlusCircle size={13} />}
                onClick={() => setProvisionOpen(true)}
              >
                New tenant
              </Button>
            ) : (
              <Badge color="gray" variant="light">{activeSection.id}</Badge>
            )}
          </Group>

          {!isOverviewOrTenants && (
            <Paper p="sm" radius="md" bg="orange.0" mb="md" withBorder style={{ borderColor: "#fdba74" }}>
              <Text size="xs" c="orange.8" fw={600}>
                {activeSection.id === "billing"
                  ? "Placeholder data — billing provider integration not yet connected."
                  : "Placeholder data — support tickets will be pulled from the live queue."}
              </Text>
            </Paper>
          )}

          <Stack gap="sm">
            {(isOverviewOrTenants ? dashboardData.tenantItems : queueItems).map((item) => (
              <Paper key={JSON.stringify(item)} radius="xl" p="md" bg="#f8fafc" withBorder>
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
                        <Group gap="xs">
                          <Badge
                            color={priorityColor[item.priority as keyof typeof priorityColor]}
                            variant="light"
                          >
                            {item.priority}
                          </Badge>
                          <Button
                            size="xs"
                            variant="subtle"
                            color="gray"
                            radius="xl"
                            onClick={() =>
                              notifications.show({
                                title: "Coming soon",
                                message: "Tenant deactivation workflow is not yet available.",
                                color: "gray",
                              })
                            }
                          >
                            Deactivate
                          </Button>
                        </Group>
                      ) : null}
                    </Group>
                    <Text size="sm" mt="sm">{item.detail}</Text>
                  </>
                ) : (
                  <>
                    <Text fw={600}>{item.title}</Text>
                    <Text c="dimmed" size="sm" mt={6}>{item.detail}</Text>
                  </>
                )}
              </Paper>
            ))}
          </Stack>
        </Paper>

        {/* Right panel: tenant view launcher */}
        <Paper withBorder radius="xl" p="xl">
          <Group justify="space-between" align="center" mb="lg">
            <Title order={3} size="h4">Tenant view</Title>
            <Badge color="churchBlue" variant="light">{session.tenantViews.length}</Badge>
          </Group>
          <Stack gap="sm">
            {session.tenantViews.map((tenant) => (
              <Paper key={tenant.id} radius="xl" p="md" bg="#f8fafc" withBorder>
                <Group justify="space-between" align="center" gap="md">
                  <div>
                    <Text fw={600}>{tenant.name}</Text>
                    <Text c="dimmed" size="sm" mt={6}>
                      {tenant.connectionStatus === "ready" && tenant.runtimeChurchId
                        ? "Connection ready for tenant app launch."
                        : "Tenant routing is not ready yet."}
                    </Text>
                  </div>
                  <TenantViewLauncher church={tenant} isPreview={session.source === "preview"} />
                </Group>
              </Paper>
            ))}
          </Stack>
        </Paper>
      </SimpleGrid>

      {/* Audit log — full width */}
      <Paper withBorder radius="xl" p="xl">
        <Group justify="space-between" align="center" mb="lg">
          <div>
            <Title order={3} size="h4">Tenant-view audit log</Title>
            <Text c="dimmed" size="sm" mt={4}>Recent platform-admin access events across all tenants.</Text>
          </div>
          <Badge color="gray" variant="light">{dashboardData.auditItems.length}</Badge>
        </Group>
        {dashboardData.auditItems.length ? (
          <Stack gap="sm">
            {dashboardData.auditItems.map((item) => (
              <Paper key={item.id} radius="xl" p="md" bg="#f8fafc" withBorder>
                <Group justify="space-between" align="flex-start" gap="md">
                  <div>
                    <Text fw={600}>{item.church}</Text>
                    <Text c="dimmed" size="sm" mt={6}>{item.detail}</Text>
                  </div>
                  <Badge color={item.eventType === "enter" ? "teal" : "gray"} variant="light">
                    {item.when}
                  </Badge>
                </Group>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Text c="dimmed" size="sm">No tenant-view audit entries yet.</Text>
        )}
      </Paper>
    </ApplicationShell>
  );
}
