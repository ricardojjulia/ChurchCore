"use client";

import { useTransition } from "react";
import { BarChart2, BellRing, DollarSign, HeartHandshake, MailCheck, Sparkles, UsersRound } from "lucide-react";
import {
  Badge,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";

import {
  approveAccountRequestAction,
  rejectAccountRequestAction,
} from "@/app/app/church-admin-actions";
import { ApplicationShell } from "@/components/application/app-shell";
import { ChurchAppContextBanner } from "@/components/application/church-app-context-banner";
import { ReadinessTargetState } from "@/components/application/readiness-target-state";
import { useI18n } from "@/components/i18n-provider";
import type { ChurchAppSession } from "@/lib/auth";
import type { ChurchAdminAccountsData } from "@/lib/church-admin-accounts-data";

function formatRequestedDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ChurchAdminAccountsWorkspace({
  session,
  data,
}: {
  session: ChurchAppSession;
  data: ChurchAdminAccountsData;
}) {
  const [isPending, startTransition] = useTransition();
  const { locale, t } = useI18n();
  const translateAccounts = (
    key: string,
    values?: Record<string, string | number>,
  ) => t("accountRequests", key, values);
  const readinessState =
    data.source === "preview"
      ? {
          state: "no-backend" as const,
          title: "Readiness target unavailable",
          description:
            "Portal account requests can be previewed, but live approval queue checks need tenant data.",
          detail: "Configure the tenant backend before using this target to clear readiness.",
        }
      : data.pendingRequests.length === 0
        ? {
            state: "completed" as const,
            title: "Portal account requests are clear",
            description: "No pending portal requests are waiting for review.",
          }
        : {
            state: "validation-error" as const,
            title: "Portal account requests need review",
            description:
              "Approve or reject the pending requests below before marking this readiness item complete.",
            detail: `${data.pendingRequests.length} request${
              data.pendingRequests.length === 1 ? "" : "s"
            } still need review.`,
          };

  function handleApprove(requestId: string) {
    startTransition(async () => {
      try {
        const result = await approveAccountRequestAction({ requestId });
        notifications.show({
          title: result.invited
            ? translateAccounts("inviteSent")
            : translateAccounts("requestApproved"),
          message: result.previewMode
            ? translateAccounts("previewApprovalMessage")
            : translateAccounts("approvalMessage"),
          color: result.previewMode ? "orange" : "teal",
        });
      } catch (error) {
        notifications.show({
          title: translateAccounts("approvalFailed"),
          message:
            error instanceof Error
              ? error.message
              : translateAccounts("approvalFailedMessage"),
          color: "red",
        });
      }
    });
  }

  function handleReject(requestId: string) {
    startTransition(async () => {
      try {
        await rejectAccountRequestAction({ requestId });
        notifications.show({
          title: translateAccounts("requestRejected"),
          message: translateAccounts("rejectionMessage"),
          color: "gray",
        });
      } catch (error) {
        notifications.show({
          title: translateAccounts("rejectionFailed"),
          message:
            error instanceof Error
              ? error.message
              : translateAccounts("rejectionFailedMessage"),
          color: "red",
        });
      }
    });
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel={t("portalNav", "churchAdmin")}
      title={translateAccounts("portalRequests")}
      description={session.appContext.church.name}
      sidebarTitle={translateAccounts("accounts")}
      sidebarDescription={translateAccounts("sidebarDescription")}
      navLabel={t("portalNav", "churchAdmin")}
      navItems={[
        {
          href: "/app/church-admin",
          label: t("portalNav", "home"),
          description: t("portalNav", "operations"),
          icon: HeartHandshake,
        },
        {
          href: "/app/church-admin/people",
          label: t("portalNav", "people"),
          description: t("portalNav", "peopleDescription"),
          icon: UsersRound,
        },
        {
          href: "/app/church-admin/accounts",
          label: translateAccounts("accounts"),
          description: t("portalNav", "accountRequestsDescription"),
          icon: MailCheck,
          active: true,
        },
        {
          href: "/app/communications",
          label: t("portalNav", "communications"),
          description: t("portalNav", "communicationsDescription"),
          icon: BellRing,
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
    >
      <ChurchAppContextBanner session={session} />

      <ReadinessTargetState
        {...readinessState}
        primaryAction={{ label: translateAccounts("backToReadiness"), href: "/app/church-admin/readiness" }}
      />

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            {translateAccounts("pending")}
          </Text>
          <Title order={3} mt="xs">
            {data.pendingCount}
          </Title>
        </Paper>
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            {translateAccounts("existingMemberMatch")}
          </Text>
          <Title order={3} mt="xs">
            {data.existingMemberCount}
          </Title>
        </Paper>
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            {translateAccounts("manualReview")}
          </Text>
          <Title order={3} mt="xs">
            {data.pendingCount - data.existingMemberCount}
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
              {translateAccounts("approvalQueue")}
            </Title>
            <Text size="sm" c="dimmed">
              {translateAccounts("approvalQueueDescription")}
            </Text>
          </div>
        </Group>

        <Stack gap="sm">
          {data.pendingRequests.length ? (
            data.pendingRequests.map((request) => (
              <Paper key={request.id} withBorder radius="xl" p="lg">
                <Group justify="space-between" align="flex-start" gap="md">
                  <Stack gap={6}>
                    <Group gap="xs" wrap="wrap">
                      <Text fw={600}>
                        {request.firstName} {request.lastName}
                      </Text>
                      <Badge color={request.isExistingMember ? "teal" : "yellow"} variant="light">
                        {request.isExistingMember
                          ? translateAccounts("existingMemberMatch")
                          : translateAccounts("manualReview")}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed">
                      {request.email}
                      {request.phone ? ` • ${request.phone}` : ""}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {translateAccounts("requestedAt", {
                        value: formatRequestedDate(request.createdAt, locale),
                      })}
                    </Text>
                    {request.linkedProfileName ? (
                      <Text size="sm">
                        {translateAccounts("linkedProfile", {
                          value: request.linkedProfileName,
                        })}
                        {request.linkedMemberNumber ? ` • ${request.linkedMemberNumber}` : ""}
                        {request.linkedAccountStatus ? ` • ${request.linkedAccountStatus}` : ""}
                      </Text>
                    ) : (
                      <Text size="sm" c="dimmed">
                        {translateAccounts("noLinkedProfile")}
                      </Text>
                    )}
                  </Stack>

                  <Group gap="sm">
                    <Button
                      variant="default"
                      onClick={() => handleReject(request.id)}
                      loading={isPending}
                    >
                      {translateAccounts("reject")}
                    </Button>
                    <Button onClick={() => handleApprove(request.id)} loading={isPending}>
                      {translateAccounts("approve")}
                    </Button>
                  </Group>
                </Group>
              </Paper>
            ))
          ) : (
            <Text size="sm" c="dimmed">
              {translateAccounts("noPendingRequests")}
            </Text>
          )}
        </Stack>
      </Paper>
    </ApplicationShell>
  );
}
