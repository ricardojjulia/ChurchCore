"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Timeline,
  Title,
} from "@mantine/core";
import {
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Database,
  DollarSign,
  HeartHandshake,
  Info,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { ChurchAppContextBanner } from "@/components/application/church-app-context-banner";
import { useI18n } from "@/components/i18n-provider";
import type { ChurchAppSession } from "@/lib/auth";

import { hydrateSandboxDataAction } from "@/app/app/church-admin/onboarding/actions";

interface OnboardingWorkspaceProps {
  session: ChurchAppSession;
  isSandbox: boolean;
}

export function OnboardingWorkspace({
  session,
  isSandbox,
}: OnboardingWorkspaceProps) {
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();
  const [hydrationStatus, setHydrationStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  function handleHydration() {
    startTransition(async () => {
      setHydrationStatus(null);
      const res = await hydrateSandboxDataAction();
      if (res.ok) {
        setHydrationStatus({
          type: "success",
          message: "Sandbox successfully pre-hydrated with mock members, events, donations, and volunteer schedules!",
        });
      } else {
        setHydrationStatus({
          type: "error",
          message: res.error ?? "Failed to pre-hydrate sandbox data.",
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
      title="Onboarding Dashboard"
      description="System Setup & Sandbox Configuration"
      sidebarTitle="Onboarding Steps"
      sidebarDescription="Complete setup tasks or configure sandbox."
      navLabel={t("portalNav", "churchAdmin")}
      navItems={[
        {
          href: "/app/church-admin",
          label: t("portalNav", "home"),
          description: t("portalNav", "operations"),
          icon: HeartHandshake,
        },
        {
          href: "/app/church-admin/readiness",
          label: t("portalNav", "readiness"),
          description: t("portalNav", "readinessDescription"),
          icon: ClipboardCheck,
        },
        {
          href: "/app/church-admin/settings",
          label: t("portalNav", "settings"),
          description: t("portalNav", "churchSetup"),
          icon: Settings,
        },
        {
          href: "/app/church-admin/accounts",
          label: t("portalNav", "accountRequests"),
          description: t("portalNav", "accountRequestsDescription"),
          icon: UserPlus,
        },
        {
          href: "/app/church-admin/people",
          label: t("portalNav", "people"),
          description: t("portalNav", "peopleDescription"),
          icon: UsersRound,
        },
        {
          href: "/app/church-admin/events",
          label: t("portalNav", "events"),
          description: t("portalNav", "eventsDescription"),
          icon: ClipboardCheck,
        },
        {
          href: "/app/church-admin/children",
          label: t("portalNav", "childrenMinistry"),
          description: t("portalNav", "childrenMinistryDescription"),
          icon: ShieldCheck,
        },
        {
          href: "/app/church-admin/volunteers",
          label: t("portalNav", "volunteers"),
          description: t("portalNav", "volunteersDescription"),
          icon: Users,
        },
        {
          href: "/app/church-admin/giving",
          label: t("portalNav", "givingOps"),
          description: t("portalNav", "givingOpsDescription"),
          icon: DollarSign,
        },
        {
          href: "/app/reports",
          label: t("portalNav", "reports"),
          description: t("portalNav", "reportsDescription"),
          icon: BarChart3,
        },
      ]}
    >
      <ChurchAppContextBanner session={session} />

      <Paper withBorder radius="xl" p="xl">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" gap="lg">
            <div>
              <Badge color={isSandbox ? "yellow" : "teal"} variant="light" mb="sm">
                {isSandbox ? "Sandbox Trial Mode" : "Production Mode"}
              </Badge>
              <Title order={1}>ChurchCore Setup Checklist</Title>
              <Text c="dimmed" mt="xs" maw={720}>
                Follow these setup steps to launch your church operations, approve members, and configure financial designate allocations.
              </Text>
            </div>
          </Group>
        </Stack>
      </Paper>

      {isSandbox && (
        <Card withBorder padding="xl" radius="xl" bg="#fafbfc">
          <Stack gap="md">
            <Group gap="sm">
              <ThemeIcon color="yellow" variant="light" radius="xl" size="lg">
                <Database size={18} />
              </ThemeIcon>
              <div>
                <Title order={2} size="h3">Mock Sandbox Hydration</Title>
                <Text size="sm" c="dimmed">
                  Instantly pre-populate your sandbox church with mock members, upcoming calendar events, volunteer schedules, and financial designates.
                </Text>
              </div>
            </Group>

            {hydrationStatus && (
              <Alert
                color={hydrationStatus.type === "success" ? "green" : "red"}
                icon={<Info size={16} />}
              >
                {hydrationStatus.message}
              </Alert>
            )}

            <div>
              <Button
                onClick={handleHydration}
                loading={isPending}
                color="yellow"
                radius="xl"
              >
                Pre-Hydrate Sandbox Data
              </Button>
            </div>
          </Stack>
        </Card>
      )}

      <Paper withBorder radius="xl" p="xl">
        <Title order={2} size="h3" mb="lg">Setup Checklist Tasks</Title>

        <Timeline active={0} bulletSize={24} lineWidth={2}>
          <Timeline.Item bullet={<Settings size={12} />} title="Configure Church Profile & Settings">
            <Text c="dimmed" size="sm" mt={4}>
              Set up your public church settings, name, website, contacts, and locale templates.
            </Text>
            <Button
              component="a"
              href="/app/church-admin/settings"
              variant="light"
              size="xs"
              mt="xs"
              radius="xl"
            >
              Configure Settings
            </Button>
          </Timeline.Item>

          <Timeline.Item bullet={<UsersRound size={12} />} title="Hydrate Roster & People Directory">
            <Text c="dimmed" size="sm" mt={4}>
              Import members or approve portal requests to populate your directory database.
            </Text>
            <Group gap="xs" mt="xs">
              <Button
                component="a"
                href="/app/church-admin/people"
                variant="light"
                size="xs"
                radius="xl"
              >
                Manage People
              </Button>
              <Button
                component="a"
                href="/app/church-admin/accounts"
                variant="light"
                size="xs"
                radius="xl"
              >
                Portal Requests
              </Button>
            </Group>
          </Timeline.Item>

          <Timeline.Item bullet={<ClipboardCheck size={12} />} title="Define Calendar Events & Scheduling">
            <Text c="dimmed" size="sm" mt={4}>
              Create Sunday services, small groups, and assign volunteer shift positions.
            </Text>
            <Group gap="xs" mt="xs">
              <Button
                component="a"
                href="/app/church-admin/events"
                variant="light"
                size="xs"
                radius="xl"
              >
                Create Events
              </Button>
              <Button
                component="a"
                href="/app/church-admin/volunteers"
                variant="light"
                size="xs"
                radius="xl"
              >
                Volunteer Schedule
              </Button>
            </Group>
          </Timeline.Item>

          <Timeline.Item bullet={<DollarSign size={12} />} title="Establish Giving Operations & Funds">
            <Text c="dimmed" size="sm" mt={4}>
              Connect Stripe payment intents and configure fund ledger accounts for reconciliation.
            </Text>
            <Button
              component="a"
              href="/app/church-admin/giving"
              variant="light"
              size="xs"
              mt="xs"
              radius="xl"
            >
              Giving Dashboard
            </Button>
          </Timeline.Item>

          <Timeline.Item bullet={<CheckCircle2 size={12} />} title="Run Weekly Readiness Verifications">
            <Text c="dimmed" size="sm" mt={4}>
              Ensure volunteer rosters and financial ledgers are fully aligned before Sunday service begins.
            </Text>
            <Button
              component="a"
              href="/app/church-admin/readiness"
              variant="light"
              size="xs"
              mt="xs"
              radius="xl"
            >
              Verify Weekly Readiness
            </Button>
          </Timeline.Item>
        </Timeline>
      </Paper>
    </ApplicationShell>
  );
}
