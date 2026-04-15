"use client";

import { useTransition } from "react";
import { BellRing, DollarSign, HeartHandshake, MailCheck, Sparkles, UsersRound } from "lucide-react";
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
import type { ChurchAppSession } from "@/lib/auth";
import type { ChurchAdminAccountsData } from "@/lib/church-admin-accounts-data";

function formatRequestedDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
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

  function handleApprove(requestId: string) {
    startTransition(async () => {
      try {
        const result = await approveAccountRequestAction({ requestId });
        notifications.show({
          title: result.invited ? "Invite sent" : "Request approved",
          message: result.previewMode
            ? "The request was approved, but invite delivery requires a tenant service-role key."
            : "The member was approved and the portal invitation was queued.",
          color: result.previewMode ? "orange" : "teal",
        });
      } catch (error) {
        notifications.show({
          title: "Approval failed",
          message: error instanceof Error ? error.message : "The request could not be approved.",
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
          title: "Request rejected",
          message: "The pending request was removed from the queue.",
          color: "gray",
        });
      } catch (error) {
        notifications.show({
          title: "Rejection failed",
          message: error instanceof Error ? error.message : "The request could not be rejected.",
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
      sectionLabel="ChurchAdmin"
      title="Portal Requests"
      description={session.appContext.church.name}
      sidebarTitle="Accounts"
      sidebarDescription="Review and approve member portal access."
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
        },
        {
          href: "/app/church-admin/accounts",
          label: "Accounts",
          description: "Portal approvals",
          icon: MailCheck,
          active: true,
        },
        {
          href: "/app/communications",
          label: "Communications",
          description: "Broadcast and messaging",
          icon: BellRing,
        },
        {
          href: "/app/giving",
          label: "Giving",
          description: "Donations dashboard",
          icon: DollarSign,
        },
        {
          href: "/app/church-admin/ministry/overview",
          label: "Ministry Forge",
          description: "Health, vision, and impact",
          icon: Sparkles,
        },
      ]}
    >
      <ChurchAppContextBanner session={session} />

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Pending
          </Text>
          <Title order={3} mt="xs">
            {data.pendingCount}
          </Title>
        </Paper>
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Existing member match
          </Text>
          <Title order={3} mt="xs">
            {data.existingMemberCount}
          </Title>
        </Paper>
        <Paper withBorder radius="xl" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Manual review
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
              Approval queue
            </Title>
            <Text size="sm" c="dimmed">
              Approvals generate a member number and send a Supabase invitation when the tenant admin key is configured.
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
                        {request.isExistingMember ? "Existing member match" : "Manual review"}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed">
                      {request.email}
                      {request.phone ? ` • ${request.phone}` : ""}
                    </Text>
                    <Text size="sm" c="dimmed">
                      Requested {formatRequestedDate(request.createdAt)}
                    </Text>
                    {request.linkedProfileName ? (
                      <Text size="sm">
                        Linked profile: {request.linkedProfileName}
                        {request.linkedMemberNumber ? ` • ${request.linkedMemberNumber}` : ""}
                        {request.linkedAccountStatus ? ` • ${request.linkedAccountStatus}` : ""}
                      </Text>
                    ) : (
                      <Text size="sm" c="dimmed">
                        No linked member profile yet. Approval will create one.
                      </Text>
                    )}
                  </Stack>

                  <Group gap="sm">
                    <Button
                      variant="default"
                      onClick={() => handleReject(request.id)}
                      loading={isPending}
                    >
                      Reject
                    </Button>
                    <Button onClick={() => handleApprove(request.id)} loading={isPending}>
                      Approve
                    </Button>
                  </Group>
                </Group>
              </Paper>
            ))
          ) : (
            <Text size="sm" c="dimmed">
              No pending portal requests right now.
            </Text>
          )}
        </Stack>
      </Paper>
    </ApplicationShell>
  );
}
