"use client";

import { Badge, Button, Group, Paper, Stack, Table, Text, Title } from "@mantine/core";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";

import { ApplicationShell } from "@/components/application/app-shell";
import { financeNavItems } from "@/components/application/finance-nav";
import { ReadinessTargetState } from "@/components/application/readiness-target-state";
import type { ChurchAppSession } from "@/lib/auth";
import type { FinanceJournal } from "@/lib/finance-types";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

const STATUS_COLORS: Record<FinanceJournal["status"], string> = {
  draft: "yellow",
  posted: "green",
  voided: "gray",
};

const TYPE_COLORS: Record<FinanceJournal["journalType"], string> = {
  general: "blue",
  bank_feed: "teal",
  accounts_payable: "orange",
  import: "violet",
};

export function FinanceJournalWorkspace({
  session,
  journals,
  readinessView = false,
  dataSource = "live",
}: {
  session: ChurchAppSession;
  journals: FinanceJournal[];
  readinessView?: boolean;
  dataSource?: "preview" | "live";
}) {
  const visibleJournals = readinessView
    ? journals.filter((journal) => journal.status === "draft")
    : journals;
  const readinessState =
    dataSource === "preview"
      ? {
          state: "no-backend" as const,
          title: "Finance journal target unavailable",
          description:
            "Draft-journal readiness can be previewed, but live journal review, posting, and voiding checks need tenant data.",
          detail: "Configure the tenant backend before using this target to clear readiness.",
        }
      : journals.length === 0
        ? {
            state: "empty" as const,
            title: "No journal entries exist yet",
            description:
              "Create and post journal entries before relying on finance readiness and reports.",
          }
        : visibleJournals.length === 0
          ? {
              state: "completed" as const,
              title: "Draft journal readiness is clear",
              description:
                "No draft journal entries are waiting to be posted, voided, or reviewed.",
            }
          : {
              state: "validation-error" as const,
              title: "Draft journals need finance review",
              description:
                "Open each draft journal and either post it, correct it, or void it before finance readiness is complete.",
              detail: `${visibleJournals.length} draft journal${visibleJournals.length === 1 ? "" : "s"} need review.`,
            };

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Finance"
      title="Journal Entries"
      description={session.appContext.church.name}
      sidebarTitle="Finance"
      sidebarDescription="Post and review double-entry journal entries."
      navLabel="Finance"
      navItems={financeNavItems("/app/church-admin/finance/journals")}
    >
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <FileText size={20} />
            <Title order={3}>Journal Entries</Title>
          </Group>
          <Button component={Link} href="/app/church-admin/finance/journals/new" leftSection={<Plus size={16} />} size="sm">
            New Entry
          </Button>
        </Group>

        {readinessView ? (
          <>
            <Paper withBorder radius="lg" p="md" bg="#f8fbff">
              <Group justify="space-between" gap="md">
                <div>
                  <Text fw={700} size="sm">
                    Readiness view: draft journal entries.
                  </Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    {visibleJournals.length
                      ? `${visibleJournals.length} draft journal${visibleJournals.length === 1 ? "" : "s"} should be opened, posted, or voided before finance is ready.`
                      : "No draft journals are waiting for review."}
                  </Text>
                </div>
                <Text component={Link} href="/app/church-admin/readiness" size="sm" fw={700} c="churchBlue">
                  Back to readiness
                </Text>
              </Group>
            </Paper>
            <ReadinessTargetState
              {...readinessState}
              primaryAction={{ label: "Back to readiness", href: "/app/church-admin/readiness" }}
              secondaryAction={{ label: "New entry", href: "/app/church-admin/finance/journals/new" }}
            />
          </>
        ) : null}

        <Paper withBorder p="md" radius="md">
          {visibleJournals.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              {readinessView
                ? "No draft journal entries need readiness review."
                : "No journal entries yet. Create your first entry to get started."}
            </Text>
          ) : (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Description</Table.Th>
                  <Table.Th>Reference</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Status</Table.Th>
                  {readinessView ? <Table.Th>Resolve</Table.Th> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visibleJournals.map((j) => (
                  <Table.Tr key={j.id}>
                    <Table.Td>{formatDate(j.journalDate)}</Table.Td>
                    <Table.Td>
                      <Link href={`/app/church-admin/finance/journals/${j.id}`}>{j.description}</Link>
                    </Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{j.reference ?? "—"}</Text></Table.Td>
                    <Table.Td><Badge color={TYPE_COLORS[j.journalType]} variant="light" size="sm">{j.journalType}</Badge></Table.Td>
                    <Table.Td><Badge color={STATUS_COLORS[j.status]} size="sm">{j.status}</Badge></Table.Td>
                    {readinessView ? (
                      <Table.Td>
                        <Button component={Link} href={`/app/church-admin/finance/journals/${j.id}`} size="xs" variant="light">
                          Open to post/void
                        </Button>
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Paper>
      </Stack>
    </ApplicationShell>
  );
}
