"use client";

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  HeartHandshake,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  UsersRound,
  XCircle,
} from "lucide-react";
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

import { ApplicationShell } from "@/components/application/app-shell";
import { ChurchAppContextBanner } from "@/components/application/church-app-context-banner";
import { useI18n } from "@/components/i18n-provider";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  ChurchAdminReadinessData,
  ChurchAdminReadinessItem,
  ReadinessStatus,
} from "@/lib/church-admin-readiness-data";

const statusMeta: Record<
  ReadinessStatus,
  {
    labelKey: string;
    color: string;
    icon: React.ComponentType<{ size?: number }>;
  }
> = {
  ready: {
    labelKey: "ready",
    color: "teal",
    icon: CheckCircle2,
  },
  attention: {
    labelKey: "review",
    color: "yellow",
    icon: AlertTriangle,
  },
  blocked: {
    labelKey: "blocked",
    color: "red",
    icon: XCircle,
  },
};

function plural(value: number) {
  return value === 1 ? "" : "s";
}

function spanishPlural(value: number) {
  return value === 1 ? "" : "s";
}

function numbersFromDetail(detail: string) {
  return (detail.match(/\d+/g) ?? []).map(Number);
}

function translateReadinessItem(
  item: ChurchAdminReadinessItem,
  source: ChurchAdminReadinessData["source"],
  locale: string,
  t: (namespace: "readiness", key: string, values?: Record<string, string | number>) => string,
) {
  const itemKeys: Record<string, { title: string; description: string; preview: string }> = {
    "church-setup": {
      title: "churchSetupTitle",
      description: "churchSetupDescription",
      preview: "detailPreviewChurchSetup",
    },
    "portal-requests": {
      title: "accountRequestsTitle",
      description: "accountRequestsDescription",
      preview: "detailPreviewAccountRequests",
    },
    "people-households": {
      title: "peopleTitle",
      description: "peopleDescription",
      preview: "detailPreviewPeople",
    },
    "weekend-events": {
      title: "weekendTitle",
      description: "weekendDescription",
      preview: "detailPreviewWeekend",
    },
    "children-ministry": {
      title: "childrenTitle",
      description: "childrenDescription",
      preview: "detailPreviewChildren",
    },
    "volunteer-schedule": {
      title: "volunteerTitle",
      description: "volunteerDescription",
      preview: "detailPreviewVolunteer",
    },
    "giving-finance": {
      title: "givingTitle",
      description: "givingDescription",
      preview: "detailPreviewGiving",
    },
    reports: {
      title: "reportsTitle",
      description: "reportsDescription",
      preview: "detailPreviewReports",
    },
    "suggested-workflows": {
      title: "workflowsTitle",
      description: "workflowsDescription",
      preview: "detailPreviewWorkflows",
    },
  };
  const keys = itemKeys[item.id];
  const title = keys ? t("readiness", keys.title) : item.title;
  const description = keys ? t("readiness", keys.description) : item.description;

  if (locale !== "es") {
    return { title, description, detail: item.detail };
  }

  if (source === "preview" && keys) {
    return { title, description, detail: t("readiness", keys.preview) };
  }

  const values = numbersFromDetail(item.detail);
  if (item.id === "church-setup") {
    const count = values[0] ?? 0;
    return {
      title,
      description,
      detail: count === 0
        ? t("readiness", "churchSetupReady")
        : t("readiness", "churchSetupTodo", {
            count,
            plural: spanishPlural(count),
            pluralVerb: count === 1 ? "" : "n",
          }),
    };
  }
  if (item.id === "portal-requests") {
    const count = values[0] ?? 0;
    return {
      title,
      description,
      detail: count === 0
        ? "No hay solicitudes de cuenta pendientes."
        : `${count} solicitud${spanishPlural(count)} de cuenta pendiente${spanishPlural(count)}.`,
    };
  }
  if (item.id === "people-households") {
    const profiles = values[0] ?? 0;
    const households = values[1] ?? 0;
    return {
      title,
      description,
      detail: t("readiness", "peopleReady", {
        profiles,
        profilesPlural: spanishPlural(profiles),
        households,
        householdsPlural: spanishPlural(households),
      }),
    };
  }
  if (item.id === "weekend-events") {
    const events = values[0] ?? 0;
    const withoutRosters = values[1] ?? 0;
    return {
      title,
      description,
      detail: events === 0
        ? t("readiness", "weekendNoEvents")
        : t("readiness", "weekendReady", {
            events,
            eventsPlural: spanishPlural(events),
            withoutRosters,
          }),
    };
  }
  if (item.id === "children-ministry") {
    const services = values[0] ?? 0;
    const volunteers = values[1] ?? 0;
    const followups = values[2] ?? 0;
    return {
      title,
      description,
      detail: item.detail.startsWith("No open")
        ? t("readiness", "childrenNoOpen")
        : t("readiness", "childrenReady", {
            services,
            servicesPlural: spanishPlural(services),
            volunteers,
            volunteersPlural: spanishPlural(volunteers),
            followups,
            followupsPlural: spanishPlural(followups),
          }),
    };
  }
  if (item.id === "volunteer-schedule") {
    const open = values[0] ?? 0;
    const unassigned = values[1] ?? 0;
    return {
      title,
      description,
      detail: t("readiness", "volunteerReady", {
        open,
        openPlural: spanishPlural(open),
        unassigned,
      }),
    };
  }
  if (item.id === "giving-finance") {
    const failed = values[0] ?? 0;
    const unposted = values[1] ?? 0;
    const journals = values[2] ?? 0;
    const pages = values[3] ?? 0;
    return {
      title,
      description,
      detail: t("readiness", "givingReady", {
        failed,
        failedPlural: spanishPlural(failed),
        unposted,
        unpostedPlural: spanishPlural(unposted),
        journals,
        journalsPlural: spanishPlural(journals),
        pages,
        pagesPlural: spanishPlural(pages),
      }),
    };
  }
  if (item.id === "reports") {
    const profiles = values[0] ?? 0;
    const events = values[1] ?? 0;
    const gifts = values[2] ?? 0;
    const journals = values[3] ?? 0;
    const budgets = values[4] ?? 0;
    return {
      title,
      description,
      detail: t("readiness", "reportsReady", {
        profiles,
        profilesPlural: spanishPlural(profiles),
        events,
        eventsPlural: spanishPlural(events),
        gifts,
        giftsPlural: spanishPlural(gifts),
        journals,
        journalsPlural: spanishPlural(journals),
        budgets,
        budgetsPlural: spanishPlural(budgets),
      }),
    };
  }
  if (item.id === "suggested-workflows") {
    const count = values[0] ?? 0;
    return {
      title,
      description,
      detail: count === 0
        ? t("readiness", "workflowsNone")
        : t("readiness", "workflowsOpen", {
            count,
            plural: plural(count),
          }),
    };
  }

  return { title, description, detail: item.detail };
}

