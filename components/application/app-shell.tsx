"use client";

import Link from "next/link";
import { useDisclosure } from "@mantine/hooks";
import {
  AppShell,
  AppShellFooter,
  AppShellHeader,
  AppShellMain,
  AppShellNavbar,
  AppShellSection,
  Avatar,
  Box,
  Burger,
  Button,
  Divider,
  Group,
  NavLink,
  Paper,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import {
  CalendarRange,
  LayoutGrid,
  LogOut,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { signOutAction } from "@/app/sign-in/actions";
import type { AuthSession } from "@/lib/auth";

type ShellNavItem = {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  active?: boolean;
};

const navLinkStyles = {
  root: { borderRadius: 16 },
  description: { color: "#5c6b7a" },
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
  bottomNav,
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
  bottomNav?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [opened, { toggle, close }] = useDisclosure(false);

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{ width: 272, breakpoint: "md", collapsed: { mobile: !opened } }}
      footer={bottomNav ? { height: 64 } : undefined}
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
        footer: {
          background: "rgba(251, 252, 254, 0.96)",
          backdropFilter: "blur(12px)",
          borderTop: "1px solid rgba(20, 33, 61, 0.08)",
        },
      }}
    >
      {/* ── Header ── */}
      <AppShellHeader px="md">
        <Group h="100%" justify="space-between" gap="sm">
          <Group gap="sm">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="md"
              size="sm"
              aria-label="Toggle navigation"
            />
            <Box>
              <Text fw={700} size="md" lh={1.2}>
                {title}
              </Text>
              {description ? (
                <Text c="dimmed" size="xs" lh={1.2}>
                  {description}
                </Text>
              ) : null}
            </Box>
          </Group>

          {topActions ? (
            <Box>{topActions}</Box>
          ) : null}
        </Group>
      </AppShellHeader>

      {/* ── Sidebar ── */}
      <AppShellNavbar p="md" style={{ display: "flex", flexDirection: "column" }}>
        {/* Brand */}
        <AppShellSection>
          <Group gap="sm" mb="md">
            <ThemeIcon size={36} radius="xl" color="churchBlue" variant="light">
              <Sparkles size={16} />
            </ThemeIcon>
            <Box>
              <Text fw={700} size="sm">ChurchForge</Text>
              <Text c="dimmed" size="xs">{sectionLabel}</Text>
            </Box>
          </Group>

          {sidebarTitle ? (
            <Paper withBorder radius="xl" p="sm" mb="sm" bg="#f8fbff">
              <Text fw={600} size="sm">{sidebarTitle}</Text>
              {sidebarDescription ? (
                <Text c="dimmed" size="xs" mt={4}>
                  {sidebarDescription}
                </Text>
              ) : null}
            </Paper>
          ) : null}
        </AppShellSection>

        <Divider mb="sm" />

        {/* Page navigation */}
        <AppShellSection grow component={ScrollArea} scrollbarSize={6}>
          <Stack gap={4}>
            {navItems.length ? (
              <>
                <Group gap={6} px="xs" mb={4}>
                  <LayoutGrid size={13} />
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
                    onClick={close}
                    styles={navLinkStyles}
                  />
                ))}

                <Divider my="sm" />
              </>
            ) : null}

            {/* System links */}
            <Group gap={6} px="xs" mb={4}>
              <LayoutGrid size={13} />
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                App
              </Text>
            </Group>

            <NavLink
              component={Link}
              href={workspaceHref}
              label="Workspace"
              description="Your role home"
              leftSection={<ShieldCheck size={16} />}
              variant="light"
              color="churchBlue"
              onClick={close}
              styles={navLinkStyles}
            />

            {calendarHref ? (
              <NavLink
                component={Link}
                href={calendarHref}
                label="Calendar"
                description="Church events"
                leftSection={<CalendarRange size={16} />}
                variant="light"
                color="churchBlue"
                onClick={close}
                styles={navLinkStyles}
              />
            ) : null}
          </Stack>
        </AppShellSection>

        <Divider mt="sm" mb="sm" />

        {/* User + Log out */}
        <AppShellSection>
          <Paper withBorder radius="xl" p="sm" mb="sm">
            <Group gap="sm">
              <Avatar color="churchBlue" radius="xl" variant="light" size="sm">
                <ShieldCheck size={14} />
              </Avatar>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Text fw={600} size="sm" truncate>
                  {session.profile.name}
                </Text>
                <Text c="dimmed" size="xs" truncate>
                  {session.profile.title}
                </Text>
              </Box>
            </Group>
          </Paper>

          <form action={signOutAction}>
            <Button
              type="submit"
              fullWidth
              variant="light"
              color="red"
              radius="xl"
              size="sm"
              leftSection={<LogOut size={15} />}
            >
              Log out
            </Button>
          </form>
        </AppShellSection>
      </AppShellNavbar>

      {/* ── Main ── */}
      <AppShellMain>
        <Stack gap="lg">{children}</Stack>
      </AppShellMain>

      {/* ── Mobile bottom nav ── */}
      {bottomNav ? (
        <AppShellFooter hiddenFrom="md">
          {bottomNav}
        </AppShellFooter>
      ) : null}
    </AppShell>
  );
}
