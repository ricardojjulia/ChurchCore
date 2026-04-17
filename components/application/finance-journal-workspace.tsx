"use client";

import { Badge, Button, Group, Paper, Stack, Table, Text, Title } from "@mantine/core";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";

import { ApplicationShell } from "@/components/application/app-shell";
import { financeNavItems } from "@/components/application/finance-nav";
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
}: {
  session: ChurchAppSession;
  journals: FinanceJournal[];
}) {
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

        <Paper withBorder p="md" radius="md">
          {journals.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">No journal entries yet. Create your first entry to get started.</Text>
          ) : (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Description</Table.Th>
                  <Table.Th>Reference</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {journals.map((j) => (
                  <Table.Tr key={j.id}>
                    <Table.Td>{formatDate(j.journalDate)}</Table.Td>
                    <Table.Td>
                      <Link href={`/app/church-admin/finance/journals/${j.id}`}>{j.description}</Link>
                    </Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{j.reference ?? "—"}</Text></Table.Td>
                    <Table.Td><Badge color={TYPE_COLORS[j.journalType]} variant="light" size="sm">{j.journalType}</Badge></Table.Td>
                    <Table.Td><Badge color={STATUS_COLORS[j.status]} size="sm">{j.status}</Badge></Table.Td>
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
