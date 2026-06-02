"use client";

import { useState, useTransition } from "react";
import {
  Badge, Button, Group, Modal, Paper, Select, Stack, Table, Text, TextInput, Textarea, Title
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Landmark, Plus } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { financeNavItems } from "@/components/application/finance-nav";
import { useI18n } from "@/components/i18n-provider";
import { createAccountAction } from "@/app/app/finance-actions";
import type { ChurchAppSession } from "@/lib/auth";
import type { FinanceAccount } from "@/lib/finance-types";

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  asset: "blue",
  liability: "orange",
  equity: "violet",
  income: "green",
  expense: "red",
};

const TYPE_ORDER = ["asset", "liability", "equity", "income", "expense"];

export function FinanceAccountsWorkspace({
  session,
  accounts,
  selectedAccountId,
}: {
  session: ChurchAppSession;
  accounts: FinanceAccount[];
  selectedAccountId?: string | null;
}) {
  const { t } = useI18n();
  const [opened, { open, close }] = useDisclosure(false);
  const [isPending, startTransition] = useTransition();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [accountType, setAccountType] = useState<string>("expense");
  const [parentId, setParentId] = useState<string | null>(null);

  // Build type options inside component so t() is available
  const ACCOUNT_TYPE_OPTIONS = [
    { value: "asset", label: t("financeAccounts", "typeAsset") },
    { value: "liability", label: t("financeAccounts", "typeLiability") },
    { value: "equity", label: t("financeAccounts", "typeEquity") },
    { value: "income", label: t("financeAccounts", "typeIncome") },
    { value: "expense", label: t("financeAccounts", "typeExpense") },
  ];

  const grouped = TYPE_ORDER.reduce<Record<string, FinanceAccount[]>>((acc, type) => {
    acc[type] = accounts.filter((a) => a.accountType === type).sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    return acc;
  }, {});

  const parentOptions = accounts
    .filter((a) => a.accountType === accountType)
    .map((a) => ({ value: a.id, label: `${a.accountCode} — ${a.name}` }));

  function handleCreate() {
    if (!code.trim() || !name.trim()) {
      notifications.show({ color: "red", message: t("financeAccounts", "codeAndNameRequired") });
      return;
    }
    startTransition(async () => {
      try {
        await createAccountAction({ accountCode: code.trim(), name: name.trim(), description: description || null, accountType: accountType as FinanceAccount["accountType"], parentId });
        notifications.show({ color: "green", message: t("financeAccounts", "accountCreated") });
        setCode(""); setName(""); setDescription(""); setParentId(null);
        close();
      } catch (err) {
        notifications.show({ color: "red", message: String(err) });
      }
    });
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel={t("financeAccounts", "sectionLabel")}
      title={t("financeAccounts", "pageTitle")}
      description={session.appContext.church.name}
      sidebarTitle={t("financeAccounts", "sidebarTitle")}
      sidebarDescription={t("financeAccounts", "sidebarDescription")}
      navLabel="Finance"
      navItems={financeNavItems("/app/church-admin/finance/accounts")}
    >
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Landmark size={20} />
            <Title order={3}>{t("financeAccounts", "pageTitle")}</Title>
          </Group>
          <Button leftSection={<Plus size={16} />} onClick={open} size="sm">
            {t("financeAccounts", "addAccount")}
          </Button>
        </Group>

        {accounts.length === 0 && (
          <Paper withBorder p="xl" radius="md" ta="center">
            <Text c="dimmed">{t("financeAccounts", "noAccountsYet")}</Text>
          </Paper>
        )}

        {TYPE_ORDER.filter((type) => grouped[type].length > 0).map((type) => (
          <Paper key={type} withBorder p="md" radius="md">
            <Group gap="xs" mb="sm">
              <Badge color={ACCOUNT_TYPE_COLORS[type]} size="sm" tt="capitalize">
                {ACCOUNT_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type}
              </Badge>
              <Text size="sm" c="dimmed">({grouped[type].length})</Text>
            </Group>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("financeAccounts", "thCode")}</Table.Th>
                  <Table.Th>{t("financeAccounts", "thName")}</Table.Th>
                  <Table.Th>{t("financeAccounts", "thDescription")}</Table.Th>
                  <Table.Th>{t("financeAccounts", "thStatus")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {grouped[type].map((acct) => (
                  <Table.Tr key={acct.id} style={selectedAccountId === acct.id ? { background: "var(--mantine-color-blue-0)" } : undefined}>
                    <Table.Td><Text size="sm" ff="monospace">{acct.accountCode}</Text></Table.Td>
                    <Table.Td>{acct.name}</Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{acct.description ?? "—"}</Text></Table.Td>
                    <Table.Td>
                      <Badge color={acct.isActive ? "green" : "gray"} size="xs">
                        {acct.isActive ? t("financeAccounts", "statusActive") : t("financeAccounts", "statusInactive")}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        ))}
      </Stack>

      <Modal opened={opened} onClose={close} title={t("financeAccounts", "modalTitle")} size="md">
        <Stack gap="sm">
          <TextInput
            label={t("financeAccounts", "accountCodeLabel")}
            placeholder={t("financeAccounts", "accountCodePlaceholder")}
            value={code}
            onChange={(e) => setCode(e.currentTarget.value)}
            required
          />
          <TextInput
            label={t("financeAccounts", "nameLabel")}
            placeholder={t("financeAccounts", "namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
          />
          <Select
            label={t("financeAccounts", "typeLabel")}
            data={ACCOUNT_TYPE_OPTIONS}
            value={accountType}
            onChange={(v) => { setAccountType(v ?? "expense"); setParentId(null); }}
          />
          {parentOptions.length > 0 && (
            <Select
              label={t("financeAccounts", "parentAccountLabel")}
              data={parentOptions}
              value={parentId}
              onChange={setParentId}
              clearable
            />
          )}
          <Textarea
            label={t("financeAccounts", "descriptionLabel")}
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            rows={2}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" onClick={close}>{t("financeAccounts", "cancel")}</Button>
            <Button loading={isPending} onClick={handleCreate}>{t("financeAccounts", "create")}</Button>
          </Group>
        </Stack>
      </Modal>
    </ApplicationShell>
  );
}
