"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle, AlertTriangle, Upload, Users } from "lucide-react";
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

import { runGroupsImportDryRunAction } from "@/app/app/church-admin/groups/import/actions";
import { commitGroupsImportBatchAction } from "@/app/app/church-admin/groups/import/actions";
import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  GroupsImportCommitResult,
  GroupsImportDryRunResult,
} from "@/lib/groups-import-dry-run";
import type { GroupsImportSourceSystem } from "@/lib/groups-import-source-adapters";

export function ChurchAdminGroupsImportWorkspace({
  session,
}: {
  session: ChurchAppSession;
}) {
  const [isPending, startTransition] = useTransition();
  const [sourceFilename, setSourceFilename] = useState("groups.csv");
  const [sourceSystem, setSourceSystem] = useState<GroupsImportSourceSystem>("generic_csv");
  const [csvText, setCsvText] = useState(
    "source_id,name,category,leader_email,status\nGRP-1,Monday Bible Study,discipleship,pastor@example.com,active\nGRP-2,Youth Group,youth,,active",
  );
  const [result, setResult] = useState<GroupsImportDryRunResult | null>(null);
  const [commitResult, setCommitResult] = useState<GroupsImportCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleRunDryRun() {
    setError(null);

    startTransition(async () => {
      try {
        const nextResult = await runGroupsImportDryRunAction({
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
        const nextCommitResult = await commitGroupsImportBatchAction({
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
      title="Groups import dry run"
      description={session.appContext.church.name}
      sidebarTitle="Groups import"
      sidebarDescription="Dry-run groups CSV imports without production writes."
      navLabel="Church admin"
      navItems={[
        {
          href: "/app/church-admin/groups",
          label: "Groups",
          description: "Manage small groups",
          icon: Users,
        },
        {
          href: "/app/church-admin/groups/import",
          label: "Import",
          description: "Dry-run migration intake",
          icon: Upload,
          active: true,
        },
      ]}
      topActions={
        <Button component={Link} href="/app/church-admin/groups" variant="default" size="xs">
          Back to groups
        </Button>
      }
    >
      <Stack gap="md">
        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <Title order={4}>CSV Intake</Title>
            <Text size="sm" c="dimmed">
              Required columns: source_id, name. Optional: category, leader_email, status.
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
                setSourceSystem((value ?? "generic_csv") as GroupsImportSourceSystem)
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
                {counts.unmatchedLeaders > 0 ? (
                  <Badge color="orange">{counts.unmatchedLeaders} unmatched leader(s)</Badge>
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
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Category</Table.Th>
                      <Table.Th>Leader Email</Table.Th>
                      <Table.Th>Leader Matched</Table.Th>
                      <Table.Th>Action</Table.Th>
                      <Table.Th>Reason</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {result.rows.slice(0, 50).map((row) => (
                      <Table.Tr
                        key={`${row.rowNumber}-${row.sourceId}-${row.leaderEmail ?? ""}`}
                      >
                        <Table.Td>{row.rowNumber}</Table.Td>
                        <Table.Td>{row.sourceId || "-"}</Table.Td>
                        <Table.Td>{row.name || "-"}</Table.Td>
                        <Table.Td>{row.category ?? "-"}</Table.Td>
                        <Table.Td>{row.leaderEmail ?? "-"}</Table.Td>
                        <Table.Td>
                          {row.action === "create" || row.action === "update" ? (
                            row.leaderEmail == null ? null : row.leaderResolved ? (
                              <CheckCircle size={16} color="var(--mantine-color-green-6)" />
                            ) : (
                              <AlertTriangle size={16} color="var(--mantine-color-orange-6)" />
                            )
                          ) : null}
                        </Table.Td>
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
