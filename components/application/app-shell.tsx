"use client";

import Link from "next/link";
import { useDisclosure } from "@mantine/hooks";
import {
  AppShell,
  AppShellHeader,
  AppShellMain,
  AppShellNavbar,
  AppShellSection,
  Badge,
  Box,
  Burger,
  Divider,
  Group,
  NavLink,
  Paper,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { LayoutGrid, ShieldCheck, Sparkles } from "lucide-react";

import { SessionControls } from "@/components/application/session-controls";
import type { AuthSession } from "@/lib/auth";

type ShellNavItem = {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  active?: boolean;
};

export function ApplicationShell({
  session,
  workspaceHref,
  calendarHref,
  sectionLabel,
  title,
  description,
  sidebarTitle,
  sidebarDescription,
  navLabel,
  navItems,
  topActions,
  children,
}: {
  session: AuthSession;
  workspaceHref: string;
  calendarHref?: string | null;
  sectionLabel: string;
  title: string;
  description: string;
  sidebarTitle: string;
  sidebarDescription: string;
  navLabel?: string;
  navItems: ShellNavItem[];
  topActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [opened, { toggle }] = useDisclosure(false);

  return (
    <AppShell
      header={{ height: 72 }}
      navbar={{ width: 264, breakpoint: "md", collapsed: { mobile: !opened } }}
      padding="lg"
      styles={{
        main: {
          background: "#f6f7f9",
          minHeight: "100vh",
        },
        navbar: {
          background: "#fbfcfe",
          borderRight: "1px solid rgba(20, 33, 61, 0.08)",
        },
        header: {
          background: "rgba(251, 252, 254, 0.96)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(20, 33, 61, 0.08)",
        },
      }}
    >
      <AppShellHeader px="lg">
        <Group h="100%" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="md" size="sm" />
            <Box>
              <Group gap="xs" mb={2}>
                <Badge variant="light" color="churchBlue" radius="sm">
                  {sectionLabel}
                </Badge>
              </Group>
              <Text fw={700} size="lg">
                {title}
              </Text>
              {description ? (
                <Text c="dimmed" size="sm" mt={2} maw={640}>
                  {description}
                </Text>
              ) : null}
            </Box>
          </Group>

          <Stack gap="sm" align="flex-end">
            {topActions}
            <SessionControls
              session={session}
              workspaceHref={workspaceHref}
              calendarHref={calendarHref}
            />
          </Stack>
        </Group>
      </AppShellHeader>

      <AppShellNavbar p="md">
        <AppShellSection>
          <Group justify="space-between" mb="lg">
            <Group gap="sm">
              <ThemeIcon
                size={38}
                radius="xl"
                color="churchBlue"
                variant="light"
              >
                <Sparkles size={16} />
              </ThemeIcon>
              <Box>
                <Text fw={700}>ChurchForge</Text>
                <Text c="dimmed" size="xs">
                  {sectionLabel}
                </Text>
              </Box>
            </Group>
          </Group>

          <Paper withBorder radius="xl" p="md" mb="md" bg="#f8fbff">
            <Text fw={600}>{sidebarTitle}</Text>
            {sidebarDescription ? (
              <Text c="dimmed" size="sm" mt="xs">
                {sidebarDescription}
              </Text>
            ) : null}
          </Paper>
        </AppShellSection>

        <Divider my="sm" />

        <AppShellSection grow component={ScrollArea} scrollbarSize={6}>
          <Stack gap={6}>
            <Group gap={8} px="xs" mb={4}>
              <LayoutGrid size={15} />
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                {navLabel ?? "Navigation"}
              </Text>
            </Group>

            {navItems.map((item) => (
              <NavLink
                key={item.href}
                component={Link}
                href={item.href}
                active={item.active}
                label={item.label}
                description={item.description}
                leftSection={<item.icon size={16} />}
                variant="light"
                color="churchBlue"
                styles={{
                  root: {
                    borderRadius: 16,
                  },
                  description: {
                    color: "#5c6b7a",
                  },
                }}
              />
            ))}
          </Stack>
        </AppShellSection>

        <Divider my="sm" />

        <AppShellSection>
          <Paper withBorder radius="xl" p="md">
            <Group gap="sm">
              <ThemeIcon
                size={34}
                radius="xl"
                color="churchBlue"
                variant="light"
              >
                <ShieldCheck size={16} />
              </ThemeIcon>
              <Box>
                <Text fw={600}>{session.profile.name}</Text>
                <Text c="dimmed" size="xs">
                  {session.profile.title}
                </Text>
                <Text size="sm" mt={6}>
                  {session.profile.focus}
                </Text>
              </Box>
            </Group>
          </Paper>
        </AppShellSection>
      </AppShellNavbar>

      <AppShellMain>
        <Stack gap="lg">{children}</Stack>
      </AppShellMain>
    </AppShell>
  );
}
