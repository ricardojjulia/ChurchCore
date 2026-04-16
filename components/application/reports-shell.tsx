import Link from "next/link";
import { Button, Group } from "@mantine/core";
import {
  BarChart2,
  CalendarRange,
  LayoutGrid,
  TrendingUp,
  UsersRound,
} from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import type { ReportTimeRange } from "@/lib/reports-data";

const RANGE_OPTIONS: Array<{ value: ReportTimeRange; label: string }> = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "365d", label: "12 months" },
];

export function ReportsShell({
  session,
  title,
  description,
  activePath,
  range,
  children,
}: {
  session: ChurchAppSession;
  title: string;
  description: string;
  activePath: "/app/reports" | "/app/reports/members" | "/app/reports/events" | "/app/reports/giving";
  range: ReportTimeRange;
  children: React.ReactNode;
}) {
  const workspaceHref =
    session.appContext.roleId === "church-admin" ? "/app/church-admin" : "/app/pastor";

  return (
    <ApplicationShell
      session={session}
      workspaceHref={workspaceHref}
      calendarHref="/app/calendar"
      sectionLabel="Reports"
      title={title}
      description={description}
      sidebarTitle="Reporting Suite"
      sidebarDescription="Graphical stewardship reporting across members, events, and giving."
      navLabel="Reports"
      navItems={[
        {
          href: "/app/reports",
          label: "Overview",
          description: "Executive view",
          icon: LayoutGrid,
          active: activePath === "/app/reports",
        },
        {
          href: "/app/reports/members",
          label: "Members",
          description: "Attendance and drift",
          icon: UsersRound,
          active: activePath === "/app/reports/members",
        },
        {
          href: "/app/reports/events",
          label: "Events",
          description: "Turnout and pressure",
          icon: CalendarRange,
          active: activePath === "/app/reports/events",
        },
        {
          href: "/app/reports/giving",
          label: "Giving",
          description: "Generosity and funds",
          icon: BarChart2,
          active: activePath === "/app/reports/giving",
        },
      ]}
      topActions={
        <Group gap="xs">
          {RANGE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              component={Link}
              href={`${activePath}?range=${option.value}`}
              variant={range === option.value ? "filled" : "light"}
              color={range === option.value ? "churchBlue" : "gray"}
              radius="xl"
              size="xs"
              leftSection={<TrendingUp size={13} />}
            >
              {option.label}
            </Button>
          ))}
        </Group>
      }
    >
      {children}
    </ApplicationShell>
  );
}
