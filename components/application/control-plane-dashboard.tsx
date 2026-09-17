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
  Table,
  Select,
} from "@mantine/core";
import { useState } from "react";
import { notifications } from "@mantine/notifications";

import { ApplicationShell } from "@/components/application/app-shell";
import { ReturnToControlPlaneButton, TenantViewLauncher } from "@/components/application/tenant-view-controls";
import type { AuthSession } from "@/lib/auth";
import {
  updateTenantAction,
  deleteTenantAction,
  eraseTenantDataAction,
} from "@/app/control/actions";
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

  const [editingTenant, setEditingTenant] = useState<{
    id: string;
    name: string;
    slug: string;
    status: string;
    plan: string;
  } | null>(null);

  const [deletingTenant, setDeletingTenant] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [erasingTenant, setErasingTenant] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [editForm, setEditForm] = useState({
    name: "",
    slug: "",
    status: "active",
    billingStatus: "active",
  });
  const activeSection = getControlPlaneSection(sectionId) ?? controlPlaneSections[0];
  const navItems = controlPlaneSections.map((section) => ({
    href: section.id === "overview" ? "/control" : `/control/${section.id}`,
    label: section.label,
    description: section.description,
    icon: sectionIcons[section.id],
    active: section.id === activeSection.id,
  }));

  const isOverview = activeSection.id === "overview";
  const queueItems = activeSection.id === "billing" ? billingQueue : supportQueue;

  if (sectionId === "tenants") {
    const list = dashboardData.tenantsList ?? [];
    const totalCount = list.length;
    const activeCount = list.filter((t) => t.status === "active").length;
    const trialCount = list.filter((t) => t.plan === "trial").length;
    const expiringCount = list.filter((t) => t.trialEnds !== null).length;

    return (
      <ApplicationShell
        session={session}
        workspaceHref="/control"
        calendarHref={null}
        sectionLabel="Platform Admin"
        title="Tenants"
        description="Core platform status and tenant access."
        sidebarTitle="Platform Admin"
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

        {/* Edit Modal */}
        <Modal
          opened={editingTenant !== null}
          onClose={() => setEditingTenant(null)}
          title={`Edit Tenant: ${editingTenant?.name}`}
          transitionProps={{ duration: 0 }}
        >
          <Stack gap="md">
            <TextInput
              label="Name"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.currentTarget.value })}
              required
            />
            <TextInput
              label="Slug"
              value={editForm.slug}
              onChange={(e) => setEditForm({ ...editForm, slug: e.currentTarget.value })}
              required
            />
            <Select
              label="Status"
              data={[
                { value: "draft", label: "Draft" },
                { value: "provisioning", label: "Provisioning" },
                { value: "active", label: "Active" },
                { value: "suspended", label: "Suspended" },
                { value: "archived", label: "Archived" },
              ]}
              value={editForm.status}
              onChange={(val) => setEditForm({ ...editForm, status: val ?? "active" })}
            />
            <Select
              label="Billing Status"
              data={[
                { value: "trialing", label: "Trialing" },
                { value: "active", label: "Active" },
                { value: "past_due", label: "Past Due" },
                { value: "canceled", label: "Canceled" },
                { value: "manual_review", label: "Manual Review" },
              ]}
              value={editForm.billingStatus}
              onChange={(val) => setEditForm({ ...editForm, billingStatus: val ?? "active" })}
            />
            <Button
              fullWidth
              color="indigo"
              onClick={async () => {
                if (!editingTenant) return;
                try {
                  await updateTenantAction({
                    tenantId: editingTenant.id,
                    name: editForm.name,
                    slug: editForm.slug,
                    status: editForm.status,
                    billingStatus: editForm.billingStatus,
                  });
                  notifications.show({
                    title: "Success",
                    message: "Tenant updated successfully.",
                    color: "green",
                  });
                  setEditingTenant(null);
                } catch (err: unknown) {
                  notifications.show({
                    title: "Error",
                    message: err instanceof Error ? err.message : "Failed to update tenant.",
                    color: "red",
                  });
                }
              }}
            >
              Save Changes
            </Button>
          </Stack>
        </Modal>

        {/* Delete Modal */}
        <Modal
          opened={deletingTenant !== null}
          onClose={() => setDeletingTenant(null)}
          title="Delete Tenant"
          transitionProps={{ duration: 0 }}
        >
          <Stack gap="md">
            <Text size="sm">
              Are you sure you want to delete the tenant <strong>{deletingTenant?.name}</strong>? This action will remove the tenant from the control plane registry and is irreversible.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDeletingTenant(null)}>Cancel</Button>
              <Button
                color="red"
                onClick={async () => {
                  if (!deletingTenant) return;
                  try {
                    await deleteTenantAction(deletingTenant.id);
                    notifications.show({
                      title: "Success",
                      message: "Tenant deleted successfully.",
                      color: "green",
                    });
                    setDeletingTenant(null);
                  } catch (err: unknown) {
                    notifications.show({
                      title: "Error",
                      message: err instanceof Error ? err.message : "Failed to delete tenant.",
                      color: "red",
                    });
                  }
                }}
              >
                Delete Tenant
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* Erase Tenant Data Modal */}
        <Modal
          opened={erasingTenant !== null}
          onClose={() => setErasingTenant(null)}
          title="Erase Tenant Data"
          transitionProps={{ duration: 0 }}
        >
          <Stack gap="md">
            <Text size="sm">
              Are you sure you want to erase all data for <strong>{erasingTenant?.name}</strong>? This will clear all schedules, donations, events, and profiles.
            </Text>
            <Text size="sm" c="orange.8" fw={600}>
              A default administrative user (System Admin) will be auto-created for this tenant immediately.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setErasingTenant(null)}>Cancel</Button>
              <Button
                color="orange"
                onClick={async () => {
                  if (!erasingTenant) return;
                  try {
                    const result = await eraseTenantDataAction(erasingTenant.id);
                    if (result.ok) {
                      notifications.show({
                        title: "Success",
                        message: `Tenant data erased across ${result.erasedTables.length} tables and administrative account re-seeded.`,
                        color: "green",
                      });
                    } else {
                      notifications.show({
                        title: "Partially completed",
                        message: `Erased ${result.erasedTables.length} tables, but ${result.failedTables.length} failed (${result.failedTables.map((f) => f.table).join(", ")}). Re-run after resolving the underlying error.`,
                        color: "orange",
                        autoClose: false,
                      });
                    }
                    setErasingTenant(null);
                  } catch (err: unknown) {
                    notifications.show({
                      title: "Error",
                      message: err instanceof Error ? err.message : "Failed to erase tenant data.",
                      color: "red",
                    });
                  }
                }}
              >
                Erase & Re-create Admin
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Stack gap="xl">
          {/* Header block with New Tenant button */}
          <Group justify="space-between" align="center">
            <div>
              <Title order={2} style={{ color: "#ffffff" }}>Tenants</Title>
            </div>
            <Button
              color="indigo"
              radius="md"
              leftSection={<PlusCircle size={15} />}
              onClick={() => setProvisionOpen(true)}
              styles={{
                root: {
                  backgroundColor: "#5c5fc8",
                  "&:hover": {
                    backgroundColor: "#4c4fa8",
                  },
                },
              }}
            >
              New Tenant
            </Button>
          </Group>

          {/* Metric cards */}
          <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="md">
            {[
              { label: "Total", value: totalCount },
              { label: "Active", value: activeCount },
              { label: "Trial", value: trialCount },
              { label: "Expiring 30d", value: expiringCount },
            ].map((card) => (
              <Paper
                key={card.label}
                withBorder
                radius="md"
                p="md"
                bg="#0b1329"
                style={{ borderColor: "#1e293b", color: "#f8fafc" }}
              >
                <Text size="2.5rem" fw={800} lh={1} style={{ color: "#f8fafc" }}>
                  {card.value}
                </Text>
                <Text size="sm" c="dimmed" mt="xs">
                  {card.label}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>

          {/* Table */}
          <Paper withBorder radius="md" p="md" bg="#0b1329" style={{ borderColor: "#1e293b", overflowX: "auto" }}>
            <Table variant="unstyled" style={{ color: "#f8fafc" }}>
              <Table.Thead style={{ borderBottom: "1px solid #1e293b" }}>
                <Table.Tr>
                  <Table.Th style={{ color: "#64748b", fontWeight: 700, fontSize: "12px", textTransform: "uppercase" }}>Tenant</Table.Th>
                  <Table.Th style={{ color: "#64748b", fontWeight: 700, fontSize: "12px", textTransform: "uppercase" }}>Status</Table.Th>
                  <Table.Th style={{ color: "#64748b", fontWeight: 700, fontSize: "12px", textTransform: "uppercase" }}>Plan</Table.Th>
                  <Table.Th style={{ color: "#64748b", fontWeight: 700, fontSize: "12px", textTransform: "uppercase" }}>Users</Table.Th>
                  <Table.Th style={{ color: "#64748b", fontWeight: 700, fontSize: "12px", textTransform: "uppercase" }}>Courses</Table.Th>
                  <Table.Th style={{ color: "#64748b", fontWeight: 700, fontSize: "12px", textTransform: "uppercase" }}>Health</Table.Th>
                  <Table.Th style={{ color: "#64748b", fontWeight: 700, fontSize: "12px", textTransform: "uppercase" }}>Trial Ends</Table.Th>
                  <Table.Th style={{ color: "#64748b", fontWeight: 700, fontSize: "12px", textTransform: "uppercase", textAlign: "right" }}>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {list.map((tenant) => (
                  <Table.Tr key={tenant.id} style={{ borderBottom: "1px solid #1e293b" }}>
                    <Table.Td style={{ padding: "16px 12px" }}>
                      <Text fw={700} style={{ color: "#f8fafc" }}>{tenant.name}</Text>
                      <Text size="xs" style={{ color: "#64748b" }}>{tenant.slug}</Text>
                    </Table.Td>
                    <Table.Td style={{ padding: "16px 12px" }}>
                      <Badge color="green" variant="filled" size="sm" radius="xs" style={{ textTransform: "lowercase", backgroundColor: "#166534", color: "#4ade80" }}>
                        {tenant.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td style={{ padding: "16px 12px" }}>
                      <Badge variant="filled" size="sm" radius="xs" style={{ textTransform: "lowercase", backgroundColor: "#1e293b", color: "#94a3b8" }}>
                        {tenant.plan}
                      </Badge>
                    </Table.Td>
                    <Table.Td style={{ padding: "16px 12px", fontWeight: 600 }}>{tenant.usersCount}</Table.Td>
                    <Table.Td style={{ padding: "16px 12px", fontWeight: 600 }}>{tenant.coursesCount}</Table.Td>
                    <Table.Td style={{ padding: "16px 12px" }}>
                      <span style={{ backgroundColor: "#22c55e", color: "#ffffff", padding: "2px 6px", borderRadius: "2px", fontWeight: 700, fontSize: "12px" }}>
                        {tenant.health}
                      </span>
                    </Table.Td>
                    <Table.Td style={{ padding: "16px 12px", color: "#64748b" }}>{tenant.trialEnds ?? "—"}</Table.Td>
                    <Table.Td style={{ padding: "16px 12px", textAlign: "right" }}>
                      <Group gap="sm" justify="flex-end">
                        <Text
                          size="sm"
                          style={{ cursor: "pointer", color: "#94a3b8" }}
                          onClick={() => {
                            setEditingTenant(tenant);
                            setEditForm({
                              name: tenant.name,
                              slug: tenant.slug,
                              status: tenant.status,
                              billingStatus: tenant.plan === "trial" ? "trialing" : tenant.plan === "pro" ? "active" : "active",
                            });
                          }}
                        >
                          Edit
                        </Text>
                        <Text
                          size="sm"
                          style={{ cursor: "pointer", color: "#f97316", fontWeight: 600 }}
                          onClick={() => {
                            setErasingTenant({ id: tenant.id, name: tenant.name });
                          }}
                        >
                          Erase Data
                        </Text>
                        <Text
                          size="sm"
                          style={{ cursor: "pointer", color: "#f97316", fontWeight: 600 }}
                          onClick={() =>
                            notifications.show({
                              title: "Coming soon",
                              message: "Tenant suspension is coming soon.",
                              color: "gray",
                            })
                          }
                        >
                          Suspend
                        </Text>
                        <Text
                          size="sm"
                          style={{ cursor: "pointer", color: "#ef4444", fontWeight: 600 }}
                          onClick={() => {
                            setDeletingTenant({ id: tenant.id, name: tenant.name });
                          }}
                        >
                          Delete
                        </Text>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        </Stack>
      </ApplicationShell>
    );
  }

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
            {isOverview ? (
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

          {!isOverview && activeSection.id !== "tenants" && (
            <Paper p="sm" radius="md" bg="orange.0" mb="md" withBorder style={{ borderColor: "#fdba74" }}>
              <Text size="xs" c="orange.8" fw={600}>
                {activeSection.id === "billing"
                  ? "Placeholder data — billing provider integration not yet connected."
                  : "Placeholder data — support tickets will be pulled from the live queue."}
              </Text>
            </Paper>
          )}

          <Stack gap="sm">
            {(isOverview ? dashboardData.tenantItems : queueItems).map((item) => (
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
