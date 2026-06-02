"use client";

import { useState, useTransition } from "react";
import {
  Badge, Button, Group, Modal, NumberInput, Paper, Select, Stack, Table, Text, TextInput, Title
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { BookOpen, Plus } from "lucide-react";
import Link from "next/link";

import { ApplicationShell } from "@/components/application/app-shell";
import { financeNavItems } from "@/components/application/finance-nav";
import { useI18n } from "@/components/i18n-provider";
import { createBudgetAction, upsertBudgetLinesAction } from "@/app/app/finance-actions";
import type { ChurchAppSession } from "@/lib/auth";
import type { FinanceAccount, FinanceBudget, FinanceBudgetLine, BudgetVarianceRow } from "@/lib/finance-types";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export function FinanceBudgetWorkspace({
  session,
  budgets,
  selectedBudgetId,
  budgetLines,
  varianceRows,
  accounts,
}: {
  session: ChurchAppSession;
  budgets: FinanceBudget[];
  selectedBudgetId?: string;
  budgetLines: FinanceBudgetLine[];
  varianceRows: BudgetVarianceRow[];
  accounts: FinanceAccount[];
}) {
  const { t } = useI18n();
  const [opened, { open, close }] = useDisclosure(false);
  const [isPending, startTransition] = useTransition();

  const [budgetName, setBudgetName] = useState("");
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));

  // Budget line editing
  const [editedLines, setEditedLines] = useState<Record<string, number>>(
    Object.fromEntries(budgetLines.map((l) => [l.accountId, l.amountCents]))
  );

  const selectedBudget = budgets.find((b) => b.id === selectedBudgetId) ?? null;
  const expenseAccounts = accounts.filter((a) => a.accountType === "expense" && a.isActive);
  const incomeAccounts = accounts.filter((a) => a.accountType === "income" && a.isActive);

  function handleCreateBudget() {
    if (!budgetName.trim()) {
      notifications.show({ color: "red", message: t("financeBudget", "nameRequired") });
      return;
    }
    startTransition(async () => {
      try {
        const { id } = await createBudgetAction({ name: budgetName.trim(), fiscalYear: parseInt(fiscalYear) });
        notifications.show({ color: "green", message: t("financeBudget", "budgetCreated") });
        setBudgetName("");
        close();
        window.location.href = `/app/church-admin/finance/budgets/${id}`;
      } catch (err) {
        notifications.show({ color: "red", message: String(err) });
      }
    });
  }

  function handleSaveLines() {
    if (!selectedBudgetId) return;
    startTransition(async () => {
      try {
        await upsertBudgetLinesAction(selectedBudgetId, Object.entries(editedLines).map(([accountId, amountCents]) => ({ accountId, amountCents })));
        notifications.show({ color: "green", message: t("financeBudget", "linesSaved") });
      } catch (err) {
        notifications.show({ color: "red", message: String(err) });
      }
    });
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const y = String(new Date().getFullYear() + i - 1);
    return { value: y, label: y };
  });

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel={t("financeBudget", "sectionLabel")}
      title={t("financeBudget", "pageTitle")}
      description={session.appContext.church.name}
      sidebarTitle={t("financeBudget", "sidebarTitle")}
      sidebarDescription={t("financeBudget", "sidebarDescription")}
      navLabel="Finance"
      navItems={financeNavItems("/app/church-admin/finance/budgets")}
    >
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <BookOpen size={20} />
            <Title order={3}>{t("financeBudget", "pageTitle")}</Title>
          </Group>
          <Button leftSection={<Plus size={16} />} onClick={open} size="sm">
            {t("financeBudget", "newBudget")}
          </Button>
        </Group>

        {!selectedBudget && (
          <>
            {budgets.length === 0 ? (
              <Paper withBorder p="xl" radius="md" ta="center">
                <Text c="dimmed">{t("financeBudget", "noBudgetsYet")}</Text>
              </Paper>
            ) : (
              <Paper withBorder p="md" radius="md">
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("financeBudget", "thName")}</Table.Th>
                      <Table.Th>{t("financeBudget", "thFiscalYear")}</Table.Th>
                      <Table.Th>{t("financeBudget", "thStatus")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {budgets.map((b) => (
                      <Table.Tr key={b.id}>
                        <Table.Td><Link href={`/app/church-admin/finance/budgets/${b.id}`}>{b.name}</Link></Table.Td>
                        <Table.Td>{b.fiscalYear}</Table.Td>
                        <Table.Td>
                          <Badge color={b.isActive ? "green" : "gray"} size="sm">
                            {b.isActive ? t("financeBudget", "statusActive") : t("financeBudget", "statusInactive")}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Paper>
            )}
          </>
        )}

        {selectedBudget && (
          <Stack gap="md">
            <Group gap="xs">
              <Text c="dimmed" size="sm"><Link href="/app/church-admin/finance/budgets">{t("financeBudget", "pageTitle")}</Link> /</Text>
              <Text size="sm" fw={600}>{selectedBudget.name}</Text>
              <Badge size="sm">{selectedBudget.fiscalYear}</Badge>
            </Group>

            {varianceRows.length > 0 ? (
              <Paper withBorder p="md" radius="md">
                <Text fw={600} mb="sm">{t("financeBudget", "actualsHeading")}</Text>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("financeBudget", "thCode")}</Table.Th>
                      <Table.Th>{t("financeBudget", "thAccount")}</Table.Th>
                      <Table.Th>{t("financeBudget", "thType")}</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>{t("financeBudget", "thBudgeted")}</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>{t("financeBudget", "thActual")}</Table.Th>
                      <Table.Th style={{ textAlign: "right" }}>{t("financeBudget", "thVariance")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {varianceRows.map((row) => (
                      <Table.Tr key={row.accountId}>
                        <Table.Td><Text size="sm" ff="monospace">{row.accountCode}</Text></Table.Td>
                        <Table.Td>{row.accountName}</Table.Td>
                        <Table.Td><Badge size="xs" tt="capitalize">{row.accountType}</Badge></Table.Td>
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
            ) : (
              <Paper withBorder p="md" radius="md">
                <Text fw={600} mb="sm">{t("financeBudget", "setBudgetLinesHeading")}</Text>
                <Stack gap="xs">
                  {[...incomeAccounts, ...expenseAccounts].map((acct) => (
                    <Group key={acct.id} justify="space-between">
                      <Text size="sm">{acct.accountCode} — {acct.name} <Badge size="xs" tt="capitalize" variant="light">{acct.accountType}</Badge></Text>
                      <NumberInput
                        value={(editedLines[acct.id] ?? 0) / 100}
                        onChange={(v) => setEditedLines((prev) => ({ ...prev, [acct.id]: Math.round((Number(v) || 0) * 100) }))}
                        prefix="$" decimalScale={0} min={0} size="xs" w={140}
                      />
                    </Group>
                  ))}
                </Stack>
                <Group justify="flex-end" mt="md">
                  <Button loading={isPending} onClick={handleSaveLines}>
                    {t("financeBudget", "saveBudgetLines")}
                  </Button>
                </Group>
              </Paper>
            )}
          </Stack>
        )}
      </Stack>

      <Modal opened={opened} onClose={close} title={t("financeBudget", "modalTitle")}>
        <Stack gap="sm">
          <TextInput
            label={t("financeBudget", "nameLabel")}
            placeholder={t("financeBudget", "namePlaceholder")}
            value={budgetName}
            onChange={(e) => setBudgetName(e.currentTarget.value)}
            required
          />
          <Select
            label={t("financeBudget", "fiscalYearLabel")}
            data={yearOptions}
            value={fiscalYear}
            onChange={(v) => setFiscalYear(v ?? fiscalYear)}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" onClick={close}>{t("financeBudget", "cancel")}</Button>
            <Button loading={isPending} onClick={handleCreateBudget}>{t("financeBudget", "create")}</Button>
          </Group>
        </Stack>
      </Modal>
    </ApplicationShell>
  );
}
