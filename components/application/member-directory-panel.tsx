"use client";

import { useMemo, useState } from "react";
import { Search, UsersRound } from "lucide-react";
import {
  Badge,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";

import { useI18n } from "@/components/i18n-provider";
import type { MemberDirectoryEntry } from "@/lib/member-portal-data";

function knownKey(value: string) {
  return value.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

export function MemberDirectoryPanel({
  directory,
  mode = "compact",
}: {
  directory: MemberDirectoryEntry[];
  mode?: "compact" | "full";
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const { t } = useI18n();
  const translateMember = (key: string) => t("member", key);
  const translateKnown = (value: string) => {
    const key = knownKey(value);
    const translated = translateMember(key);
    return translated === key ? value : translated;
  };

  const visibleDirectory = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return directory.filter((entry) => {
      const matchesStatus =
        status === "all" || entry.membershipStatus === status;
      if (!matchesStatus) {
        return false;
      }

      if (!normalized) {
        return true;
      }

      const haystack = [
        entry.fullName,
        entry.displayTitle,
        entry.familyName,
        entry.membershipStatus,
        ...entry.ministryNames,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [directory, query, status]);

  return (
    <Paper withBorder radius="xl" p="xl">
      <Group justify="space-between" align="center" mb="lg">
        <Group gap="sm">
          <ThemeIcon color="gray" variant="light" radius="xl" size="lg">
            <UsersRound size={18} />
          </ThemeIcon>
          <div>
            <Title order={3} size="h4">
              {translateMember("directory")}
            </Title>
            <Text size="sm" c="dimmed">
              {translateMember("directoryPanelDescription")}
            </Text>
          </div>
        </Group>
        <Badge color="gray" variant="light">
          {visibleDirectory.length}
        </Badge>
      </Group>

      <TextInput
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder={translateMember("directorySearchPlaceholder")}
        leftSection={<Search size={16} />}
        radius="xl"
      />

      {mode === "full" ? (
        <Select
          value={status}
          onChange={(value) => setStatus(value ?? "all")}
          data={[
            { value: "all", label: translateMember("allStatuses") },
            { value: "active", label: translateMember("active") },
            { value: "visitor", label: translateMember("visitor") },
            { value: "inactive", label: translateMember("inactive") },
            { value: "baptized", label: translateMember("baptized") },
            { value: "transferred", label: translateMember("transferred") },
          ]}
          radius="xl"
          mt="md"
          mb="lg"
        />
      ) : (
        <div style={{ marginBottom: 24 }} />
      )}

      <Stack gap="sm">
        {visibleDirectory.length ? (
          visibleDirectory.map((entry) => (
            <Paper key={entry.id} withBorder radius="xl" p="lg">
              <Group justify="space-between" align="flex-start" gap="md">
                <div>
                  <Text fw={600}>{entry.fullName}</Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    {entry.displayTitle || translateMember("churchMember")}
                    {entry.familyName ? ` • ${entry.familyName}` : ""}
                  </Text>
                  {entry.contactAllowed && (entry.email || entry.phone) ? (
                    <Text size="sm" mt={8}>
                      {entry.email ?? entry.phone}
                      {entry.email && entry.phone ? ` • ${entry.phone}` : ""}
                    </Text>
                  ) : (
                    <Text size="sm" mt={8} c="dimmed">
                      {translateMember("contactDetailsPrivate")}
                    </Text>
                  )}
                </div>

                <Stack gap={6} align="flex-end">
                  <Badge color="gray" variant="light">
                    {translateKnown(entry.membershipStatus)}
                  </Badge>
                  {entry.ministryNames.length ? (
                    <Text size="xs" c="dimmed" ta="right">
                      {entry.ministryNames.join(", ")}
                    </Text>
                  ) : null}
                </Stack>
              </Group>
            </Paper>
          ))
        ) : (
          <Text size="sm" c="dimmed">
            {translateMember("noDirectoryMatches")}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
