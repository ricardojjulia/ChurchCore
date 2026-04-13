"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarRange, HeartHandshake, Home, UsersRound } from "lucide-react";
import { Group, Stack, Text, UnstyledButton } from "@mantine/core";

type BottomNavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  exact?: boolean;
};

const NAV_ITEMS: BottomNavItem[] = [
  {
    href: "/app/member",
    label: "Home",
    icon: HeartHandshake,
    exact: true,
  },
  {
    href: "/app/calendar",
    label: "Calendar",
    icon: CalendarRange,
    exact: true,
  },
  {
    href: "/app/member/directory",
    label: "Directory",
    icon: UsersRound,
  },
  {
    href: "/app/member/family",
    label: "Family",
    icon: Home,
  },
];

export function MemberBottomNav() {
  const pathname = usePathname();

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
                {item.label}
              </Text>
            </Stack>
          </UnstyledButton>
        );
      })}
    </Group>
  );
}
