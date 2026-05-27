"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck, CalendarRange, HeartHandshake, Home, Users } from "lucide-react";
import { Group, Stack, Text, UnstyledButton } from "@mantine/core";

import { useI18n } from "@/components/i18n-provider";

type BottomNavItem = {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  exact?: boolean;
  includes?: string[];
};

const NAV_ITEMS: BottomNavItem[] = [
  {
    href: "/app/member",
    labelKey: "home",
    icon: HeartHandshake,
    exact: true,
    includes: [
      "/app/member/directory",
      "/app/member/ministries",
      "/app/member/data-rights",
    ],
  },
  {
    href: "/app/calendar",
    labelKey: "calendar",
    icon: CalendarRange,
    exact: true,
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
    if (item.includes?.some((path) => pathname.startsWith(path))) {
      return true;
    }
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  return (
    <Group h="100%" px="xs" justify="space-between" align="center" wrap="nowrap" gap={2}>
      {NAV_ITEMS.map((item) => {
        const active = isActive(item);
        const color = active ? "#1a56db" : "#8a94a6";
        const label = t("member", item.labelKey);

        return (
          <UnstyledButton
            key={item.href}
            component={Link}
            href={item.href}
            aria-label={label}
            style={{
              flex: 1,
              minHeight: 56,
              paddingTop: 6,
              paddingBottom: 6,
              borderRadius: 12,
            }}
          >
            <Stack gap={4} align="center">
              <item.icon size={22} color={color} />
              <Text
                size="xs"
                fw={active ? 700 : 400}
                style={{ color, lineHeight: 1 }}
              >
                {label}
              </Text>
            </Stack>
          </UnstyledButton>
        );
      })}
    </Group>
  );
}
