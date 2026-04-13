"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BrainCircuit,
  CalendarRange,
  HeartPulse,
  Search,
  UsersRound,
} from "lucide-react";
import {
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";

import { ApplicationShell } from "@/components/application/app-shell";
import { ChurchAppContextBanner } from "@/components/application/church-app-context-banner";
import { PastorPersonCareModal } from "@/components/application/pastor-person-care-modal";
import type { ChurchAppSession } from "@/lib/auth";
import type { PastorPortalData } from "@/lib/pastor-portal-data";

function formatAttendance(value: string | null) {
  if (!value) {
    return "No attendance";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function PastorPeopleWorkspace({
  session,
  data,
}: {
  session: ChurchAppSession;
  data: PastorPortalData;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");

  const visiblePeople = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return data.people.filter((person) => {
      const statusMatch = status === "all" || person.membershipStatus === status;
      if (!statusMatch) return false;

      if (!normalized) return true;

      const haystack = [
        person.fullName,
        person.displayTitle,
        person.familyName,
        person.membershipStatus,
        person.email,
        person.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [data.people, query, status]);

  const noteCountByProfileId = useMemo(() => {
    return data.pastoralNotes.reduce((map, note) => {
      map.set(note.profileId, (map.get(note.profileId) ?? 0) + 1);
      return map;
    }, new Map<string, number>());
  }, [data.pastoralNotes]);

  const assignmentCountByProfileId = useMemo(() => {
    return data.careAssignments.reduce((map, assignment) => {
      if (assignment.status !== "closed") {
        map.set(
          assignment.profileId,
          (map.get(assignment.profileId) ?? 0) + 1,
        );
      }
      return map;
    }, new Map<string, number>());
  }, [data.careAssignments]);

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/pastor"
      calendarHref="/app/calendar"
      sectionLabel="Pastor"
      title="People"
      description={session.appContext.church.name}
      sidebarTitle="Pastor people view"
      sidebarDescription="Contact context and follow-up visibility."
      navLabel="Pastor"
      navItems={[
        {
          href: "/app/pastor",
          label: "Home",
          description: "Pastor overview",
          icon: BrainCircuit,
        },
        {
          href: "/app/pastor/people",
          label: "People",
          description: "Directory and follow-up",
          icon: UsersRound,
          active: true,
        },
      ]}
      topActions={
        <Group gap="sm" wrap="wrap" justify="flex-end">
          <Button component={Link} href="/app/pastor" variant="default" radius="xl">
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

      <Paper withBorder radius="xl" p="xl">
        <Group gap="sm" mb="lg">
          <ThemeIcon color="gray" variant="light" radius="xl" size="lg">
            <HeartPulse size={18} />
          </ThemeIcon>
          <div>
            <Title order={3} size="h4">
              People view
            </Title>
            <Text size="sm" c="dimmed">
              Simple directory and pastoral follow-up context.
            </Text>
          </div>
        </Group>

        <Group align="flex-end" gap="md" grow>
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search people, family, email, or phone"
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
        </Group>
      </Paper>

      <Stack gap="sm">
        {visiblePeople.length ? (
          visiblePeople.map((person) => (
            <Paper key={person.id} withBorder radius="xl" p="lg">
              <Group justify="space-between" align="flex-start" gap="md">
                <div>
                  <Text fw={600}>{person.fullName}</Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    {person.displayTitle || "Church member"}
                    {person.familyName ? ` • ${person.familyName}` : ""}
                  </Text>
                  <Text size="sm" mt={8}>
                    {person.email || "No email on file"}
                  </Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    {person.phone || "No phone on file"}
                  </Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    Last attendance: {formatAttendance(person.lastAttendance)}
                  </Text>
                </div>

                <Stack gap={6} align="flex-end">
                  <Badge color="gray" variant="light">
                    {person.membershipStatus}
                  </Badge>
                  <Badge color="gray" variant="outline">
                    {person.directoryVisible ? "Visible" : "Private"}
                  </Badge>
                  <Badge color="gray" variant="outline">
                    {assignmentCountByProfileId.get(person.id) ?? 0} open care
                  </Badge>
                  <Badge color="gray" variant="outline">
                    {noteCountByProfileId.get(person.id) ?? 0} notes
                  </Badge>
                  <PastorPersonCareModal
                    person={person}
                    notes={data.pastoralNotes.filter(
                      (note) => note.profileId === person.id,
                    )}
                    assignments={data.careAssignments.filter(
                      (assignment) => assignment.profileId === person.id,
                    )}
                  />
                </Stack>
              </Group>
            </Paper>
          ))
        ) : (
          <Paper withBorder radius="xl" p="lg">
            <Text size="sm" c="dimmed">
              No people match the current search and status filter.
            </Text>
          </Paper>
        )}
      </Stack>
    </ApplicationShell>
  );
}
