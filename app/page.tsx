"use client";

import Link from "next/link";
import {
  Badge,
  Box,
  Button,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Church,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { LanguageSelect } from "@/components/language-select";
import { useI18n } from "@/components/i18n-provider";

const SIGNALS = [
  { icon: UsersRound, labelKey: "signalPeople", value: "428" },
  { icon: CalendarDays, labelKey: "signalEvents", value: "36" },
  { icon: HeartHandshake, labelKey: "signalCare", value: "12" },
] as const;

const LANES = [
  { labelKey: "laneWorship", tone: "#5eead4", width: "84%" },
  { labelKey: "lanePrayer", tone: "#f4c95d", width: "62%" },
  { labelKey: "laneVolunteers", tone: "#60a5fa", width: "76%" },
] as const;

export default function Home() {
  const { t } = useI18n();

  return (
    <Box
      className="public-home-shell"
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 18% 18%, rgba(94, 234, 212, 0.16), transparent 26%), radial-gradient(circle at 82% 12%, rgba(244, 201, 93, 0.18), transparent 23%), linear-gradient(135deg, #f8fafc 0%, #eef3f8 48%, #f7f7f0 100%)",
      }}
    >
      <Container size="xl" py={{ base: 18, md: 28 }}>
        <Group justify="space-between" align="center" mb={{ base: 30, md: 58 }}>
          <Group gap="sm" wrap="nowrap">
            <Box
              style={{
                display: "grid",
                placeItems: "center",
                width: 42,
                height: 42,
                borderRadius: 14,
                background: "#101827",
                color: "#f4c95d",
                boxShadow: "0 16px 34px rgba(16, 24, 39, 0.18)",
              }}
            >
              <Church size={22} strokeWidth={2.1} />
            </Box>
            <Text fw={800} size="lg" c="#101827">
              Church Core
            </Text>
          </Group>

          <Group gap="sm" justify="flex-end">
            <LanguageSelect />
            <Button component={Link} href="/sign-in" variant="white" radius="xl">
              {t("publicHome", "signIn")}
            </Button>
            <Button
              component={Link}
              href="/sign-in?redirectTo=/control&force=1"
              variant="outline"
              radius="xl"
              color="dark"
            >
              {t("publicHome", "control")}
            </Button>
          </Group>
        </Group>

        <SimpleGrid
          cols={{ base: 1, md: 2 }}
          spacing={{ base: 32, md: 48 }}
          verticalSpacing={36}
          style={{ alignItems: "center" }}
        >
          <Stack gap="xl" maw={660}>
            <Badge
              leftSection={<Sparkles size={14} />}
              variant="light"
              color="teal"
              radius="sm"
              size="lg"
              style={{ alignSelf: "flex-start", letterSpacing: 0 }}
            >
              {t("publicHome", "eyebrow")}
            </Badge>

            <Stack gap="md">
              <Title
                order={1}
                style={{
                  color: "#101827",
                  fontSize: "clamp(3rem, 7vw, 6.7rem)",
                  lineHeight: 0.91,
                  letterSpacing: 0,
                  maxWidth: 720,
                }}
              >
                {t("publicHome", "headline")}
              </Title>
              <Text
                size="xl"
                c="#405064"
                maw={590}
                style={{ lineHeight: 1.55 }}
              >
                {t("publicHome", "tagline")}
              </Text>
            </Stack>

            <Group gap="sm">
              <Button
                component={Link}
                href="/sign-in"
                radius="xl"
                size="md"
                color="dark"
                rightSection={<ArrowRight size={17} />}
              >
                {t("publicHome", "primaryAction")}
              </Button>
              <Button
                component={Link}
                href="/portal"
                radius="xl"
                size="md"
                variant="default"
              >
                {t("publicHome", "portalAction")}
              </Button>
            </Group>

            <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="sm" maw={620}>
              {SIGNALS.map((signal) => {
                const Icon = signal.icon;

                return (
                  <Box
                    key={signal.labelKey}
                    style={{
                      border: "1px solid rgba(16, 24, 39, 0.1)",
                      borderRadius: 8,
                      padding: "14px 16px",
                      background: "rgba(255, 255, 255, 0.74)",
                    }}
                  >
                    <Group gap="xs" mb={8}>
                      <Icon size={16} color="#0f766e" />
                      <Text size="xs" tt="uppercase" fw={800} c="#617184">
                        {t("publicHome", signal.labelKey)}
                      </Text>
                    </Group>
                    <Text size="xl" fw={850} c="#101827">
                      {signal.value}
                    </Text>
                  </Box>
                );
              })}
            </SimpleGrid>
          </Stack>

          <Box className="public-home-console" aria-hidden="true">
            <Box className="public-home-console-grid" />
            <Group justify="space-between" align="center" mb={28}>
              <Group gap="xs">
                <Box className="console-dot" style={{ background: "#5eead4" }} />
                <Box className="console-dot" style={{ background: "#f4c95d" }} />
                <Box className="console-dot" style={{ background: "#60a5fa" }} />
              </Group>
              <Badge color="teal" variant="light" radius="sm">
                {t("publicHome", "consoleStatus")}
              </Badge>
            </Group>

            <Stack gap={18}>
              <Group justify="space-between" align="flex-start">
                <Stack gap={4}>
                  <Text c="#95a3b8" size="xs" tt="uppercase" fw={800}>
                    {t("publicHome", "consoleLabel")}
                  </Text>
                  <Text c="white" size="xl" fw={850}>
                    {t("publicHome", "consoleTitle")}
                  </Text>
                </Stack>
                <Box className="console-orbit">
                  <ShieldCheck size={28} color="#5eead4" />
                </Box>
              </Group>

              <SimpleGrid cols={3} spacing="sm">
                {SIGNALS.map((signal) => (
                  <Box key={signal.value} className="console-metric">
                    <Text c="#95a3b8" size="xs">
                      {t("publicHome", signal.labelKey)}
                    </Text>
                    <Text c="white" size="xl" fw={850}>
                      {signal.value}
                    </Text>
                  </Box>
                ))}
              </SimpleGrid>

              <Stack gap="sm">
                {LANES.map((lane) => (
                  <Box key={lane.labelKey} className="console-lane">
                    <Group justify="space-between" mb={8}>
                      <Text c="#d9e3ef" size="sm" fw={700}>
                        {t("publicHome", lane.labelKey)}
                      </Text>
                      <Activity size={16} color={lane.tone} />
                    </Group>
                    <Box className="console-track">
                      <Box
                        className="console-track-fill"
                        style={{ width: lane.width, background: lane.tone }}
                      />
                    </Box>
                  </Box>
                ))}
              </Stack>

              <Box className="console-scripture">
                <Text c="#f4c95d" fw={800} size="sm">
                  {t("publicHome", "faithLine")}
                </Text>
                <Text c="#b8c3d3" size="sm">
                  {t("publicHome", "faithSubline")}
                </Text>
              </Box>
            </Stack>
          </Box>
        </SimpleGrid>
      </Container>
    </Box>
  );
}
