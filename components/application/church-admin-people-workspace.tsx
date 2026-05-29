"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
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
import { notifications } from "@mantine/notifications";

import { reviewMemberChangeRequestAction } from "@/app/app/actions";
import { ApplicationShell } from "@/components/application/app-shell";
import { ChurchAdminAddPerson } from "@/components/application/church-admin-add-person";
import { ChurchAdminInviteUser } from "@/components/application/church-admin-invite-user";
import { ChurchAdminPeopleBulkActions } from "@/components/application/church-admin-people-bulk-actions";
import { ChurchAdminPersonEdit } from "@/components/application/church-admin-person-edit";
import { ChurchAdminPersonRelationships } from "@/components/application/church-admin-person-relationships";
import { ChurchAppContextBanner } from "@/components/application/church-app-context-banner";
import {
  ReadinessTargetState,
  type ReadinessTargetStateProps,
} from "@/components/application/readiness-target-state";
import { useI18n } from "@/components/i18n-provider";
import type { ChurchAppSession } from "@/lib/auth";
import type { ChurchAdminPeopleData } from "@/lib/church-admin-people-data";

function normalizeMessageKey(value: string) {
  return value.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

function formatRequestedDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

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
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [role, setRole] = useState(searchParams.get("role") ?? "all");
  const [accountFilter, setAccountFilter] = useState(initialAccount);
  const [householdFilter, setHouseholdFilter] = useState(initialHousehold);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { locale, t } = useI18n();
  const translatePeople = (
    key: string,
    values?: Record<string, string | number>,
  ) => t("people", key, values);
  const translateKnown = (value: string | null | undefined) => {
    if (!value) return "";
    const key = normalizeMessageKey(value);
    const translated = translatePeople(key);
    return translated === key ? value : translated;
  };

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
    query ? translatePeople("searchFilter", { value: query }) : null,
    status !== "all"
      ? translatePeople("statusFilter", { value: translateKnown(status) })
      : null,
    role !== "all"
      ? translatePeople("roleFilter", { value: translateKnown(role) })
      : null,
    accountFilter !== "all"
      ? translatePeople("accountFilter", { value: translateKnown(accountFilter) })
      : null,
    householdFilter !== "all"
      ? translatePeople("householdFilter", { value: translateKnown(householdFilter) })
      : null,
  ].filter((label): label is string => Boolean(label));
  const readinessContext =
    initialView === "incomplete-profiles"
      ? translatePeople("readinessIncomplete")
      : initialView === "unassigned-households"
        ? translatePeople("readinessUnassigned")
        : initialView === "pending-accounts"
          ? translatePeople("readinessPendingAccounts")
          : null;
  const readinessTargetState: ReadinessTargetStateProps | null = readinessContext
    ? data.source === "preview"
      ? {
          state: "no-backend",
          title: "Readiness target unavailable",
          description:
            "People readiness can be previewed, but live profile completion needs tenant data.",
          detail: "Configure the tenant backend before using this target to clear readiness.",
          primaryAction: { label: translatePeople("backToReadiness"), href: "/app/church-admin/readiness" },
        }
      : visiblePeople.length === 0
        ? {
            state: "completed",
            title: "People readiness item is clear",
            description:
              "No records currently match this readiness filter.",
            primaryAction: { label: translatePeople("backToReadiness"), href: "/app/church-admin/readiness" },
            secondaryAction: { label: translatePeople("clearFilters"), href: "/app/church-admin/people" },
          }
        : {
            state: "validation-error",
            title: "People records need attention",
            description:
              "Resolve the matching records below before marking this readiness item complete.",
            detail: translatePeople("showingMatching", {
              count: visiblePeople.length,
              plural: visiblePeople.length === 1 ? "" : "s",
            }),
            primaryAction: { label: translatePeople("backToReadiness"), href: "/app/church-admin/readiness" },
          }
    : data.source === "live" && data.people.length === 0
      ? {
          state: "empty",
          title: "No people records yet",
          description:
            "Add or import people before using this workspace for profile, household, account, and readiness work.",
        }
      : null;

  function handleReviewRequest(
    requestId: string,
    decision: "approved" | "rejected",
  ) {
    startTransition(async () => {
      try {
        await reviewMemberChangeRequestAction({ requestId, decision });
        notifications.show({
          title:
            decision === "approved"
              ? translatePeople("memberChangeRequestApproved")
              : translatePeople("memberChangeRequestRejected"),
          message: translatePeople("memberChangeRequestReviewSaved"),
          color: decision === "approved" ? "teal" : "gray",
        });
      } catch (error) {
        notifications.show({
          title: translatePeople("memberChangeRequestReviewError"),
          message:
            error instanceof Error
              ? error.message
              : translatePeople("memberChangeRequestReviewErrorMessage"),
          color: "red",
        });
      }
    });
  }

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
      sectionLabel={t("portalNav", "churchAdmin")}
      title={t("portalNav", "people")}
      description={session.appContext.church.name}
      sidebarTitle={translatePeople("peopleManagement")}
      sidebarDescription={translatePeople("sidebarDescription")}
      navLabel={t("portalNav", "churchAdmin")}
      navItems={[
        {
          href: "/app/church-admin",
          label: t("portalNav", "home"),
          description: t("portalNav", "operations"),
          icon: HeartHandshake,
        },
        {
          href: "/app/church-admin/settings",
          label: t("portalNav", "settings"),
          description: t("portalNav", "churchSetup"),
          icon: Settings,
        },
        {
          href: "/app/church-admin/people",
          label: t("portalNav", "people"),
          description: t("portalNav", "peopleDescription"),
          icon: UsersRound,
          active: true,
        },
        {
          href: "/app/church-admin/accounts",
          label: t("accountRequests", "accounts"),
          description: t("portalNav", "accountRequestsDescription"),
          icon: MailCheck,
        },
        {
          href: "/app/communications",
          label: t("portalNav", "communications"),
          description: t("portalNav", "communicationsDescription"),
          icon: MessageSquare,
        },
        {
          href: "/app/giving",
          label: t("portalNav", "givingOps"),
          description: t("portalNav", "donationsDescription"),
          icon: DollarSign,
        },
        {
          href: "/app/reports",
          label: t("portalNav", "reports"),
          description: t("portalNav", "reportsDescription"),
          icon: BarChart2,
        },
        {
          href: "/app/church-admin/ministry",
          label: t("portalNav", "ministryForge"),
          description: t("portalNav", "ministryForgeDescription"),
          icon: Sparkles,
        },
      ]}
      topActions={
        <Group gap="sm">
          <Button component={Link} href="/app/church-admin/people/import" variant="default" radius="xl">
            Import
          </Button>
          <ChurchAdminInviteUser />
          <ChurchAdminAddPerson />
        </Group>
      }
    >
      <ChurchAppContextBanner session={session} />

      <SimpleGrid cols={{ base: 1, sm: 2, xl: 7 }} spacing="md">
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            {t("portalNav", "people")}
          </Text>
          <Title order={3} mt="xs">
            {data.summary.totalPeople}
          </Title>
        </Paper>
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            {translatePeople("visitors")}
          </Text>
          <Title order={3} mt="xs">
            {data.summary.visitorCount}
          </Title>
        </Paper>
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            {translatePeople("families")}
          </Text>
          <Title order={3} mt="xs">
            {data.summary.familyCount}
          </Title>
        </Paper>
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            {translatePeople("noHousehold")}
          </Text>
          <Title order={3} mt="xs">
            {data.summary.unassignedHouseholdCount}
          </Title>
        </Paper>
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            {translatePeople("incomplete")}
          </Text>
          <Title order={3} mt="xs">
            {data.summary.incompleteProfiles}
          </Title>
        </Paper>
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            {translatePeople("pendingAccounts")}
          </Text>
          <Title order={3} mt="xs">
            {data.summary.pendingAccountRequests}
          </Title>
        </Paper>
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            {translatePeople("pendingMemberProfileReviews")}
          </Text>
          <Title order={3} mt="xs">
            {data.summary.pendingMemberChangeRequests}
          </Title>
        </Paper>
      </SimpleGrid>

      <Paper withBorder radius="xl" p="xl">
        <Group gap="sm" mb="lg">
          <ThemeIcon color="gray" variant="light" radius="xl" size="lg">
            <MailCheck size={18} />
          </ThemeIcon>
          <div>
            <Title order={3} size="h4">
              {translatePeople("memberProfileReviewQueue")}
            </Title>
            <Text size="sm" c="dimmed">
              {translatePeople("memberProfileReviewQueueDescription")}
            </Text>
          </div>
        </Group>

        <Stack gap="sm">
          {data.pendingMemberChangeRequests.length ? (
            data.pendingMemberChangeRequests.map((request) => (
              <Paper key={request.id} withBorder radius="xl" p="lg">
                <Group justify="space-between" align="flex-start" gap="md">
                  <Stack gap={6}>
                    <Group gap="xs" wrap="wrap">
                      <Text fw={600}>{request.targetProfileName}</Text>
                      <Badge color="yellow" variant="light">
                        {request.changeType === "profile"
                          ? translatePeople("profileUpdateReview")
                          : translatePeople("familyUpdateReview")}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed">
                      {translatePeople("requestedAt", {
                        value: formatRequestedDate(request.createdAt, locale),
                      })}
                    </Text>
                    {request.requestedByProfileName ? (
                      <Text size="sm" c="dimmed">
                        {translatePeople("requestedBy", {
                          value: request.requestedByProfileName,
                        })}
                      </Text>
                    ) : null}
                  </Stack>

                  <Group gap="xs">
                    <Button
                      variant="default"
                      radius="xl"
                      onClick={() => handleReviewRequest(request.id, "rejected")}
                      loading={isPending}
                    >
                      {translatePeople("reject")}
                    </Button>
                    <Button
                      radius="xl"
                      color="teal"
                      onClick={() => handleReviewRequest(request.id, "approved")}
                      loading={isPending}
                    >
                      {translatePeople("approve")}
                    </Button>
                  </Group>
                </Group>
              </Paper>
            ))
          ) : (
            <Paper withBorder radius="lg" p="lg" bg="#f8fbff">
              <Text fw={700}>{translatePeople("noPendingMemberProfileReviews")}</Text>
            </Paper>
          )}
        </Stack>
      </Paper>

      <Paper withBorder radius="xl" p="xl">
        <Group gap="sm" mb="lg">
          <ThemeIcon color="gray" variant="light" radius="xl" size="lg">
            <ShieldCheck size={18} />
          </ThemeIcon>
          <div>
            <Title order={3} size="h4">
              {translatePeople("peopleRecords")}
            </Title>
            <Text size="sm" c="dimmed">
              {translatePeople("peopleRecordsDescription")}
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
                  {translatePeople("showingMatching", {
                    count: visiblePeople.length,
                    plural: visiblePeople.length === 1 ? "" : "s",
                  })}
                </Text>
              </div>
              <Text component={Link} href="/app/church-admin/readiness" size="sm" fw={700} c="churchBlue">
                {translatePeople("backToReadiness")}
              </Text>
            </Group>
          </Paper>
        ) : null}

        {readinessTargetState ? (
          <Stack mb="md">
            <ReadinessTargetState {...readinessTargetState} />
          </Stack>
        ) : null}

        <Group align="flex-end" gap="md" grow mb="lg">
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={translatePeople("searchPlaceholder")}
            leftSection={<Search size={16} />}
            radius="xl"
          />
          <Select
            value={status}
            onChange={(value) => setStatus(value ?? "all")}
            data={[
              { value: "all", label: translatePeople("allStatuses") },
              { value: "active", label: translatePeople("active") },
              { value: "visitor", label: translatePeople("visitor") },
              { value: "inactive", label: translatePeople("inactive") },
              { value: "baptized", label: translatePeople("baptized") },
              { value: "transferred", label: translatePeople("transferred") },
            ]}
            radius="xl"
          />
          <Select
            value={role}
            onChange={(value) => setRole(value ?? "all")}
            data={[
              { value: "all", label: translatePeople("allRoles") },
              { value: "church_admin", label: translatePeople("church_admin") },
              { value: "secretary", label: translatePeople("secretary") },
              { value: "pastor", label: translatePeople("pastor") },
              { value: "ministry_leader", label: translatePeople("ministry_leader") },
              { value: "member", label: translatePeople("member") },
            ]}
            radius="xl"
          />
          <Select
            value={accountFilter}
            onChange={(value) => setAccountFilter(value ?? "all")}
            data={[
              { value: "all", label: translatePeople("allAccounts") },
              { value: "pending-request", label: translatePeople("pending_request") },
              { value: "active-account", label: translatePeople("active_account") },
              { value: "needs-account", label: translatePeople("needs_account") },
            ]}
            radius="xl"
          />
          <Select
            value={householdFilter}
            onChange={(value) => setHouseholdFilter(value ?? "all")}
            data={[
              { value: "all", label: translatePeople("allHouseholds") },
              { value: "assigned", label: translatePeople("hasHousehold") },
              { value: "unassigned", label: translatePeople("noHousehold") },
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
              {translatePeople("clearFilters")}
            </Badge>
          </Group>
        ) : null}

        <Group justify="space-between" align="center" mb="lg">
          <Group gap="sm">
            <CheckSquare size={16} />
            <Text size="sm" c="dimmed">
              {translatePeople("selectVisibleDescription")}
            </Text>
          </Group>
          <Checkbox
            label={translatePeople("selectVisible")}
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
                        {person.displayTitle || translateKnown(person.role)}
                        {person.familyName ? ` • ${person.familyName}` : ""}
                      </Text>
                      <Text size="sm" mt={8}>
                        {person.email || translatePeople("noEmail")}
                      </Text>
                      <Text size="sm" c="dimmed" mt={4}>
                        {person.phone || translatePeople("noPhone")}
                      </Text>
                      <Group gap="xs" mt={8}>
                        <Badge
                          color={person.familyId ? "teal" : "yellow"}
                          variant="light"
                        >
                          {person.familyName ?? translatePeople("noHouseholdLower")}
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
                          {person.accountStatus
                            ? translateKnown(person.accountStatus)
                            : translatePeople("noAccount")}
                        </Badge>
                        {person.pendingAccountRequestId ? (
                          <Badge
                            component={Link}
                            href="/app/church-admin/accounts"
                            color="yellow"
                            variant="light"
                          >
                            {translatePeople("pending_request")}
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
                          {translatePeople("shepherdInsights")}
                        </Text>
                        {person.shepherdInsights.length === 0 ? (
                          <Text size="xs" c="dimmed">
                            {translatePeople("noActiveSuggestions")}
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
                                  {translateKnown(insight.urgency)}
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
                          {translatePeople("viewMinistryWorkflows")}
                        </Text>
                      </Stack>
                    </div>
                  </Group>

                  <Stack gap={8} align="flex-end">
                    <Badge color="gray" variant="light">
                      {translateKnown(person.membershipStatus)}
                    </Badge>
                    <Badge color="gray" variant="outline">
                      {person.directoryVisible
                        ? translatePeople("directory")
                        : translatePeople("hidden")}
                    </Badge>
                    <Badge color="gray" variant="outline">
                      {person.contactAllowed
                        ? translatePeople("contactOk")
                        : translatePeople("contactPrivate")}
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
              <Text fw={700}>{translatePeople("noPeopleMatch")}</Text>
              <Text size="sm" c="dimmed" mt={4}>
                {translatePeople("noPeopleMatchDescription")}
              </Text>
            </Paper>
          )}
        </Stack>
      </Paper>
    </ApplicationShell>
  );
}
