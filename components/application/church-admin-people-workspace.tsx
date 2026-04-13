"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarRange,
  CheckSquare,
  HeartHandshake,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";

import { ApplicationShell } from "@/components/application/app-shell";
import { ChurchAdminPeopleBulkActions } from "@/components/application/church-admin-people-bulk-actions";
import { ChurchAdminPersonEdit } from "@/components/application/church-admin-person-edit";
import { ChurchAdminPersonRelationships } from "@/components/application/church-admin-person-relationships";
import { ChurchAppContextBanner } from "@/components/application/church-app-context-banner";
import type { ChurchAppSession } from "@/lib/auth";
import type { ChurchAdminPeopleData } from "@/lib/church-admin-people-data";

export function ChurchAdminPeopleWorkspace({
  session,
  data,
}: {
  session: ChurchAppSession;
  data: ChurchAdminPeopleData;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [role, setRole] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const visiblePeople = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return data.people.filter((person) => {
      if (status !== "all" && person.membershipStatus !== status) {
        return false;
      }

      if (role !== "all" && person.role !== role) {
        return false;
      }

      if (!normalized) {
        return true;
      }

      const haystack = [
        person.fullName,
        person.email,
        person.phone,
        person.displayTitle,
        person.familyName,
        person.membershipStatus,
        ...person.ministryNames,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [data.people, query, role, status]);

  const allVisibleSelected =
    visiblePeople.length > 0 &&
    visiblePeople.every((person) => selectedIds.includes(person.id));

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? Array.from(new Set([...current, id])) : current.filter((value) => value !== id),
    );
  }

  function toggleSelectVisible(checked: boolean) {
    setSelectedIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...visiblePeople.map((person) => person.id)]));
      }

      const visibleSet = new Set(visiblePeople.map((person) => person.id));
      return current.filter((id) => !visibleSet.has(id));
    });
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="ChurchAdmin"
      title="People"
      description={session.appContext.church.name}
      sidebarTitle="People management"
      sidebarDescription="Church records, statuses, and contact visibility."
      navLabel="Church admin"
      navItems={[
        {
          href: "/app/church-admin",
          label: "Home",
          description: "Operations",
          icon: HeartHandshake,
        },
        {
          href: "/app/church-admin/people",
          label: "People",
          description: "Records and statuses",
          icon: UsersRound,
          active: true,
        },
      ]}
      topActions={
        <Group gap="sm" wrap="wrap" justify="flex-end">
          <Button component={Link} href="/app/church-admin" variant="default" radius="xl">
            Overview
          </Button>
          <Button
            component={Link}
            href="/app/calendar"
            radius="xl"
            leftSection={<CalendarRange size={16} />}
          >
            Calendar
          </Button>
        </Group>
      }
    >
      <ChurchAppContextBanner session={session} />

      <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="md">
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            People
          </Text>
          <Title order={3} mt="xs">
            {data.summary.totalPeople}
          </Title>
        </Paper>
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Visitors
          </Text>
          <Title order={3} mt="xs">
            {data.summary.visitorCount}
          </Title>
        </Paper>
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Families
          </Text>
          <Title order={3} mt="xs">
            {data.summary.familyCount}
          </Title>
        </Paper>
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Incomplete
          </Text>
          <Title order={3} mt="xs">
            {data.summary.incompleteProfiles}
          </Title>
        </Paper>
      </SimpleGrid>

      <Paper withBorder radius="xl" p="xl">
        <Group gap="sm" mb="lg">
          <ThemeIcon color="gray" variant="light" radius="xl" size="lg">
            <ShieldCheck size={18} />
          </ThemeIcon>
          <div>
            <Title order={3} size="h4">
              People records
            </Title>
            <Text size="sm" c="dimmed">
              Search, filter, and update churchgoer records.
            </Text>
          </div>
        </Group>

        <Group align="flex-end" gap="md" grow mb="lg">
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search people, family, email, or ministry"
            leftSection={<Search size={16} />}
            radius="xl"
          />
          <Select
            value={status}
            onChange={(value) => setStatus(value ?? "all")}
            data={[
              { value: "all", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "visitor", label: "Visitor" },
              { value: "inactive", label: "Inactive" },
              { value: "baptized", label: "Baptized" },
              { value: "transferred", label: "Transferred" },
            ]}
            radius="xl"
          />
          <Select
            value={role}
            onChange={(value) => setRole(value ?? "all")}
            data={[
              { value: "all", label: "All roles" },
              { value: "church_admin", label: "Church admin" },
              { value: "pastor", label: "Pastor" },
              { value: "ministry_leader", label: "Ministry leader" },
              { value: "member", label: "Member" },
            ]}
            radius="xl"
          />
        </Group>

        <Group justify="space-between" align="center" mb="lg">
          <Group gap="sm">
            <CheckSquare size={16} />
            <Text size="sm" c="dimmed">
              Select visible people for bulk status and privacy updates.
            </Text>
          </Group>
          <Checkbox
            label="Select visible"
            checked={allVisibleSelected}
            onChange={(event) => toggleSelectVisible(event.currentTarget.checked)}
          />
        </Group>

        {selectedIds.length ? (
          <ChurchAdminPeopleBulkActions
            selectedIds={selectedIds}
            onClear={() => setSelectedIds([])}
          />
        ) : null}

        <Stack gap="sm">
          {visiblePeople.length ? (
            visiblePeople.map((person) => (
              <Paper key={person.id} withBorder radius="xl" p="lg">
                <Group justify="space-between" align="flex-start" gap="md">
                  <Group align="flex-start" gap="md" wrap="nowrap">
                    <Checkbox
                      mt={4}
                      checked={selectedIds.includes(person.id)}
                      onChange={(event) =>
                        toggleSelected(person.id, event.currentTarget.checked)
                      }
                    />
                    <div>
                      <Text fw={600}>{person.fullName}</Text>
                      <Text size="sm" c="dimmed" mt={4}>
                        {person.displayTitle || person.role}
                        {person.familyName ? ` • ${person.familyName}` : ""}
                      </Text>
                      <Text size="sm" mt={8}>
                        {person.email || "No email on file"}
                      </Text>
                      <Text size="sm" c="dimmed" mt={4}>
                        {person.phone || "No phone on file"}
                      </Text>
                      {person.ministryNames.length ? (
                        <Text size="sm" c="dimmed" mt={4}>
                          {person.ministryNames.join(", ")}
                        </Text>
                      ) : null}
                    </div>
                  </Group>

                  <Stack gap={8} align="flex-end">
                    <Badge color="gray" variant="light">
                      {person.membershipStatus}
                    </Badge>
                    <Badge color="gray" variant="outline">
                      {person.directoryVisible ? "Directory" : "Hidden"}
                    </Badge>
                    <Badge color="gray" variant="outline">
                      {person.contactAllowed ? "Contact ok" : "Contact private"}
                    </Badge>
                    <ChurchAdminPersonRelationships
                      person={person}
                      families={data.families}
                    />
                    <ChurchAdminPersonEdit person={person} />
                  </Stack>
                </Group>
              </Paper>
            ))
          ) : (
            <Text size="sm" c="dimmed">
              No people match the current search and filters.
            </Text>
          )}
        </Stack>
      </Paper>
    </ApplicationShell>
  );
}
