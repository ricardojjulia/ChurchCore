"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Upload, UsersRound } from "lucide-react";
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

import { runPeopleImportDryRunAction } from "@/app/app/church-admin/people/import/actions";
import { commitPeopleImportBatchAction } from "@/app/app/church-admin/people/import/actions";
import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import type { PeopleImportCommitResult, PeopleImportDryRunResult } from "@/lib/people-import-dry-run";
import type { ImportSourceSystem } from "@/lib/people-import-source-adapters";

export function ChurchAdminPeopleImportWorkspace({
  session,
}: {
  session: ChurchAppSession;
}) {
  const [isPending, startTransition] = useTransition();
  const [sourceFilename, setSourceFilename] = useState("people-households.csv");
  const [sourceSystem, setSourceSystem] = useState<ImportSourceSystem>("generic_csv");
  const [csvText, setCsvText] = useState(
    "household_name,full_name,email,phone,member_number\nRiver Family,Ada Lovelace,ada@example.com,555-0101,M-1001\nHarbor House,Grace Hopper,grace@example.com,555-0102,",
  );
  const [result, setResult] = useState<PeopleImportDryRunResult | null>(null);
  const [commitResult, setCommitResult] = useState<PeopleImportCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleRunDryRun() {
    setError(null);

    startTransition(async () => {
      try {
        const nextResult = await runPeopleImportDryRunAction({
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
        const nextCommitResult = await commitPeopleImportBatchAction({
          batchId: result.batchId,
        });
        setCommitResult(nextCommitResult);
      } catch (err) {
        setCommitResult(null);
        setError(err instanceof Error ? err.message : "Unable to commit import batch.");
      }
    });
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Church admin"
      title="People import dry run"
      description={session.appContext.church.name}
      sidebarTitle="People import"
      sidebarDescription="Dry-run people and household CSV imports without production writes."
      navLabel="Church admin"
      navItems={[
        {
          href: "/app/church-admin/people",
          label: "People",
          description: "Manage members and households",
          icon: UsersRound,
        },
        {
          href: "/app/church-admin/people/import",
          label: "Import",
          description: "Dry-run migration intake",
          icon: Upload,
          active: true,
        },
      ]}
      topActions={
        <Button component={Link} href="/app/church-admin/people" variant="default" size="xs">
          Back to people
        </Button>
      }
    >
      <Stack gap="md">
        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <Title order={4}>CSV Intake</Title>
            <Text size="sm" c="dimmed">
              Required columns: household_name, full_name. Optional: email, phone, member_number.
            </Text>
            <TextInput
              label="Source filename"
              value={sourceFilename}
              onChange={(event) => setSourceFilename(event.currentTarget.value)}
            />
            <Select
              label="Source system"
              value={sourceSystem}
              onChange={(value) => setSourceSystem((value ?? "generic_csv") as ImportSourceSystem)}
              data={[
                { value: "generic_csv", label: "Generic CSV" },
                { value: "planning_center", label: "Planning Center export" },
                { value: "breeze", label: "Breeze/Tithely export" },
                { value: "pushpay_ccb", label: "Pushpay/CCB export" },
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

        {result ? (
          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Group gap="xs">
                <Badge color="teal">create {result.counts.create}</Badge>
                <Badge color="blue">update {result.counts.update}</Badge>
                <Badge color="gray">skip {result.counts.skip}</Badge>
                <Badge color="red">reject {result.counts.reject}</Badge>
                <Badge color="violet">households +{result.householdCreates}</Badge>
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
                >
                  Commit batch
                </Button>
              </Group>
              {commitResult ? (
                <Alert
                  color={commitResult.status === "committed" ? "green" : "orange"}
                  title={commitResult.status === "committed" ? "Import committed" : "Import committed with failures"}
                >
                  Created {commitResult.created}, updated {commitResult.updated}, failed {commitResult.failed}.
                </Alert>
              ) : null}
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Row</Table.Th>
                    <Table.Th>Household</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Email</Table.Th>
                    <Table.Th>Action</Table.Th>
                    <Table.Th>Reason</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {result.rows.slice(0, 50).map((row) => (
                    <Table.Tr key={`${row.rowNumber}-${row.fullName}-${row.email ?? ""}`}>
                      <Table.Td>{row.rowNumber}</Table.Td>
                      <Table.Td>{row.householdName ?? "-"}</Table.Td>
                      <Table.Td>{row.fullName || "-"}</Table.Td>
                      <Table.Td>{row.email ?? "-"}</Table.Td>
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
            </Stack>
          </Paper>
        ) : null}
      </Stack>
    </ApplicationShell>
  );
}
