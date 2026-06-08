"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { UserPlus } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import type { AuthSession } from "@/lib/auth";
import type { OnboardingInstanceSummary } from "@/lib/operations-types";

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

export function OperationsOnboardingInstancesWorkspace({
  session,
  instances,
}: {
  session: AuthSession;
  instances: OnboardingInstanceSummary[];
}) {
  const router = useRouter();
  return (
    <ApplicationShell
      session={session}
      workspaceHref={session.homePath}
      sectionLabel="Church Admin"
      title="Active Onboarding"
      description="Track member onboarding progress"
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
        <Group justify="space-between" align="center">
          <Title order={2} fw={700} c="#101827">
            Active Onboarding
          </Title>
          <Button
            component={Link}
            href="/app/church-admin/operations/onboarding/instances/new"
            leftSection={<UserPlus size={16} />}
            color="teal"
          >
            Start new onboarding
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
            <UserPlus size={40} color="#9ca3af" style={{ margin: "0 auto 12px" }} />
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
                  <Table.Th>Progress</Table.Th>
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
                        {inst.completedSteps} of {inst.totalSteps} steps
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
    </ApplicationShell>
  );
}
