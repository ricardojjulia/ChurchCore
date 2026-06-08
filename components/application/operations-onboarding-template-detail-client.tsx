"use client";

import Link from "next/link";
import {
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { Edit } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import type { AuthSession } from "@/lib/auth";
import type { OnboardingTemplate, OnboardingTemplateStep } from "@/lib/operations-types";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function OperationsOnboardingTemplateDetailClient({
  session,
  template,
  steps,
}: {
  session: AuthSession;
  template: OnboardingTemplate;
  steps: OnboardingTemplateStep[];
}) {
  return (
    <ApplicationShell
      session={session}
      workspaceHref={session.homePath}
      sectionLabel="Church Admin"
      title={template.name}
      description={`${steps.length} step${steps.length !== 1 ? "s" : ""}`}
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
      <Stack gap="lg" maw={760}>
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Title order={2} fw={700} c="#101827">
              {template.name}
            </Title>
            <Text size="xs" c="#9ca3af">
              Created {formatDate(template.createdAt)} &middot;{" "}
              {steps.length} step{steps.length !== 1 ? "s" : ""}
            </Text>
          </Stack>
          <Button
            component={Link}
            href={`/app/church-admin/operations/onboarding/templates/${template.id}/edit`}
            leftSection={<Edit size={15} />}
            variant="default"
            size="sm"
          >
            Edit
          </Button>
        </Group>

        {steps.length === 0 ? (
          <Paper
            radius="md"
            p="xl"
            style={{
              border: "1px dashed rgba(20, 33, 61, 0.15)",
              textAlign: "center",
            }}
          >
            <Text c="#617184" size="sm">
              No steps configured for this template.
            </Text>
          </Paper>
        ) : (
          <Stack gap="sm">
            {steps.map((step, idx) => (
              <Paper key={step.id} radius="md" p="md" withBorder>
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                    <Group gap="sm" align="center">
                      <Text size="xs" fw={700} c="#617184" tt="uppercase" style={{ minWidth: 20 }}>
                        {idx + 1}.
                      </Text>
                      <Text fw={600} size="sm" c="#101827">
                        {step.title}
                      </Text>
                    </Group>
                    {step.description ? (
                      <Text size="sm" c="#617184" ml={28}>
                        {step.description}
                      </Text>
                    ) : null}
                  </Stack>
                  <Badge
                    color={step.assigneeType === "staff" ? "blue" : "teal"}
                    size="sm"
                    variant="light"
                  >
                    {step.assigneeType === "staff" ? "Staff" : "New Member"}
                  </Badge>
                </Group>
              </Paper>
            ))}
          </Stack>
        )}
      </Stack>
    </ApplicationShell>
  );
}
