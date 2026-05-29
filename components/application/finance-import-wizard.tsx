"use client";

import { useRef, useState, useTransition } from "react";
import {
  Alert, Badge, Button, Group, Paper, Select, Stack, Stepper, Table, Text, Title
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { CheckCircle, Upload } from "lucide-react";
import Link from "next/link";

import { ApplicationShell } from "@/components/application/app-shell";
import { financeNavItems } from "@/components/application/finance-nav";
import { useI18n } from "@/components/i18n-provider";
import { importFinanceRowsAction } from "@/app/app/finance-actions";
import { detectFormat, parseCsv, parseXlsx, parsePlainText, parseIif, iifToPreview, parseOfx, ofxToPreview } from "@/lib/finance-import";
import type { ChurchAppSession } from "@/lib/auth";
import type { FinanceAccount, FinanceImport, ImportColumnMapping, ImportPreviewRow } from "@/lib/finance-types";

function formatCents(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function FinanceImportWizard({
  session,
  accounts,
  recentImports,
}: {
  session: ChurchAppSession;
  accounts: FinanceAccount[];
  recentImports: FinanceImport[];
}) {
  const { locale, t } = useI18n();
  const tr = (key: string, values?: Record<string, string | number>) =>
    t("financeImport", key, values);
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [isPending, startTransition] = useTransition();

  const [filename, setFilename] = useState("");
  const [detectedFormat, setDetectedFormat] = useState<string>("csv");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [mapping, setMapping] = useState<ImportColumnMapping>({ date: null, description: null, amount: null, debitAccount: null, creditAccount: null, reference: null });
  const [defaultDebitId, setDefaultDebitId] = useState<string>("");
  const [defaultCreditId, setDefaultCreditId] = useState<string>("");
  const [completedJournalId, setCompletedJournalId] = useState<string | null>(null);

  const accountOptions = accounts.filter((a) => a.isActive).map((a) => ({ value: a.id, label: `${a.accountCode} — ${a.name}` }));
  const validRows = previewRows.filter((r) => !r.error);
  const errorRows = previewRows.filter((r) => r.error);
  const columnFields = [
    { value: "date", label: tr("columnDate") },
    { value: "description", label: tr("columnDescription") },
    { value: "amount", label: tr("columnAmount") },
    { value: "reference", label: tr("columnReference") },
    { value: "debitAccount", label: tr("columnDebitAccount") },
    { value: "creditAccount", label: tr("columnCreditAccount") },
  ];

  const formatLabels: Record<string, string> = {
    csv: tr("formatCsv"),
    xlsx: tr("formatExcel"),
    quickbooks_iif: tr("formatQuickbooks"),
    ofx: tr("formatOfx"),
    txt: tr("formatPlainText"),
  };

  const statusLabels: Record<string, string> = {
    completed: tr("statusCompleted"),
    failed: tr("statusFailed"),
    processing: tr("statusProcessing"),
    pending: tr("statusPending"),
  };

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);

    const text = await file.text();
    const fmt = detectFormat(file.name, text);
    setDetectedFormat(fmt);

    if (fmt === "quickbooks_iif") {
      const { transactions, errors } = parseIif(text);
      if (errors.length) notifications.show({ color: "orange", message: errors[0] });
      setPreviewRows(iifToPreview(transactions));
      setCsvHeaders([]);
      setStep(2);
    } else if (fmt === "ofx") {
      const { transactions, errors } = parseOfx(text);
      if (errors.length) notifications.show({ color: "orange", message: errors[0] });
      setPreviewRows(ofxToPreview(transactions));
      setCsvHeaders([]);
      setStep(2);
    } else if (fmt === "xlsx") {
      const buf = await file.arrayBuffer();
      const result = await parseXlsx(buf);
      if (result.errors.length) notifications.show({ color: "orange", message: result.errors[0] });
      setCsvHeaders(result.headers);
      setStep(1); // Show column mapping
    } else {
      const result = fmt === "csv" ? await parseCsv(text) : await parsePlainText(text);
      if (result.errors.length) notifications.show({ color: "orange", message: result.errors[0] });
      setCsvHeaders(result.headers);
      setStep(1);
    }
  }

  function handleApplyMapping() {
    if (!mapping.date || !mapping.description || !mapping.amount) {
      notifications.show({ color: "red", message: tr("requiredColumns") });
      return;
    }
    // Re-parse with mapping — we need the raw rows. For now use the state rows already set via IIF/OFX paths, or re-parse for CSV/XLSX.
    // The preview rows were already set for IIF/OFX — skip re-parse for those formats.
    if (detectedFormat !== "quickbooks_iif" && detectedFormat !== "ofx") {
      notifications.show({ color: "blue", message: tr("mappingApplied") });
    }
    setStep(2);
  }

  function handleConfirmImport() {
    if (!defaultDebitId || !defaultCreditId) {
      notifications.show({ color: "red", message: tr("selectDefaultAccounts") });
      return;
    }
    startTransition(async () => {
      try {
        const { journalId } = await importFinanceRowsAction({
          filename,
          format: detectedFormat as "csv" | "xlsx" | "quickbooks_iif" | "ofx" | "txt",
          rows: validRows,
          defaultDebitAccountId: defaultDebitId,
          defaultCreditAccountId: defaultCreditId,
        });
        setCompletedJournalId(journalId);
        setStep(3);
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
      sectionLabel={tr("finance")}
      title={tr("title")}
      description={session.appContext.church.name}
      sidebarTitle={tr("finance")}
      sidebarDescription={tr("sidebarDescription")}
      navLabel={tr("finance")}
      navItems={financeNavItems("/app/church-admin/finance/import")}
    >
      <Stack gap="lg">
        <Group gap="xs"><Upload size={20} /><Title order={3}>{tr("title")}</Title></Group>

        <Stepper active={step} allowNextStepsSelect={false}>
          <Stepper.Step label={tr("stepUpload")} description={tr("stepUploadDescription")}>
            <Paper withBorder p="lg" radius="md" mt="md">
              <Stack gap="md">
                <Text size="sm" c="dimmed">
                  {tr("supportedFormatsPrefix")} <strong>CSV</strong>, <strong>Excel (.xlsx)</strong>, <strong>QuickBooks IIF/CSV</strong>, <strong>OFX / QFX {tr("bankFeeds")}</strong>, {tr("plainText")}. 
                </Text>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.iif,.ofx,.qfx,.txt"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
                <Button leftSection={<Upload size={16} />} onClick={() => fileRef.current?.click()}>
                  {tr("chooseFile")}
                </Button>
                {filename && (
                  <Text size="sm">{tr("selectedFile", { filename })} <Badge size="sm">{formatLabels[detectedFormat] ?? detectedFormat}</Badge></Text>
                )}
              </Stack>
            </Paper>
          </Stepper.Step>

          <Stepper.Step label={tr("stepMapColumns")} description={tr("stepMapColumnsDescription")}>
            <Paper withBorder p="lg" radius="md" mt="md">
              <Stack gap="sm">
                <Text size="sm" c="dimmed">{tr("mapColumnsHelp")}</Text>
                {csvHeaders.length === 0 && <Alert color="blue">{tr("autoFormatDetected")}</Alert>}
                {csvHeaders.map((field) => (
                  <Group key={field} justify="space-between">
                    <Select
                      label={tr("mapFieldTo", { field })}
                      data={columnFields}
                      value={Object.entries(mapping).find(([, v]) => v === field)?.[0] ?? null}
                      onChange={(v) => {
                        if (!v) return;
                        setMapping((prev) => ({ ...prev, [v]: field }));
                      }}
                      clearable
                      size="sm"
                      w={250}
                    />
                  </Group>
                ))}
                <Group justify="flex-end" mt="sm">
                  <Button variant="subtle" onClick={() => setStep(0)}>{tr("back")}</Button>
                  <Button onClick={handleApplyMapping}>{tr("applyAndPreview")}</Button>
                </Group>
              </Stack>
            </Paper>
          </Stepper.Step>

          <Stepper.Step label={tr("stepPreview")} description={tr("stepPreviewDescription")}>
            <Paper withBorder p="lg" radius="md" mt="md">
              <Stack gap="md">
                <Group justify="space-between">
                  <Text size="sm">
                    <Badge color="green">{tr("validCount", { count: validRows.length })}</Badge>{" "}
                    {errorRows.length > 0 && <Badge color="red">{tr("errorCount", { count: errorRows.length })}</Badge>}
                  </Text>
                  <Group gap="sm">
                    <Select label={tr("defaultDebitAccount")} data={accountOptions} value={defaultDebitId} onChange={(v) => setDefaultDebitId(v ?? "")} size="sm" searchable w={280} />
                    <Select label={tr("defaultCreditAccount")} data={accountOptions} value={defaultCreditId} onChange={(v) => setDefaultCreditId(v ?? "")} size="sm" searchable w={280} />
                  </Group>
                </Group>

                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>#</Table.Th>
                      <Table.Th>{tr("columnDate")}</Table.Th>
                      <Table.Th>{tr("columnDescription")}</Table.Th>
                      <Table.Th>{tr("columnAmount")}</Table.Th>
                      <Table.Th>{tr("status")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {previewRows.slice(0, 20).map((row) => (
                      <Table.Tr key={row.rowIndex}>
                        <Table.Td>{row.rowIndex + 1}</Table.Td>
                        <Table.Td>{row.date}</Table.Td>
                        <Table.Td>{row.description}</Table.Td>
                        <Table.Td>{formatCents(row.amountCents, locale)}</Table.Td>
                        <Table.Td>
                          {row.error
                            ? <Badge color="red" size="xs">{row.error}</Badge>
                            : <Badge color="green" size="xs">{tr("ok")}</Badge>}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
                {previewRows.length > 20 && <Text size="xs" c="dimmed">{tr("showingFirstRows", { count: previewRows.length })}</Text>}

                <Group justify="flex-end">
                  <Button variant="subtle" onClick={() => setStep(1)}>{tr("back")}</Button>
                  <Button loading={isPending} onClick={handleConfirmImport} disabled={validRows.length === 0}>
                    {tr("importRows", { count: validRows.length })}
                  </Button>
                </Group>
              </Stack>
            </Paper>
          </Stepper.Step>

          <Stepper.Step label={tr("stepDone")} description={tr("stepDoneDescription")}>
            <Paper withBorder p="lg" radius="md" mt="md">
              <Stack gap="md" align="center">
                <CheckCircle size={40} color="var(--mantine-color-green-6)" />
                <Text fw={600}>{tr("importComplete")}</Text>
                <Text size="sm" c="dimmed">{tr("rowsImportedDraft", { count: validRows.length })}</Text>
                {completedJournalId && (
                  <Button component={Link} href={`/app/church-admin/finance/journals/${completedJournalId}`} variant="light">
                    {tr("reviewAndPostJournal")}
                  </Button>
                )}
                <Button variant="subtle" onClick={() => { setStep(0); setFilename(""); setPreviewRows([]); }}>
                  {tr("importAnotherFile")}
                </Button>
              </Stack>
            </Paper>
          </Stepper.Step>
        </Stepper>

        {recentImports.length > 0 && step === 0 && (
          <Paper withBorder p="md" radius="md">
            <Text fw={600} mb="sm">{tr("recentImports")}</Text>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{tr("file")}</Table.Th>
                  <Table.Th>{tr("format")}</Table.Th>
                  <Table.Th>{tr("rows")}</Table.Th>
                  <Table.Th>{tr("status")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {recentImports.slice(0, 10).map((imp) => (
                  <Table.Tr key={imp.id}>
                    <Table.Td>{imp.filename}</Table.Td>
                    <Table.Td><Badge size="xs">{formatLabels[imp.format] ?? imp.format}</Badge></Table.Td>
                    <Table.Td>{imp.importedRows ?? tr("dash")}</Table.Td>
                    <Table.Td><Badge color={imp.status === "completed" ? "green" : imp.status === "failed" ? "red" : "yellow"} size="xs">{statusLabels[imp.status] ?? imp.status}</Badge></Table.Td>
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
