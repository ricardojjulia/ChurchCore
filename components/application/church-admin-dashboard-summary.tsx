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
  Box,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";

import { useI18n } from "@/components/i18n-provider";
import type { ChurchAdminDashboardSummary } from "@/lib/church-admin-dashboard-data";

function formatCurrency(cents: number, locale: string) {
  return new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US", {
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
  const { locale, t } = useI18n();
  const formatNumber = (value: number) =>
    value.toLocaleString(locale === "es" ? "es-US" : "en-US");
  const cards = [
    {
      label: t("dashboardSummary", "people"),
      value: formatNumber(summary.people.active),
      detail: `${formatNumber(summary.people.visitors)} ${t("dashboardSummary", "visitors")} · ${formatNumber(summary.people.incomplete)} ${t("dashboardSummary", "incomplete")}`,
      icon: UsersRound,
      href: "/app/church-admin/people",
      accent: "#5eead4",
      glow: "rgba(94, 234, 212, 0.2)",
    },
    {
      label: t("dashboardSummary", "ministries"),
      value: formatNumber(summary.ministries.total),
      detail: `${formatNumber(summary.ministries.assignments)} ${t("dashboardSummary", "assignments")} · ${formatNumber(summary.ministries.withoutLeader)} ${t("dashboardSummary", "needLeaders")}`,
      icon: Sparkles,
      href: "/app/church-admin/ministry",
      accent: "#f4c95d",
      glow: "rgba(244, 201, 93, 0.2)",
    },
    {
      label: t("dashboardSummary", "events"),
      value: formatNumber(summary.events.upcoming),
      detail: `${formatNumber(summary.events.next14Days)} ${t("dashboardSummary", "in14Days")} · ${formatNumber(summary.events.withoutRoster)} ${t("dashboardSummary", "withoutRoster")}`,
      icon: CalendarCheck,
      href: "/app/church-admin/events",
      accent: "#60a5fa",
      glow: "rgba(96, 165, 250, 0.2)",
    },
    {
      label: t("dashboardSummary", "giving"),
      value: formatCurrency(summary.giving.last30DaysCents, locale),
      detail: t("dashboardSummary", "giftsLast30", {
        count: formatNumber(summary.giving.giftCount),
        plural: summary.giving.giftCount === 1 ? "" : "es",
      }),
      icon: DollarSign,
      href: "/app/church-admin/giving",
      accent: "#a78bfa",
      glow: "rgba(167, 139, 250, 0.22)",
    },
  ];

  return (
    <Paper
      radius="lg"
      p={{ base: "lg", md: "xl" }}
      style={{
        background:
          "linear-gradient(135deg, #101827 0%, #172033 58%, #0f766e 145%)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        boxShadow: "0 24px 70px rgba(16, 24, 39, 0.18)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <Box
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
          maskImage: "linear-gradient(90deg, black, transparent 72%)",
        }}
      />

      <Group
        justify="space-between"
        align="flex-start"
        mb="lg"
        style={{ position: "relative", zIndex: 1 }}
      >
        <div>
          <Badge
            color={summary.source === "live" ? "teal" : "gray"}
            variant="filled"
            radius="sm"
            mb="sm"
          >
            {summary.source === "live"
              ? t("dashboardSummary", "liveTenantData")
              : t("dashboardSummary", "preview")}
          </Badge>
          <Title order={2} c="white">
            {t("dashboardSummary", "adminDashboard")}
          </Title>
          <Text c="rgba(255, 255, 255, 0.66)" size="sm" mt={6}>
            {t("dashboardSummary", "focusLine")}
          </Text>
        </div>
      </Group>

      <SimpleGrid
        cols={{ base: 1, sm: 2, xl: 4 }}
        spacing="md"
        style={{ position: "relative", zIndex: 1 }}
      >
        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <Paper
              key={card.label}
              component={Link}
              href={card.href}
              aria-label={`${t("dashboardSummary", "open")} ${card.label}`}
              withBorder
              radius="md"
              p="lg"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(247, 250, 252, 0.92))",
                borderColor: "rgba(255, 255, 255, 0.34)",
                boxShadow: `0 18px 40px ${card.glow}`,
                color: "inherit",
                overflow: "hidden",
                position: "relative",
                textDecoration: "none",
              }}
            >
              <Box
                aria-hidden="true"
                style={{
                  background: card.accent,
                  bottom: 0,
                  left: 0,
                  position: "absolute",
                  top: 0,
                  width: 5,
                }}
              />
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                    {card.label}
                  </Text>
                  <ThemeIcon
                    variant="light"
                    radius="md"
                    style={{ background: card.glow, color: "#101827" }}
                  >
                    <Icon size={16} />
                  </ThemeIcon>
                </Group>
                <Title order={3} size={32} c="#101827">
                  {card.value}
                </Title>
                <Text size="sm" c="dimmed">
                  {card.detail}
                </Text>
                <Group gap={6} align="center">
                  <Text size="sm" fw={700} c="churchBlue">
                    {t("dashboardSummary", "open")}
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
