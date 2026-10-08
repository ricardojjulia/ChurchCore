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
import {
  IMPORT_FILE_HINT,
  CommitFailureReasons,
  RecentImports,
  ViewReportLink,
  IgnoredColumns,
  ImportCsvFileInput,
  SourceDetectedNotice,
  detectSourceSwitch,
  requiredColumnsCopy,
} from "@/components/application/church-admin-import-intake";
import type { ChurchAppSession } from "@/lib/auth";
import type { RecentImportBatch } from "@/lib/import-reconciliation";
import type {
  GroupsImportCommitResult,
  GroupsImportDryRunResult,
} from "@/lib/groups-import-dry-run";
import type { GroupsImportSourceSystem } from "@/lib/groups-import-source-adapters";

function truncateLabel(value: string): string {
  return value.length > 200 ? `${value.slice(0, 200)}...` : value;
}

export function ChurchAdminGroupsImportWorkspace({
  session,
  recentImports,
}: {
  session: ChurchAppSession;
  recentImports?: RecentImportBatch[];
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
  const [detectedNotice, setDetectedNotice] = useState<string | null>(null);

  // Any CSV change (typing, paste, upload, clear) invalidates the previous dry
  // run and re-detects the vendor from the headers.
  function handleCsvTextChange(text: string) {
    setCsvText(text);
    setResult(null);
    setCommitResult(null);
    setError(null);
    const switched = detectSourceSwitch(text, sourceSystem);
    if (switched) {
      setSourceSystem(switched.source);
      setDetectedNotice(switched.notice);
    } else if (!text.trim()) {
      setDetectedNotice(null);
    }
  }

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
  const isMemberships = result?.mode === "memberships";

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
              {requiredColumnsCopy("groups", sourceSystem)}
            </Text>
            <Text size="xs" c="dimmed">
              Have a Breeze Tags file (Breeze ID, Tag Name)? Upload it here and it is imported as
              group memberships (Tags mode) rather than as groups.
            </Text>
            <Text size="xs" c="dimmed">
              {IMPORT_FILE_HINT}
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
            <SourceDetectedNotice notice={detectedNotice} />
            <ImportCsvFileInput
              onText={handleCsvTextChange}
              onFilename={setSourceFilename}
              onClear={() => handleCsvTextChange("")}
            />
            <Textarea
              label="CSV content"
              value={csvText}
              onChange={(event) => handleCsvTextChange(event.currentTarget.value)}
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
                {isMemberships ? <Badge color="violet">Tags (memberships)</Badge> : null}
                <Text size="xs" c="dimmed">
                Showing {Math.min(50, isMemberships ? result.membershipRows.length : result.rows.length)} of{" "}
                {result.totalRows} rows
              </Text>
              {isMemberships ? (
                  <Badge color="violet" variant="light">
                    groups +{result.groupCreates}
                  </Badge>
                ) : null}
                {counts.unmatchedLeaders > 0 ? (
                  <Badge color="orange">{counts.unmatchedLeaders} unmatched leader(s)</Badge>
                ) : null}
                {counts.unmatchedMembers > 0 ? (
                  <Badge color="orange">{counts.unmatchedMembers} unmatched member(s)</Badge>
                ) : null}
              </Group>
              <Text size="sm" c="dimmed">
                Dry run batch {result.batchId} captured in import staging tables.
              </Text>
              <IgnoredColumns columns={result.ignoredColumns} />
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
                  disabled={
                    !result || counts.create + counts.update === 0 || isPending || commitResult !== null
                  }
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
                  {commitResult.failed > 0 ? (
                    <CommitFailureReasons reasons={commitResult.failureReasons} />
                  ) : null}
                  <ViewReportLink batchId={commitResult.batchId} />
                </Alert>
              ) : null}
              {isMemberships ? (
              <div style={{ overflowX: "auto" }}>
                <Table highlightOnHover aria-label="Tag membership rows">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Row</Table.Th>
                      <Table.Th>Member number</Table.Th>
                      <Table.Th>Group</Table.Th>
                      <Table.Th>Folder</Table.Th>
                      <Table.Th>Action</Table.Th>
                      <Table.Th>Reason</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {result.membershipRows.slice(0, 50).map((row) => (
                      <Table.Tr key={`${row.rowNumber}-${row.memberNumber ?? ""}-${row.groupName}`}>
                        <Table.Td>{row.rowNumber}</Table.Td>
                        <Table.Td>{row.memberNumber ?? "-"}</Table.Td>
                        <Table.Td>{truncateLabel(row.groupName)}</Table.Td>
                        <Table.Td>{row.folder ? truncateLabel(row.folder) : "-"}</Table.Td>
                        <Table.Td>
                          <Badge
                            color={
                              row.action === "create" ? "teal" : row.action === "skip" ? "gray" : "red"
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
              ) : (
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
              )}
            </Stack>
          </Paper>
        ) : null}
        <Paper withBorder radius="md" p="md">
          <RecentImports imports={recentImports} timeZone={session.appContext.church.timezone} />
        </Paper>
      </Stack>
    </ApplicationShell>
  );
}
