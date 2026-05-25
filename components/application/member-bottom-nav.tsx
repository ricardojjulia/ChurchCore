"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, CalendarRange, HeartHandshake, Home, Layers, Users, UsersRound } from "lucide-react";
import { Group, Stack, Text, UnstyledButton } from "@mantine/core";

import { useI18n } from "@/components/i18n-provider";

type BottomNavItem = {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  exact?: boolean;
};

const NAV_ITEMS: BottomNavItem[] = [
  {
    href: "/app/member",
    labelKey: "home",
    icon: HeartHandshake,
    exact: true,
  },
  {
    href: "/app/calendar",
    labelKey: "calendar",
    icon: CalendarRange,
    exact: true,
  },
  {
    href: "/app/member/directory",
    labelKey: "directory",
    icon: UsersRound,
  },
  {
    href: "/app/member/ministries",
    labelKey: "ministries",
    icon: Layers,
  },
  {
    href: "/app/member/family",
    labelKey: "family",
    icon: Home,
  },
  {
    href: "/app/member/groups",
    labelKey: "groups",
    icon: Users,
  },
  {
    href: "/app/member/schedule",
    labelKey: "schedule",
    icon: CalendarCheck,
  },
];

export function MemberBottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();

  function isActive(item: BottomNavItem) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  return (
    <Group h="100%" px="xs" justify="space-around" align="center" wrap="nowrap">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item);
        const color = active ? "#1a56db" : "#8a94a6";

        return (
          <UnstyledButton
            key={item.href}
            component={Link}
            href={item.href}
            style={{ flex: 1 }}
          >
            <Stack gap={4} align="center">
              <item.icon size={22} color={color} />
              <Text
                size="xs"
                fw={active ? 700 : 400}
                style={{ color, lineHeight: 1 }}
              >
                {t("member", item.labelKey)}
              </Text>
            </Stack>
          </UnstyledButton>
        );
      })}
    </Group>
  );
}
