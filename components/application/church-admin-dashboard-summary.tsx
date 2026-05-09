"use client";

import Link from "next/link";
import {
  CalendarCheck,
  DollarSign,
  MoveRight,
  Sparkles,
  UsersRound,
} from "lucide-react";
import {
  Badge,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";

import type { ChurchAdminDashboardSummary } from "@/lib/church-admin-dashboard-data";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function ChurchAdminDashboardSummaryCards({
  summary,
}: {
  summary: ChurchAdminDashboardSummary;
}) {
  const cards = [
    {
      label: "People",
      value: summary.people.active.toLocaleString(),
      detail: `${summary.people.visitors} visitors · ${summary.people.incomplete} incomplete`,
      icon: UsersRound,
      href: "/app/church-admin/people",
    },
    {
      label: "Ministries",
      value: summary.ministries.total.toLocaleString(),
      detail: `${summary.ministries.assignments} assignments · ${summary.ministries.withoutLeader} need leaders`,
      icon: Sparkles,
      href: "/app/church-admin/ministry",
    },
    {
      label: "Events",
      value: summary.events.upcoming.toLocaleString(),
      detail: `${summary.events.next14Days} in 14 days · ${summary.events.withoutRoster} without roster`,
      icon: CalendarCheck,
      href: "/app/church-admin/events",
    },
    {
      label: "Giving",
      value: formatCurrency(summary.giving.last30DaysCents),
      detail: `${summary.giving.giftCount} gifts in last 30 days`,
      icon: DollarSign,
      href: "/app/church-admin/giving",
    },
  ];

  return (
    <Paper withBorder radius="xl" p="xl">
      <Group justify="space-between" align="center" mb="lg">
        <div>
          <Badge color={summary.source === "live" ? "teal" : "gray"} variant="light" mb="sm">
            {summary.source === "live" ? "Live tenant data" : "Preview"}
          </Badge>
          <Title order={2}>Admin dashboard</Title>
        </div>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="md">
        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <Paper
              key={card.label}
              component={Link}
              href={card.href}
              aria-label={`Open ${card.label}`}
              withBorder
              radius="xl"
              p="lg"
              bg="#f8fbff"
              style={{ color: "inherit", textDecoration: "none" }}
            >
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                    {card.label}
                  </Text>
                  <ThemeIcon color="gray" variant="light" radius="xl">
                    <Icon size={16} />
                  </ThemeIcon>
                </Group>
                <Title order={3}>{card.value}</Title>
                <Text size="sm" c="dimmed">
                  {card.detail}
                </Text>
                <Group gap={6} align="center">
                  <Text size="sm" fw={700} c="churchBlue">
                    Open
                  </Text>
                  <MoveRight size={16} color="var(--mantine-color-churchBlue-6)" />
                </Group>
              </Stack>
            </Paper>
          );
        })}
      </SimpleGrid>
    </Paper>
  );
}
