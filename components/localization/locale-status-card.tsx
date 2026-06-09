"use client";

import { Badge, Group, Paper, Stack, Table, Text, Title } from "@mantine/core";

import type { LocaleStatus } from "@/lib/localization-governance/types";
import { VersionStateBadge } from "@/components/localization/version-state-badge";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function LocaleStatusCard({
  status,
}: {
  status: LocaleStatus;
}) {
  const { code, sourceLocale, activeVersionId, activeState, versions } = status;
  const isSource = sourceLocale === code;

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        {/* Header row */}
        <Group justify="space-between" align="flex-start">
          <Group gap="xs" align="center">
            <Title order={4}>{code}</Title>
            <VersionStateBadge state={activeState} />
            {isSource && (
              <Badge color="violet" variant="filled" size="sm">
                Source
              </Badge>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            {versions.length} {versions.length === 1 ? "version" : "versions"}
          </Text>
        </Group>

        {/* Active version */}
        {activeVersionId && (
          <Text size="xs" c="dimmed" ff="monospace">
            Active: {activeVersionId.slice(0, 8)}
          </Text>
        )}

        {/* Versions table */}
        {versions.length > 0 ? (
          <Table striped highlightOnHover withTableBorder withColumnBorders fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Version</Table.Th>
                <Table.Th>State</Table.Th>
                <Table.Th>Created</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {versions.map((v) => (
                <Table.Tr key={v.id}>
                  <Table.Td>{v.version}</Table.Td>
                  <Table.Td>
                    <VersionStateBadge state={v.state} />
                  </Table.Td>
                  <Table.Td>{formatDate(v.createdAt)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="sm" c="dimmed">
            No versions yet.
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
