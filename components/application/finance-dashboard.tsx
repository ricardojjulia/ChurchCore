"use client";

import { Badge, Group, Paper, RingProgress, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { BarChart2, BookOpen, DollarSign, FileText, Landmark, TrendingUp, Upload } from "lucide-react";
import Link from "next/link";

import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import type { FinanceDashboardData, FinanceJournal } from "@/lib/finance-types";
import { financeNavItems } from "@/components/application/finance-nav";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

const STATUS_COLORS: Record<FinanceJournal["status"], string> = {
  draft: "yellow",
  posted: "green",
  voided: "gray",
};

export function FinanceDashboard({
  session,
  data,
}: {
  session: ChurchAppSession;
  data: FinanceDashboardData;
}) {
  const { totalIncomeCents, totalExpenseCents, netCents, budgetUtilizationPercent, recentJournals, incomeByAccount, expenseByAccount } = data;
  const isNetPositive = netCents >= 0;

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Finance"
      title="Financial Overview"
      description={session.appContext.church.name}
      sidebarTitle="Finance"
      sidebarDescription="Accounts, journals, budgets, and financial reports."
      navLabel="Finance"
      navItems={financeNavItems("/app/church-admin/finance/dashboard")}
    >
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Title order={3}>Financial Overview</Title>
          <Text size="sm" c="dimmed">{new Date().getFullYear()} Fiscal Year</Text>
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
          <Paper withBorder p="md" radius="md">
            <Group gap="xs" mb={4}>
              <TrendingUp size={16} />
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Total Income</Text>
            </Group>
            <Text size="xl" fw={700} c="green">{formatCents(totalIncomeCents)}</Text>
          </Paper>

          <Paper withBorder p="md" radius="md">
            <Group gap="xs" mb={4}>
              <DollarSign size={16} />
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Total Expenses</Text>
            </Group>
            <Text size="xl" fw={700} c="red">{formatCents(totalExpenseCents)}</Text>
          </Paper>

          <Paper withBorder p="md" radius="md">
            <Group gap="xs" mb={4}>
              <BarChart2 size={16} />
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Net</Text>
            </Group>
            <Text size="xl" fw={700} c={isNetPositive ? "green" : "red"}>{formatCents(netCents)}</Text>
          </Paper>

          <Paper withBorder p="md" radius="md">
            <Group gap="xs" mb={4}>
              <BookOpen size={16} />
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Budget Used</Text>
            </Group>
            {budgetUtilizationPercent !== null ? (
              <Group gap="sm" align="center">
                <RingProgress
                  size={56}
                  thickness={6}
                  sections={[{ value: Math.min(budgetUtilizationPercent, 100), color: budgetUtilizationPercent > 90 ? "red" : "blue" }]}
                />
                <Text size="xl" fw={700}>{budgetUtilizationPercent}%</Text>
              </Group>
            ) : (
              <Text size="sm" c="dimmed">No active budget</Text>
            )}
          </Paper>
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Paper withBorder p="md" radius="md">
            <Text fw={600} mb="sm">Income by Account</Text>
            {incomeByAccount.length === 0 ? (
              <Text size="sm" c="dimmed">No income entries yet</Text>
            ) : (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Account</Table.Th>
                    <Table.Th style={{ textAlign: "right" }}>Amount</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {incomeByAccount.map((row) => (
                    <Table.Tr key={row.accountName}>
                      <Table.Td>{row.accountName}</Table.Td>
                      <Table.Td style={{ textAlign: "right" }}>{formatCents(row.amountCents)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Paper>

          <Paper withBorder p="md" radius="md">
            <Text fw={600} mb="sm">Expenses by Account</Text>
            {expenseByAccount.length === 0 ? (
              <Text size="sm" c="dimmed">No expense entries yet</Text>
            ) : (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Account</Table.Th>
                    <Table.Th style={{ textAlign: "right" }}>Amount</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {expenseByAccount.map((row) => (
                    <Table.Tr key={row.accountName}>
                      <Table.Td>{row.accountName}</Table.Td>
                      <Table.Td style={{ textAlign: "right" }}>{formatCents(row.amountCents)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Paper>
        </SimpleGrid>

        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb="sm">
            <Text fw={600}>Recent Journal Entries</Text>
            <Link href="/app/church-admin/finance/journals" style={{ fontSize: 13 }}>View all</Link>
          </Group>
          {recentJournals.length === 0 ? (
            <Text size="sm" c="dimmed">No journal entries yet.</Text>
          ) : (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Description</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {recentJournals.map((j) => (
                  <Table.Tr key={j.id}>
                    <Table.Td>{formatDate(j.journalDate)}</Table.Td>
                    <Table.Td>
                      <Link href={`/app/church-admin/finance/journals/${j.id}`}>{j.description}</Link>
                    </Table.Td>
                    <Table.Td><Badge variant="light" size="sm">{j.journalType}</Badge></Table.Td>
                    <Table.Td><Badge color={STATUS_COLORS[j.status]} size="sm">{j.status}</Badge></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Paper>

        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
          {[
            { href: "/app/church-admin/finance/accounts", label: "Chart of Accounts", icon: Landmark },
            { href: "/app/church-admin/finance/journals/new", label: "New Journal Entry", icon: FileText },
            { href: "/app/church-admin/finance/budgets", label: "Budgets", icon: BookOpen },
            { href: "/app/church-admin/finance/import", label: "Import Data", icon: Upload },
          ].map(({ href, label, icon: Icon }) => (
            <Paper key={href} withBorder p="md" radius="md" component={Link} href={href}
              style={{ textDecoration: "none", cursor: "pointer" }}>
              <Group gap="xs">
                <Icon size={16} />
                <Text size="sm" fw={500}>{label}</Text>
              </Group>
            </Paper>
          ))}
        </SimpleGrid>
      </Stack>
    </ApplicationShell>
  );
}
