"use client";

import { Paper, Stack, Table, Tabs, Text, Title, Group } from "@mantine/core";
import { BarChart2 } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { financeNavItems } from "@/components/application/finance-nav";
import type { ChurchAppSession } from "@/lib/auth";
import type { BalanceSheetData, BudgetVarianceRow, IncomeStatementData } from "@/lib/finance-types";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export function FinanceReportsWorkspace({
  session,
  incomeStatement,
  balanceSheet,
  varianceRows,
  activeBudgetName,
}: {
  session: ChurchAppSession;
  incomeStatement: IncomeStatementData;
  balanceSheet: BalanceSheetData;
  varianceRows: BudgetVarianceRow[];
  activeBudgetName: string | null;
}) {
  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Finance"
      title="Financial Reports"
      description={session.appContext.church.name}
      sidebarTitle="Finance"
      sidebarDescription="Income statement, balance sheet, and budget variance."
      navLabel="Finance"
      navItems={financeNavItems("/app/church-admin/finance/reports")}
    >
      <Stack gap="lg">
        <Group gap="xs"><BarChart2 size={20} /><Title order={3}>Financial Reports</Title></Group>

        <Tabs defaultValue="income">
          <Tabs.List>
            <Tabs.Tab value="income">Income Statement</Tabs.Tab>
            <Tabs.Tab value="balance">Balance Sheet</Tabs.Tab>
            {varianceRows.length > 0 && <Tabs.Tab value="variance">Budget Variance</Tabs.Tab>}
          </Tabs.List>

          <Tabs.Panel value="income" pt="md">
            <Paper withBorder p="md" radius="md">
              <Text fw={700} mb="sm">Income Statement — {incomeStatement.fiscalYear}</Text>

              <Text size="sm" fw={600} mb="xs" c="green">Income</Text>
              {incomeStatement.incomeRows.length === 0 ? (
                <Text size="sm" c="dimmed" mb="md">No income entries posted yet.</Text>
              ) : (
                <Table mb="md">
                  <Table.Tbody>
                    {incomeStatement.incomeRows.map((r) => (
                      <Table.Tr key={r.accountCode}>
                        <Table.Td><Text size="sm" ff="monospace" c="dimmed">{r.accountCode}</Text></Table.Td>
                        <Table.Td>{r.accountName}</Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>{formatCents(r.amountCents)}</Table.Td>
                      </Table.Tr>
                    ))}
                    <Table.Tr>
                      <Table.Td colSpan={2}><Text fw={700} size="sm">Total Income</Text></Table.Td>
                      <Table.Td style={{ textAlign: "right" }}><Text fw={700}>{formatCents(incomeStatement.totalIncomeCents)}</Text></Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>
              )}

              <Text size="sm" fw={600} mb="xs" c="red">Expenses</Text>
              {incomeStatement.expenseRows.length === 0 ? (
                <Text size="sm" c="dimmed" mb="md">No expense entries posted yet.</Text>
              ) : (
                <Table mb="md">
                  <Table.Tbody>
                    {incomeStatement.expenseRows.map((r) => (
                      <Table.Tr key={r.accountCode}>
                        <Table.Td><Text size="sm" ff="monospace" c="dimmed">{r.accountCode}</Text></Table.Td>
                        <Table.Td>{r.accountName}</Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>{formatCents(r.amountCents)}</Table.Td>
                      </Table.Tr>
                    ))}
                    <Table.Tr>
                      <Table.Td colSpan={2}><Text fw={700} size="sm">Total Expenses</Text></Table.Td>
                      <Table.Td style={{ textAlign: "right" }}><Text fw={700}>{formatCents(incomeStatement.totalExpenseCents)}</Text></Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>
              )}

              <Table>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Td colSpan={2}><Text fw={700}>Net Income / (Loss)</Text></Table.Td>
                    <Table.Td style={{ textAlign: "right" }}>
                      <Text fw={700} c={incomeStatement.netCents >= 0 ? "green" : "red"}>{formatCents(incomeStatement.netCents)}</Text>
                    </Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              </Table>
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="balance" pt="md">
            <Paper withBorder p="md" radius="md">
              <Text fw={700} mb="sm">Balance Sheet — As of {new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(balanceSheet.asOfDate))}</Text>

              {[
                { label: "Assets", rows: balanceSheet.assetRows, total: balanceSheet.totalAssetsCents, color: "blue" as const },
                { label: "Liabilities", rows: balanceSheet.liabilityRows, total: balanceSheet.totalLiabilitiesCents, color: "orange" as const },
                { label: "Equity", rows: balanceSheet.equityRows, total: balanceSheet.totalEquityCents, color: "violet" as const },
              ].map(({ label, rows, total, color }) => (
                <Stack key={label} gap="xs" mb="md">
                  <Text size="sm" fw={600} c={color}>{label}</Text>
                  {rows.length === 0 ? (
                    <Text size="sm" c="dimmed">No entries.</Text>
                  ) : (
                    <Table>
                      <Table.Tbody>
                        {rows.map((r) => (
                          <Table.Tr key={r.accountCode}>
                            <Table.Td><Text size="sm" ff="monospace" c="dimmed">{r.accountCode}</Text></Table.Td>
                            <Table.Td>{r.accountName}</Table.Td>
                            <Table.Td style={{ textAlign: "right" }}>{formatCents(r.balanceCents)}</Table.Td>
                          </Table.Tr>
                        ))}
                        <Table.Tr>
                          <Table.Td colSpan={2}><Text fw={700} size="sm">Total {label}</Text></Table.Td>
                          <Table.Td style={{ textAlign: "right" }}><Text fw={700}>{formatCents(total)}</Text></Table.Td>
                        </Table.Tr>
                      </Table.Tbody>
                    </Table>
                  )}
                </Stack>
              ))}
            </Paper>
          </Tabs.Panel>

          {varianceRows.length > 0 && (
            <Tabs.Panel value="variance" pt="md">
              <Paper withBorder p="md" radius="md">
                <Text fw={700} mb="sm">Budget Variance{activeBudgetName ? ` — ${activeBudgetName}` : ""}</Text>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Code</Table.Th>
                      <Table.Th>Account</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>Budgeted</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>Actual</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>Variance</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {varianceRows.map((row) => (
                      <Table.Tr key={row.accountId}>
                        <Table.Td><Text size="sm" ff="monospace">{row.accountCode}</Text></Table.Td>
                        <Table.Td>{row.accountName}</Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>{formatCents(row.budgetedCents)}</Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>{formatCents(row.actualCents)}</Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text size="sm" c={row.varianceCents <= 0 ? "green" : "red"}>{formatCents(row.varianceCents)}</Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Paper>
            </Tabs.Panel>
          )}
        </Tabs>
      </Stack>
    </ApplicationShell>
  );
}
