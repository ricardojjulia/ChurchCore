"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { Users, Calendar, MapPin, Check, AlertCircle } from "lucide-react";

import type { ChurchAppSession } from "@/lib/auth";
import type { GroupsListData } from "@/lib/groups-types";
import { joinGroupAction } from "@/app/app/groups-actions";

export function MemberGroupsBrowser({
  data,
}: {
  session: ChurchAppSession;
  data: GroupsListData;
}) {
  const [isPending, startTransition] = useTransition();
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleJoin(groupId: string) {
    startTransition(async () => {
      const res = await joinGroupAction(groupId);
      if (res.ok) {
        setJoined((s) => new Set([...s, groupId]));
        setMsg({ type: "success", text: "Request sent! A leader will confirm your membership." });
      } else {
        setMsg({ type: "error", text: res.error ?? "Unable to join group." });
      }
    });
  }

  const openGroups = data.groups.filter((g) => g.isOpen && g.isActive);

  return (
    <Stack gap="md" p="md">
      <Title order={3}>Find a Group</Title>

      {msg && (
        <Alert
          color={msg.type === "success" ? "green" : "red"}
          icon={msg.type === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
          onClose={() => setMsg(null)}
          withCloseButton
        >
          {msg.text}
        </Alert>
      )}

      {openGroups.length === 0 ? (
        <Paper p="xl" withBorder ta="center">
          <Users size={36} color="var(--mantine-color-dimmed)" />
          <Text mt="sm" c="dimmed">No open groups at the moment. Check back soon.</Text>
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {openGroups.map((g) => (
            <Paper key={g.id} withBorder radius="md" p="md">
              <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap">
                  <Text fw={600}>{g.name}</Text>
                  <Badge variant="light" size="xs" tt="capitalize">
                    {g.category.replace("_", " ")}
                  </Badge>
                </Group>

                {g.description && (
                  <Text size="sm" c="dimmed" lineClamp={2}>{g.description}</Text>
                )}

                <Group gap="md">
                  {g.meetingDay && (
                    <Group gap={4}>
                      <Calendar size={12} />
                      <Text size="xs">{g.meetingDay}{g.meetingTime ? ` at ${g.meetingTime}` : ""}</Text>
                    </Group>
                  )}
                  {g.meetingLocation && (
                    <Group gap={4}>
                      <MapPin size={12} />
                      <Text size="xs">{g.meetingLocation}</Text>
                    </Group>
                  )}
                </Group>

                <Group justify="space-between" align="center" mt={4}>
                  <Group gap={4}>
                    <Users size={12} />
                    <Text size="xs" c="dimmed">
                      {g.memberCount} member{g.memberCount !== 1 ? "s" : ""}
                      {g.capacity ? ` / ${g.capacity} max` : ""}
                    </Text>
                  </Group>
                  {joined.has(g.id) ? (
                    <Badge color="green" variant="light" leftSection={<Check size={11} />}>
                      Requested
                    </Badge>
                  ) : (
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => handleJoin(g.id)}
                      loading={isPending}
                    >
                      Join
                    </Button>
                  )}
                </Group>
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}
