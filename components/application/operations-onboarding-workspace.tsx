"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { AlertCircle, ClipboardList, FilePlus, Trash2, UserPlus } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { deleteOnboardingTemplateAction } from "@/app/app/church-admin/operations/actions";
import type { AuthSession } from "@/lib/auth";
import type { OnboardingInstanceSummary, OnboardingTemplate } from "@/lib/operations-types";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

function StatusBadge({ status }: { status: "open" | "closed" }) {
  return (
    <Badge color={status === "open" ? "green" : "gray"} size="sm">
      {status === "open" ? "Open" : "Closed"}
    </Badge>
  );
}

export function OperationsOnboardingWorkspace({
  session,
  templates,
  instances,
}: {
  session: AuthSession;
  templates: OnboardingTemplate[];
  instances: OnboardingInstanceSummary[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleDeleteTemplate(id: string) {
    setDeletingId(id);
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteOnboardingTemplateAction({ id });
      setDeletingId(null);
      if (!result.ok) {
        setDeleteError(result.error ?? "Unable to delete template.");
      }
    });
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref={session.homePath}
      sectionLabel="Church Admin"
      title="Onboarding"
      description="Templates & active member onboarding"
      sidebarTitle="Operations"
      sidebarDescription="Documents & onboarding"
      navItems={[
        {
          href: "/app/church-admin/operations/documents",
          label: "Documents",
          description: "Church documents library",
          icon: "ClipboardList",
        },
        {
          href: "/app/church-admin/operations/onboarding",
          label: "Onboarding",
          description: "Templates & active onboarding",
          icon: "UserPlus",
          active: true,
        },
      ]}
    >
      <Stack gap="lg">
        <Title order={2} fw={700} c="#101827">
          Onboarding
        </Title>

        {deleteError ? (
          <Alert color="red" icon={<AlertCircle size={16} />} onClose={() => setDeleteError(null)} withCloseButton>
            {deleteError}
          </Alert>
        ) : null}

        <Tabs defaultValue="templates" color="teal">
          <Tabs.List mb="md">
            <Tabs.Tab value="templates" leftSection={<ClipboardList size={14} />}>
              Templates
            </Tabs.Tab>
            <Tabs.Tab value="active" leftSection={<UserPlus size={14} />}>
              Active Onboarding
            </Tabs.Tab>
          </Tabs.List>

          {/* Templates Tab */}
          <Tabs.Panel value="templates">
            <Stack gap="md">
              <Group justify="flex-end">
                <Button
                  component={Link}
                  href="/app/church-admin/operations/onboarding/templates/new"
                  leftSection={<FilePlus size={16} />}
                  color="teal"
                  size="sm"
                >
                  New template
                </Button>
              </Group>

              {templates.length === 0 ? (
                <Paper
                  radius="md"
                  p="xl"
                  style={{
                    border: "1px dashed rgba(20, 33, 61, 0.15)",
                    textAlign: "center",
                  }}
                >
                  <ClipboardList size={36} color="#9ca3af" style={{ margin: "0 auto 12px" }} />
                  <Text c="#617184" size="sm">
                    No onboarding templates yet. Create your first template.
                  </Text>
                </Paper>
              ) : (
                <Paper radius="md" withBorder style={{ overflow: "hidden" }}>
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Template name</Table.Th>
                        <Table.Th>Created</Table.Th>
                        <Table.Th style={{ width: 120 }}>Actions</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {templates.map((tmpl) => (
                        <Table.Tr key={tmpl.id}>
                          <Table.Td>
                            <Text
                              component={Link}
                              href={`/app/church-admin/operations/onboarding/templates/${tmpl.id}`}
                              fw={500}
                              size="sm"
                              c="teal"
                              style={{ textDecoration: "none" }}
                            >
                              {tmpl.name}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" c="#617184">
                              {formatDate(tmpl.createdAt)}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Group gap={4}>
                              <Button
                                component={Link}
                                href={`/app/church-admin/operations/onboarding/templates/${tmpl.id}/edit`}
                                size="xs"
                                variant="light"
                                color="teal"
                              >
                                Edit
                              </Button>
                              <Button
                                size="xs"
                                variant="light"
                                color="red"
                                leftSection={<Trash2 size={12} />}
                                loading={isPending && deletingId === tmpl.id}
                                onClick={() => handleDeleteTemplate(tmpl.id)}
                              >
                                Delete
                              </Button>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Paper>
              )}
            </Stack>
          </Tabs.Panel>

          {/* Active Onboarding Tab */}
          <Tabs.Panel value="active">
            <Stack gap="md">
              <Group justify="flex-end">
                <Button
                  component={Link}
                  href="/app/church-admin/operations/onboarding/instances/new"
                  leftSection={<UserPlus size={16} />}
                  color="teal"
                  size="sm"
                >
                  Start onboarding
                </Button>
              </Group>

              {instances.length === 0 ? (
                <Paper
                  radius="md"
                  p="xl"
                  style={{
                    border: "1px dashed rgba(20, 33, 61, 0.15)",
                    textAlign: "center",
                  }}
                >
                  <UserPlus size={36} color="#9ca3af" style={{ margin: "0 auto 12px" }} />
                  <Text c="#617184" size="sm">
                    No onboarding in progress.
                  </Text>
                </Paper>
              ) : (
                <Paper radius="md" withBorder style={{ overflow: "hidden" }}>
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Member</Table.Th>
                        <Table.Th>Template</Table.Th>
                        <Table.Th>Steps</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Started</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {instances.map((inst) => (
                        <Table.Tr
                          key={inst.id}
                          style={{ cursor: "pointer" }}
                          onClick={() =>
                            router.push(
                              `/app/church-admin/operations/onboarding/instances/${inst.id}`,
                            )
                          }
                        >
                          <Table.Td>
                            <Text fw={500} size="sm">
                              {inst.profileName}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" c="#617184">
                              {inst.templateName ?? "—"}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" c="#617184">
                              {inst.completedSteps} / {inst.totalSteps}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <StatusBadge status={inst.status} />
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" c="#617184">
                              {formatDate(inst.createdAt)}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Paper>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </ApplicationShell>
  );
}
