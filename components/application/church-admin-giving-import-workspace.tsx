"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle, DollarSign, Upload } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";

import { commitGivingImportBatchAction } from "@/app/app/church-admin/giving/import/actions";
import { runGivingImportDryRunAction } from "@/app/app/church-admin/giving/import/actions";
import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  GivingImportCommitResult,
  GivingImportDryRunResult,
} from "@/lib/giving-import-dry-run";
import type { GivingImportSourceSystem } from "@/lib/giving-import-source-adapters";

export function ChurchAdminGivingImportWorkspace({
  session,
}: {
  session: ChurchAppSession;
}) {
  const [isPending, startTransition] = useTransition();
  const [sourceFilename, setSourceFilename] = useState("giving.csv");
  const [sourceSystem, setSourceSystem] = useState<GivingImportSourceSystem>("generic_csv");
  const [csvText, setCsvText] = useState(
    "source_id,donor_email,amount,fund,donated_at,note\nGIV-1,jane@example.com,25.00,General,2026-01-15T10:00:00Z,Weekly offering\nGIV-2,john@example.com,50.00,Building Fund,2026-01-15T10:00:00Z,",
  );
  const [result, setResult] = useState<GivingImportDryRunResult | null>(null);
  const [commitResult, setCommitResult] = useState<GivingImportCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleRunDryRun() {
    setError(null);

    startTransition(async () => {
      try {
        const nextResult = await runGivingImportDryRunAction({
          sourceFilename,
          sourceSystem,
          csvText,
        });
        setResult(nextResult);
        setCommitResult(null);
      } catch (err) {
        setResult(null);
        setError(err instanceof Error ? err.message : "Unable to run dry import.");
      }
    });
  }

  function handleCommitBatch() {
    if (!result?.batchId) {
      return;
    }

    setError(null);

    startTransition(async () => {
      try {
        const nextCommitResult = await commitGivingImportBatchAction({
          batchId: result.batchId,
        });
        setCommitResult(nextCommitResult);
      } catch (err) {
        setCommitResult(null);
        setError(err instanceof Error ? err.message : "Unable to commit import batch.");
      }
    });
  }

  const counts = result?.counts;

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Church admin"
      title="Giving import dry run"
      description={session.appContext.church.name}
      sidebarTitle="Giving import"
      sidebarDescription="Dry-run giving CSV imports without production writes."
      navLabel="Church admin"
      navItems={[
        {
          href: "/app/church-admin/giving",
          label: "Giving",
          description: "Manage giving records",
          icon: DollarSign,
        },
        {
          href: "/app/church-admin/giving/import",
          label: "Import",
          description: "Dry-run giving migration",
          icon: Upload,
          active: true,
        },
      ]}
      topActions={
        <Button component={Link} href="/app/church-admin/giving" variant="default" size="xs">
          Back to giving
        </Button>
      }
    >
      <Stack gap="md">
        <Alert color="orange" title="GL Reconciliation Notice">
          Imported gifts will not post to GL automatically. Use Finance &gt; Fund Mappings to
          reconcile after import.
        </Alert>

        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <Title order={4}>CSV Intake</Title>
            <Text size="sm" c="dimmed">
              Required columns: source_id, amount. Optional: donor_email, fund, donated_at, note,
              recurring.
            </Text>
            <TextInput
              label="Source filename"
              value={sourceFilename}
              onChange={(event) => setSourceFilename(event.currentTarget.value)}
            />
            <Select
              label="Source system"
              value={sourceSystem}
              onChange={(value) =>
                setSourceSystem((value ?? "generic_csv") as GivingImportSourceSystem)
              }
              data={[
                { value: "generic_csv", label: "Generic CSV" },
                { value: "planning_center", label: "Planning Center export" },
                { value: "breeze", label: "Breeze export" },
              ]}
            />
            <Textarea
              label="CSV content"
              value={csvText}
              onChange={(event) => setCsvText(event.currentTarget.value)}
              minRows={10}
              autosize
            />
            <Group justify="flex-end">
              <Button onClick={handleRunDryRun} loading={isPending}>
                Run dry import
              </Button>
            </Group>
          </Stack>
        </Paper>

        {error ? (
          <Alert color="red" title="Dry run failed">
            {error}
          </Alert>
        ) : null}

        {result && counts ? (
          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Group gap="xs">
                <Badge color="teal">create {counts.create}</Badge>
                <Badge color="blue">update {counts.update}</Badge>
                <Badge color="gray">skip {counts.skip}</Badge>
                <Badge color="red">reject {counts.reject}</Badge>
                {counts.unmatchedDonors > 0 ? (
                  <Badge color="orange">{counts.unmatchedDonors} unmatched donors</Badge>
                ) : null}
              </Group>
              <Text size="sm" c="dimmed">
                Dry run batch {result.batchId} captured in import staging tables.
              </Text>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Commit will only apply rows marked create/update.
                </Text>
                <Button
                  size="xs"
                  color="teal"
                  variant="light"
                  onClick={handleCommitBatch}
                  loading={isPending}
                  disabled={!result || counts.create + counts.update === 0 || isPending}
                >
                  Commit batch
                </Button>
              </Group>
              {commitResult ? (
                <Alert
                  color={commitResult.status === "committed" ? "green" : "orange"}
                  title={
                    commitResult.status === "committed"
                      ? "Import committed"
                      : "Import committed with failures"
                  }
                >
                  Created {commitResult.created}, updated {commitResult.updated}, failed{" "}
                  {commitResult.failed}.
                </Alert>
              ) : null}
              <div style={{ overflowX: "auto" }}>
                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Row</Table.Th>
                      <Table.Th>Source ID</Table.Th>
                      <Table.Th>Donor Email</Table.Th>
                      <Table.Th>Donor ✓/✗</Table.Th>
                      <Table.Th>Amount</Table.Th>
                      <Table.Th>Fund</Table.Th>
                      <Table.Th>Date</Table.Th>
                      <Table.Th>Action</Table.Th>
                      <Table.Th>Reason</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {result.rows.slice(0, 50).map((row) => (
                      <Table.Tr
                        key={`${row.rowNumber}-${row.sourceId}-${row.donorEmail ?? ""}`}
                      >
                        <Table.Td>{row.rowNumber}</Table.Td>
                        <Table.Td>{row.sourceId || "-"}</Table.Td>
                        <Table.Td>{row.donorEmail ?? "-"}</Table.Td>
                        <Table.Td>
                          {row.action === "create" || row.action === "update" ? (
                            row.donorResolved === true ? (
                              <CheckCircle size={16} color="var(--mantine-color-green-6)" />
                            ) : row.donorResolved === false && row.donorEmail != null ? (
                              <AlertTriangle size={16} color="var(--mantine-color-orange-6)" />
                            ) : null
                          ) : null}
                        </Table.Td>
                        <Table.Td>{row.amountDollars ?? "-"}</Table.Td>
                        <Table.Td>{row.fundDesignation ?? "-"}</Table.Td>
                        <Table.Td>{row.donatedAt ?? "-"}</Table.Td>
                        <Table.Td>
                          <Badge
                            color={
                              row.action === "create"
                                ? "teal"
                                : row.action === "update"
                                  ? "blue"
                                  : row.action === "skip"
                                    ? "gray"
                                    : "red"
                            }
                          >
                            {row.action}
                          </Badge>
                        </Table.Td>
                        <Table.Td>{row.reason ?? "-"}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            </Stack>
          </Paper>
        ) : null}
      </Stack>
    </ApplicationShell>
  );
}
