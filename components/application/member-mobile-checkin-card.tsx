"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Group, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { CalendarCheck } from "lucide-react";
import { notifications } from "@mantine/notifications";

import { memberMobileCheckInAction } from "@/app/app/member-actions";
import type { MemberPortalFamilyMember } from "@/lib/member-portal-data";
import type { MemberMobileCheckInOption } from "@/lib/member-mobile-checkin-data";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function MemberMobileCheckInCard({
  options,
  householdMembers,
  profileId,
}: {
  options: MemberMobileCheckInOption[];
  householdMembers: MemberPortalFamilyMember[];
  profileId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [accessCodes, setAccessCodes] = useState<Record<string, string>>({});

  if (!options.length) {
    return null;
  }

  function handleCheckIn(eventId: string, targetProfileId?: string) {
    startTransition(async () => {
      const option = options.find((entry) => entry.eventId === eventId);
      let deviceLatitude: number | null = null;
      let deviceLongitude: number | null = null;

      if (option?.locationRequired) {
        if (!navigator.geolocation) {
          notifications.show({
            title: "Location required",
            message: "This event requires location verification, but geolocation is unavailable.",
            color: "red",
          });
          return;
        }

        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 60000,
            });
          });

          deviceLatitude = position.coords.latitude;
          deviceLongitude = position.coords.longitude;
        } catch {
          notifications.show({
            title: "Location required",
            message: "Enable location access to check in for this event.",
            color: "red",
          });
          return;
        }
      }

      const result = await memberMobileCheckInAction({
        eventId,
        accessCode: accessCodes[eventId] ?? null,
        targetProfileId: targetProfileId ?? null,
        deviceLatitude,
        deviceLongitude,
      });

      if (!result.ok) {
        notifications.show({
          title: "Check-in unavailable",
          message: result.error ?? "This event cannot be checked in right now.",
          color: "red",
        });
        return;
      }

      notifications.show({
        title: result.alreadyCheckedIn ? "Already checked in" : "Checked in",
        message: result.alreadyCheckedIn
          ? "You are already marked present for this event."
          : "Your attendance has been recorded.",
        color: "teal",
      });
    });
  }

  return (
    <Paper withBorder radius="xl" p="xl">
      <Group justify="space-between" align="center" mb="lg">
        <Title order={3} size="h4">
          Mobile check-in
        </Title>
      </Group>

      <Stack gap="sm">
        {options.map((option) => {
          const canCheckIn = option.status === "open";
          const statusTone =
            option.status === "open"
              ? "teal"
              : option.status === "checked_in"
                ? "blue"
                : option.status === "upcoming"
                  ? "yellow"
                  : "gray";

          return (
            <Paper key={option.eventId} withBorder radius="xl" p="lg">
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start" gap="md">
                  <Stack gap={4}>
                    <Text fw={600}>{option.title}</Text>
                    <Text size="sm" c="dimmed">
                      {formatDateTime(option.startsAt)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Check-in window: {formatDateTime(option.windowStartAt)} - {formatDateTime(option.windowEndAt)}
                    </Text>
                  </Stack>

                  <Badge color={statusTone} variant="light">
                    {option.status.replaceAll("_", " ")}
                  </Badge>
                </Group>

                {option.accessCodeRequired ? (
                  <TextInput
                    label="Access code"
                    value={accessCodes[option.eventId] ?? ""}
                    onChange={(event) =>
                      setAccessCodes((prev) => ({
                        ...prev,
                        [option.eventId]: event.currentTarget.value,
                      }))
                    }
                    radius="xl"
                  />
                ) : null}

                <Group justify="space-between" align="center">
                  <Text size="xs" c="dimmed">
                    Source: mobile_member
                  </Text>
                  <Button
                    size="sm"
                    radius="xl"
                    leftSection={<CalendarCheck size={14} />}
                    onClick={() => handleCheckIn(option.eventId)}
                    disabled={!canCheckIn || option.status === "checked_in"}
                    loading={isPending}
                  >
                    {option.status === "checked_in" ? "Checked in" : "Check in"}
                  </Button>
                </Group>

                {option.locationRequired ? (
                  <Text size="xs" c="dimmed">
                    On-site location verification is required.
                  </Text>
                ) : null}

                {canCheckIn && option.allowHouseholdCheckIn && householdMembers.length > 1 ? (
                  <Stack gap={6}>
                    <Text size="xs" c="dimmed">
                      Household check-in
                    </Text>
                    <Group gap="xs">
                      {householdMembers
                        .filter((member) => member.id !== profileId)
                        .map((member) => (
                          <Button
                            key={member.id}
                            size="xs"
                            variant="light"
                            radius="xl"
                            onClick={() => handleCheckIn(option.eventId, member.id)}
                            loading={isPending}
                          >
                            {member.fullName}
                          </Button>
                        ))}
                    </Group>
                  </Stack>
                ) : null}
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </Paper>
  );
}