function ReadinessCard({
  item,
  source,
}: {
  item: ChurchAdminReadinessItem;
  source: ChurchAdminReadinessData["source"];
}) {
  const { locale, t } = useI18n();
  const meta = statusMeta[item.status];
  const Icon = meta.icon;
  const translated = translateReadinessItem(item, source, locale, t);

  return (
    <Paper withBorder radius="lg" p="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" gap="md">
          <Group gap="sm" align="flex-start">
            <ThemeIcon color={meta.color} variant="light" radius="xl" size="lg">
              <Icon size={18} />
            </ThemeIcon>
            <div>
              <Group gap="xs" mb={4}>
                <Text fw={700}>{translated.title}</Text>
                <Badge color={meta.color} variant="light">
                  {t("readiness", meta.labelKey)}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {translated.description}
              </Text>
            </div>
          </Group>
        </Group>

        <Text size="sm">{translated.detail}</Text>

        <Button component="a" href={item.href} variant="default" radius="xl" size="sm">
          {t("readiness", "openWorkflow")}
        </Button>
      </Stack>
    </Paper>
  );
}

export function ChurchAdminReadinessWorkspace({
  session,
  data,
}: {
  session: ChurchAppSession;
  data: ChurchAdminReadinessData;
}) {
  const { t } = useI18n();
  const overallStatus =
    data.blockedCount > 0
      ? t("readiness", "blockedOverall")
      : data.attentionCount > 0
        ? t("readiness", "overallAttention")
        : t("readiness", "overallReady");

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="ChurchAdmin"
      title={t("readiness", "title")}
      description={session.appContext.church.name}
      sidebarTitle={t("readiness", "mvpOperatingPath")}
      sidebarDescription={t("readiness", "useThisPath")}
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
          active: true,
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
        <Group justify="space-between" align="flex-start" gap="lg">
          <div>
            <Badge color={data.source === "live" ? "teal" : "gray"} variant="light" mb="sm">
              {data.source === "live" ? t("readiness", "dataLive") : t("readiness", "dataPreview")}
            </Badge>
            <Title order={1}>{t("readiness", "titleLower")}</Title>
            <Text c="dimmed" mt="sm" maw={720}>
              {t("readiness", "useThisPath")}
            </Text>
          </div>
          <Button component="a" href="/app/church-admin" radius="xl" variant="default">
            {t("readiness", "backToDashboard")}
          </Button>
        </Group>
      </Paper>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <Paper withBorder radius="lg" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            {t("readiness", "ready")}
          </Text>
          <Title order={2} mt={4}>
            {data.readyCount}
          </Title>
        </Paper>
        <Paper withBorder radius="lg" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            {t("readiness", "needsReview")}
          </Text>
          <Title order={2} mt={4}>
            {data.attentionCount}
          </Title>
        </Paper>
        <Paper withBorder radius="lg" p="lg">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            {t("readiness", "blocked")}
          </Text>
          <Title order={2} mt={4}>
            {data.blockedCount}
          </Title>
        </Paper>
      </SimpleGrid>

      <Paper withBorder radius="xl" p="xl">
        <Group gap="sm" mb="lg">
          <ThemeIcon color={data.blockedCount > 0 ? "red" : "teal"} variant="light" radius="xl" size="lg">
            {data.blockedCount > 0 ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
          </ThemeIcon>
          <div>
            <Title order={2} size="h3">
              {t("readiness", "mvpOperatingPath")}
            </Title>
            <Text size="sm" c="dimmed">
              {overallStatus}
            </Text>
          </div>
        </Group>

        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
          {data.items.map((item) => (
            <ReadinessCard key={item.id} item={item} source={data.source} />
          ))}
        </SimpleGrid>
      </Paper>
    </ApplicationShell>
  );
}
