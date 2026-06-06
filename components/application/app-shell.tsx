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
  Building2,
  CalendarCheck,
  CalendarRange,
  CheckSquare,
  ClipboardList,
  Heart,
  HeartHandshake,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

import { LanguageSelect } from "@/components/language-select";
import { useI18n } from "@/components/i18n-provider";
import { signOutAction } from "@/app/sign-in/actions";
import type { AuthSession } from "@/lib/auth";

type ShellNavItem = {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; size?: number }> | string;
  active?: boolean;
};

type ShellNavIconName = keyof typeof shellNavIcons;

const shellNavIcons = {
  Building2,
  CalendarCheck,
  CalendarRange,
  CheckSquare,
  ClipboardList,
  Heart,
  HeartHandshake,
  LifeBuoy,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
};

const navLinkStyles = {
  root: { borderRadius: 14 },
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
  const { t } = useI18n();

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{ width: 272, breakpoint: "md", collapsed: { mobile: !opened } }}
      footer={bottomNav ? { height: 64 } : undefined}
      padding="lg"
      styles={{
        main: {
          background:
            "radial-gradient(circle at 18% 0%, rgba(37, 99, 235, 0.12), transparent 26%), radial-gradient(circle at 82% 3%, rgba(15, 118, 110, 0.12), transparent 24%), #f4f7fb",
          minHeight: "100vh",
        },
        navbar: {
          background: "#ffffff",
          borderRight: "1px solid rgba(20, 33, 61, 0.10)",
        },
        header: {
          background: "rgba(244, 247, 251, 0.82)",
          backdropFilter: "blur(18px)",
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
              <Text fw={850} size="md" lh={1.2} c="#101827">
                {title}
              </Text>
              {description ? (
                <Text c="#617184" size="xs" lh={1.2}>
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
          <Paper
            radius="md"
            p="md"
            mb="md"
            style={{
              background: "linear-gradient(135deg, rgba(20, 184, 166, 0.10), rgba(37, 99, 235, 0.07))",
              border: "1px solid rgba(20, 33, 61, 0.08)",
            }}
          >
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon size={38} radius="md" color="teal" variant="filled">
                <Sparkles size={17} />
              </ThemeIcon>
              <Box style={{ minWidth: 0 }}>
                <Text fw={850} size="sm" c="#101827" truncate>ChurchCore</Text>
                <Text c="#617184" size="xs" truncate>
                  {sectionLabel}
                </Text>
              </Box>
            </Group>
          </Paper>

          {sidebarTitle ? (
            <Paper
              radius="md"
              p="sm"
              mb="sm"
              style={{
                background: "rgba(20, 33, 61, 0.04)",
                border: "1px solid rgba(20, 33, 61, 0.08)",
              }}
            >
              <Text fw={700} size="sm" c="#101827">{sidebarTitle}</Text>
              {sidebarDescription ? (
                <Text c="#617184" size="xs" mt={4}>
                  {sidebarDescription}
                </Text>
              ) : null}
            </Paper>
          ) : null}
        </AppShellSection>

        <Divider mb="sm" color="rgba(20, 33, 61, 0.08)" />

        {/* Page navigation */}
        <AppShellSection grow component={ScrollArea} scrollbarSize={6}>
          <Stack gap={5}>
            {navItems.length ? (
              <>
                <Group gap={6} px="xs" mb={4}>
                  <LayoutGrid size={13} color="#617184" />
                  <Text size="xs" fw={800} tt="uppercase" c="#617184">
                    {navLabel ?? t("common", "navigation")}
                  </Text>
                </Group>

                {navItems.map((item) => {
                  const Icon =
                    typeof item.icon === "string"
                      ? shellNavIcons[item.icon as ShellNavIconName] ?? LayoutGrid
                      : item.icon;

                  return (
                    <NavLink
                      key={item.href}
                      className="app-shell-nav-link"
                      component={Link}
                      href={item.href}
                      active={item.active}
                      label={item.label}
                      description={item.description}
                      leftSection={<Icon size={16} />}
                      variant="light"
                      color="teal"
                      onClick={close}
                      styles={navLinkStyles}
                    />
                  );
                })}

                <Divider my="sm" color="rgba(20, 33, 61, 0.08)" />
              </>
            ) : null}

            {/* System links */}
            <Group gap={6} px="xs" mb={4}>
              <LayoutGrid size={13} color="#617184" />
              <Text size="xs" fw={800} tt="uppercase" c="#617184">
                {t("common", "app")}
              </Text>
            </Group>

            <NavLink
              className="app-shell-nav-link"
              component={Link}
              href={workspaceHref}
              label={t("common", "workspace")}
              description={t("common", "yourRoleHome")}
              leftSection={<ShieldCheck size={16} />}
              variant="light"
              color="teal"
              onClick={close}
              styles={navLinkStyles}
            />

            {calendarHref ? (
              <NavLink
                className="app-shell-nav-link"
                component={Link}
                href={calendarHref}
                label={t("common", "calendar")}
                description={t("common", "churchEvents")}
                leftSection={<CalendarRange size={16} />}
                variant="light"
                color="teal"
                onClick={close}
                styles={navLinkStyles}
              />
            ) : null}
          </Stack>
        </AppShellSection>

        <Divider mt="sm" mb="sm" color="rgba(20, 33, 61, 0.08)" />

        {/* User + Log out */}
        <AppShellSection>
          <Paper
            radius="md"
            p="sm"
            mb="sm"
            style={{
              background: "rgba(20, 33, 61, 0.04)",
              border: "1px solid rgba(20, 33, 61, 0.08)",
            }}
          >
            <Group gap="sm" wrap="nowrap">
              <Avatar color="teal" radius="md" variant="filled" size="sm">
                <ShieldCheck size={14} />
              </Avatar>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Text fw={700} size="sm" c="#101827" truncate>
                  {session.profile.name}
                </Text>
                <Text c="#617184" size="xs" truncate>
                  {session.profile.title}
                </Text>
              </Box>
            </Group>
          </Paper>

          <Box mb="sm" className="app-shell-language">
            <LanguageSelect size="xs" />
          </Box>

          <form action={signOutAction}>
            <Button
              type="submit"
              fullWidth
              variant="filled"
              color="red"
              radius="md"
              size="sm"
              leftSection={<LogOut size={15} />}
              style={{ background: "rgba(185, 28, 28, 0.92)" }}
            >
              {t("common", "logOut")}
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
