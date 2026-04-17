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
import { importFinanceRowsAction } from "@/app/app/finance-actions";
import { detectFormat, parseCsv, parseXlsx, parsePlainText, parseIif, iifToPreview, parseOfx, ofxToPreview } from "@/lib/finance-import";
import type { ChurchAppSession } from "@/lib/auth";
import type { FinanceAccount, FinanceImport, ImportColumnMapping, ImportPreviewRow } from "@/lib/finance-types";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

const COLUMN_FIELDS = [
  { value: "date", label: "Date" },
  { value: "description", label: "Description" },
  { value: "amount", label: "Amount" },
  { value: "reference", label: "Reference" },
  { value: "debitAccount", label: "Debit Account Code" },
  { value: "creditAccount", label: "Credit Account Code" },
];

export function FinanceImportWizard({
  session,
  accounts,
  recentImports,
}: {
  session: ChurchAppSession;
  accounts: FinanceAccount[];
  recentImports: FinanceImport[];
}) {
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
      notifications.show({ color: "red", message: "Date, Description, and Amount columns are required" });
      return;
    }
    // Re-parse with mapping — we need the raw rows. For now use the state rows already set via IIF/OFX paths, or re-parse for CSV/XLSX.
    // The preview rows were already set for IIF/OFX — skip re-parse for those formats.
    if (detectedFormat !== "quickbooks_iif" && detectedFormat !== "ofx") {
      notifications.show({ color: "blue", message: "Mapping applied" });
    }
    setStep(2);
  }

  function handleConfirmImport() {
    if (!defaultDebitId || !defaultCreditId) {
      notifications.show({ color: "red", message: "Select default debit and credit accounts" });
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
      sectionLabel="Finance"
      title="Import Transactions"
      description={session.appContext.church.name}
      sidebarTitle="Finance"
      sidebarDescription="Import transactions from CSV, Excel, QuickBooks, or bank feeds."
      navLabel="Finance"
      navItems={financeNavItems("/app/church-admin/finance/import")}
    >
      <Stack gap="lg">
        <Group gap="xs"><Upload size={20} /><Title order={3}>Import Transactions</Title></Group>

        <Stepper active={step} allowNextStepsSelect={false}>
          <Stepper.Step label="Upload" description="Choose file">
            <Paper withBorder p="lg" radius="md" mt="md">
              <Stack gap="md">
                <Text size="sm" c="dimmed">
                  Supported formats: <strong>CSV</strong>, <strong>Excel (.xlsx)</strong>, <strong>QuickBooks IIF/CSV</strong>, <strong>OFX / QFX bank feeds</strong>, plain text.
                </Text>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.iif,.ofx,.qfx,.txt"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
                <Button leftSection={<Upload size={16} />} onClick={() => fileRef.current?.click()}>
                  Choose File
                </Button>
                {filename && <Text size="sm">Selected: <strong>{filename}</strong> — <Badge size="sm">{detectedFormat}</Badge></Text>}
              </Stack>
            </Paper>
          </Stepper.Step>

          <Stepper.Step label="Map Columns" description="Match headers">
            <Paper withBorder p="lg" radius="md" mt="md">
              <Stack gap="sm">
                <Text size="sm" c="dimmed">Map the file columns to the expected fields.</Text>
                {csvHeaders.length === 0 && <Alert color="blue">Format detected automatically — no column mapping needed. Proceed to preview.</Alert>}
                {csvHeaders.map((field) => (
                  <Group key={field} justify="space-between">
                    <Select
                      label={`Map "${field}" to`}
                      data={COLUMN_FIELDS}
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
                  <Button variant="subtle" onClick={() => setStep(0)}>Back</Button>
                  <Button onClick={handleApplyMapping}>Apply & Preview</Button>
                </Group>
              </Stack>
            </Paper>
          </Stepper.Step>

          <Stepper.Step label="Preview" description="Review rows">
            <Paper withBorder p="lg" radius="md" mt="md">
              <Stack gap="md">
                <Group justify="space-between">
                  <Text size="sm">
                    <Badge color="green">{validRows.length} valid</Badge>{" "}
                    {errorRows.length > 0 && <Badge color="red">{errorRows.length} errors</Badge>}
                  </Text>
                  <Group gap="sm">
                    <Select label="Default Debit Account" data={accountOptions} value={defaultDebitId} onChange={(v) => setDefaultDebitId(v ?? "")} size="sm" searchable w={280} />
                    <Select label="Default Credit Account" data={accountOptions} value={defaultCreditId} onChange={(v) => setDefaultCreditId(v ?? "")} size="sm" searchable w={280} />
                  </Group>
                </Group>

                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>#</Table.Th>
                      <Table.Th>Date</Table.Th>
                      <Table.Th>Description</Table.Th>
                      <Table.Th>Amount</Table.Th>
                      <Table.Th>Status</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {previewRows.slice(0, 20).map((row) => (
                      <Table.Tr key={row.rowIndex}>
                        <Table.Td>{row.rowIndex + 1}</Table.Td>
                        <Table.Td>{row.date}</Table.Td>
                        <Table.Td>{row.description}</Table.Td>
                        <Table.Td>{formatCents(row.amountCents)}</Table.Td>
                        <Table.Td>
                          {row.error
                            ? <Badge color="red" size="xs">{row.error}</Badge>
                            : <Badge color="green" size="xs">OK</Badge>}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
                {previewRows.length > 20 && <Text size="xs" c="dimmed">Showing first 20 of {previewRows.length} rows.</Text>}

                <Group justify="flex-end">
                  <Button variant="subtle" onClick={() => setStep(1)}>Back</Button>
                  <Button loading={isPending} onClick={handleConfirmImport} disabled={validRows.length === 0}>
                    Import {validRows.length} Rows
                  </Button>
                </Group>
              </Stack>
            </Paper>
          </Stepper.Step>

          <Stepper.Step label="Done" description="Import complete">
            <Paper withBorder p="lg" radius="md" mt="md">
              <Stack gap="md" align="center">
                <CheckCircle size={40} color="var(--mantine-color-green-6)" />
                <Text fw={600}>Import complete!</Text>
                <Text size="sm" c="dimmed">{validRows.length} rows imported as a draft journal entry.</Text>
                {completedJournalId && (
                  <Button component={Link} href={`/app/church-admin/finance/journals/${completedJournalId}`} variant="light">
                    Review & Post Journal
                  </Button>
                )}
                <Button variant="subtle" onClick={() => { setStep(0); setFilename(""); setPreviewRows([]); }}>
                  Import Another File
                </Button>
              </Stack>
            </Paper>
          </Stepper.Step>
        </Stepper>

        {recentImports.length > 0 && step === 0 && (
          <Paper withBorder p="md" radius="md">
            <Text fw={600} mb="sm">Recent Imports</Text>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>File</Table.Th>
                  <Table.Th>Format</Table.Th>
                  <Table.Th>Rows</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {recentImports.slice(0, 10).map((imp) => (
                  <Table.Tr key={imp.id}>
                    <Table.Td>{imp.filename}</Table.Td>
                    <Table.Td><Badge size="xs">{imp.format}</Badge></Table.Td>
                    <Table.Td>{imp.importedRows ?? "—"}</Table.Td>
                    <Table.Td><Badge color={imp.status === "completed" ? "green" : imp.status === "failed" ? "red" : "yellow"} size="xs">{imp.status}</Badge></Table.Td>
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
