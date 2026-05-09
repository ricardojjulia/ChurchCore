"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BarChart2,
  CheckSquare,
  DollarSign,
  HeartHandshake,
  MailCheck,
  MessageSquare,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import {
  Badge,
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
import { ChurchAdminAddPerson } from "@/components/application/church-admin-add-person";
import { ChurchAdminInviteUser } from "@/components/application/church-admin-invite-user";
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
  const searchParams = useSearchParams();
  const initialView = searchParams.get("view");
  const initialQuery = searchParams.get("q") ?? "";
  const initialStatus = searchParams.get("status") ?? "all";
  const initialAccount =
    searchParams.get("account") ??
    (initialView === "pending-accounts" ? "pending-request" : "all");
  const initialHousehold =
    searchParams.get("household") ??
    (initialView === "unassigned-households" ? "unassigned" : "all");
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [role, setRole] = useState(searchParams.get("role") ?? "all");
  const [accountFilter, setAccountFilter] = useState(initialAccount);
  const [householdFilter, setHouseholdFilter] = useState(initialHousehold);
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

      if (accountFilter === "pending-request" && !person.pendingAccountRequestId) {
        return false;
      }

      if (accountFilter === "active-account" && person.accountStatus !== "active") {
        return false;
      }

      if (
        accountFilter === "needs-account" &&
        (person.accountStatus === "active" || person.pendingAccountRequestId)
      ) {
        return false;
      }

      if (householdFilter === "assigned" && !person.familyId) {
        return false;
      }

      if (householdFilter === "unassigned" && person.familyId) {
        return false;
      }

      if (
        initialView === "incomplete-profiles" &&
        person.fullName &&
        person.email &&
        person.phone &&
        person.address
      ) {
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
        person.familyId ? "household assigned" : "no household",
        person.membershipStatus,
        person.memberNumber,
        person.accountStatus,
        person.pendingAccountRequestId ? "pending account request" : null,
        ...person.ministryNames,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [accountFilter, data.people, householdFilter, initialView, query, role, status]);

  const allVisibleSelected =
    visiblePeople.length > 0 &&
    visiblePeople.every((person) => selectedIds.includes(person.id));
  const activeFilterLabels = [
    query ? `Search: ${query}` : null,
    status !== "all" ? `Status: ${status}` : null,
    role !== "all" ? `Role: ${role}` : null,
    accountFilter !== "all" ? `Account: ${accountFilter.replace("-", " ")}` : null,
    householdFilter !== "all" ? `Household: ${householdFilter}` : null,
  ].filter((label): label is string => Boolean(label));
  const readinessContext =
    initialView === "incomplete-profiles"
      ? "Readiness view: incomplete profiles and contact records."
      : initialView === "unassigned-households"
        ? "Readiness view: people without household assignments."
        : initialView === "pending-accounts"
          ? "Readiness view: profiles tied to pending portal account requests."
          : null;

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
          href: "/app/church-admin/settings",
          label: "Settings",
          description: "Church setup",
          icon: Settings,
        },
        {
          href: "/app/church-admin/people",
          label: "People",
          description: "Records and statuses",
          icon: UsersRound,
          active: true,
        },
        {
          href: "/app/church-admin/accounts",
          label: "Accounts",
          description: "Portal approvals",
          icon: MailCheck,
        },
        {
          href: "/app/communications",
          label: "Communications",
          description: "Broadcast and messaging",
          icon: MessageSquare,
        },
        {
          href: "/app/giving",
          label: "Giving",
          description: "Donations dashboard",
          icon: DollarSign,
        },
        {
          href: "/app/reports",
          label: "Reports",
          description: "Members, events, giving",
          icon: BarChart2,
        },
        {
          href: "/app/church-admin/ministry",
          label: "Ministry Forge",
          description: "Health, vision, and impact",
          icon: Sparkles,
        },
      ]}
      topActions={
        <Group gap="sm">
          <ChurchAdminInviteUser />
          <ChurchAdminAddPerson />
        </Group>
      }
    >
      <ChurchAppContextBanner session={session} />

      <SimpleGrid cols={{ base: 1, sm: 2, xl: 6 }} spacing="md">
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
            No household
          </Text>
          <Title order={3} mt="xs">
            {data.summary.unassignedHouseholdCount}
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
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Pending accounts
          </Text>
          <Title order={3} mt="xs">
            {data.summary.pendingAccountRequests}
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

        {readinessContext ? (
          <Paper withBorder radius="lg" p="md" mb="md" bg="#f8fbff">
            <Group justify="space-between" gap="md">
              <div>
                <Text fw={700} size="sm">
                  {readinessContext}
                </Text>
                <Text size="sm" c="dimmed" mt={4}>
                  Showing {visiblePeople.length} matching record{visiblePeople.length === 1 ? "" : "s"}.
                </Text>
              </div>
              <Text component={Link} href="/app/church-admin/readiness" size="sm" fw={700} c="churchBlue">
                Back to readiness
              </Text>
            </Group>
          </Paper>
        ) : null}

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
              { value: "secretary", label: "Secretary / office admin" },
              { value: "pastor", label: "Pastor" },
              { value: "ministry_leader", label: "Ministry leader" },
              { value: "member", label: "Member" },
            ]}
            radius="xl"
          />
          <Select
            value={accountFilter}
            onChange={(value) => setAccountFilter(value ?? "all")}
            data={[
              { value: "all", label: "All accounts" },
              { value: "pending-request", label: "Pending request" },
              { value: "active-account", label: "Active account" },
              { value: "needs-account", label: "Needs account" },
            ]}
            radius="xl"
          />
          <Select
            value={householdFilter}
            onChange={(value) => setHouseholdFilter(value ?? "all")}
            data={[
              { value: "all", label: "All households" },
              { value: "assigned", label: "Has household" },
              { value: "unassigned", label: "No household" },
            ]}
            radius="xl"
          />
        </Group>

        {activeFilterLabels.length ? (
          <Group gap="xs" mb="lg">
            {activeFilterLabels.map((label) => (
              <Badge key={label} color="gray" variant="light">
                {label}
              </Badge>
            ))}
            <Badge component={Link} href="/app/church-admin/people" color="churchBlue" variant="outline">
              Clear filters
            </Badge>
          </Group>
        ) : null}

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
                      <Group gap="xs" mt={8}>
                        <Badge
                          color={person.familyId ? "teal" : "yellow"}
                          variant="light"
                        >
                          {person.familyName ?? "no household"}
                        </Badge>
                        {person.memberNumber ? (
                          <Badge color="gray" variant="outline">
                            {person.memberNumber}
                          </Badge>
                        ) : null}
                        <Badge
                          color={person.accountStatus === "active" ? "teal" : "gray"}
                          variant="light"
                        >
                          {person.accountStatus ?? "no account"}
                        </Badge>
                        {person.pendingAccountRequestId ? (
                          <Badge
                            component={Link}
                            href="/app/church-admin/accounts"
                            color="yellow"
                            variant="light"
                          >
                            pending request
                          </Badge>
                        ) : null}
                      </Group>
                      {person.ministryNames.length ? (
                        <Text size="sm" c="dimmed" mt={4}>
                          {person.ministryNames.join(", ")}
                        </Text>
                      ) : null}

                      <Stack gap={6} mt="md">
                        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                          ShepherdAI Insights
                        </Text>
                        {person.shepherdInsights.length === 0 ? (
                          <Text size="xs" c="dimmed">
                            No active suggestions.
                          </Text>
                        ) : (
                          person.shepherdInsights.map((insight) => (
                            <Paper key={insight.id} withBorder radius="md" p="sm">
                              <Group justify="space-between" align="flex-start" gap="xs">
                                <div>
                                  <Text size="sm" fw={600}>
                                    {insight.title}
                                  </Text>
                                  <Text size="xs" c="dimmed" mt={2} lineClamp={2}>
                                    {insight.summary}
                                  </Text>
                                </div>
                                <Badge
                                  size="xs"
                                  color={
                                    insight.urgency === "high"
                                      ? "red"
                                      : insight.urgency === "medium"
                                        ? "yellow"
                                        : "gray"
                                  }
                                  variant="light"
                                >
                                  {insight.urgency}
                                </Badge>
                              </Group>
                            </Paper>
                          ))
                        )}
                        <Text
                          component={Link}
                          href="/app/church-admin/workflows"
                          size="xs"
                          c="churchBlue"
                          fw={600}
                        >
                          View ministry workflows
                        </Text>
                      </Stack>
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
            <Paper withBorder radius="lg" p="lg" bg="#f8fbff">
              <Text fw={700}>No people match this view.</Text>
              <Text size="sm" c="dimmed" mt={4}>
                Clear filters or add a person record to continue setup.
              </Text>
            </Paper>
          )}
        </Stack>
      </Paper>
    </ApplicationShell>
  );
}
