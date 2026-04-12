"use client";

import Link from "next/link";
import { CalendarRange, LogOut, ShieldUser } from "lucide-react";
import {
  Avatar,
  Button,
  Group,
  Menu,
  MenuDropdown,
  MenuItem,
  MenuTarget,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";

import { signOutAction } from "@/app/sign-in/actions";
import type { AuthSession } from "@/lib/auth";

export function SessionControls({
  session,
  workspaceHref,
  calendarHref,
}: {
  session: AuthSession;
  workspaceHref: string;
  calendarHref?: string | null;
}) {
  return (
    <Group gap="sm" wrap="wrap" justify="flex-end">
      <Button
        component={Link}
        href={workspaceHref}
        variant="default"
        radius="xl"
      >
        Workspace
      </Button>
      {calendarHref ? (
        <Button
          component={Link}
          href={calendarHref}
          variant="default"
          radius="xl"
          leftSection={<CalendarRange size={16} />}
        >
          Calendar
        </Button>
      ) : null}
      <form action={signOutAction}>
        <Button
          type="submit"
          variant="default"
          color="red"
          radius="xl"
          leftSection={<LogOut size={16} />}
        >
          Log out
        </Button>
      </form>

      <Menu shadow="md" width={240} position="bottom-end">
        <MenuTarget>
          <UnstyledButton>
            <Paper
              withBorder
              radius="xl"
              px="sm"
              py={6}
              style={{ background: "var(--mantine-color-body)" }}
            >
              <Group gap="sm">
                <Avatar color="churchBlue" radius="xl" variant="light">
                  <ShieldUser size={16} />
                </Avatar>
                <Stack gap={0}>
                  <Text fw={600} size="sm">
                    {session.profile.name}
                  </Text>
                  <Text c="dimmed" size="xs">
                    {session.profile.title}
                  </Text>
                </Stack>
              </Group>
            </Paper>
          </UnstyledButton>
        </MenuTarget>

        <MenuDropdown>
          <MenuItem component={Link} href={workspaceHref}>
            Open workspace
          </MenuItem>
          {calendarHref ? (
            <MenuItem component={Link} href={calendarHref}>
              Open calendar
            </MenuItem>
          ) : null}
        </MenuDropdown>
      </Menu>
    </Group>
  );
}
