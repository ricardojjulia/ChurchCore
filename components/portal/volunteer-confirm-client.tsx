"use client";

import { useState, useTransition } from "react";
import { Button, Stack, Text, Title, Group, Badge, Textarea, Alert, Paper } from "@mantine/core";
import { Check, X, Calendar, Clock, MapPin, User, ChevronRight } from "lucide-react";
import Link from "next/link";

import { respondToPublicShiftAction } from "@/app/app/volunteer-actions";
import { describePublicShift, type PublicShift } from "@/lib/volunteer-portal";

export function VolunteerConfirmClient({
  shift,
  token,
}: {
  shift: PublicShift;
  token: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string>(shift.confirmation_status);
  const [declineMode, setDeclineMode] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { place: eventTitle, description, dateLabel: serviceDate, timeLabel: timeString } = describePublicShift(shift, "long");

  function handleResponse(response: "confirmed" | "declined") {
    if (response === "declined" && !declineMode) {
      setDeclineMode(true);
      return;
    }

    startTransition(async () => {
      setMessage(null);
      const res = await respondToPublicShiftAction(token, response, response === "declined" ? declineReason : undefined);
      if (res.ok) {
        setStatus(response);
        setDeclineMode(false);
        setMessage({
          type: "success",
          text: response === "confirmed"
            ? "Thank you! Your availability has been confirmed."
            : "Thank you for letting us know. We will update the schedule.",
        });
      } else {
        setMessage({ type: "error", text: res.error ?? "Failed to save response." });
      }
    });
  }

  const statusColor: Record<string, string> = {
    pending: "yellow",
    confirmed: "green",
    declined: "red",
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Badge color={statusColor[status] ?? "gray"} variant="filled" size="lg" tt="uppercase">
            {status}
          </Badge>
        </div>
        <Text size="xs" c="dimmed">
          Secure Public Sessional Portal
        </Text>
      </Group>

      <div>
        <Text size="sm" fw={700} c="dimmed" tt="uppercase">
          Volunteer Assignment Follow-up
        </Text>
        <Title order={2} mt={4}>
          {shift.title}
        </Title>
      </div>

      <Paper withBorder p="md" radius="md" bg="#0f172a">
        <Stack gap="xs">
          <Group gap="sm" wrap="nowrap">
            <User size={18} className="text-gray-400" />
            <Text fw={600} size="sm">
              Role: {shift.title}
            </Text>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Calendar size={18} className="text-gray-400" />
            <Text size="sm">{serviceDate || "TBD"}</Text>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Clock size={18} className="text-gray-400" />
            <Text size="sm">{timeString}</Text>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <MapPin size={18} className="text-gray-400" />
            <Text size="sm">{eventTitle}</Text>
          </Group>
        </Stack>
      </Paper>

      {description && (
        <div>
          <Text fw={600} size="sm">Description</Text>
          <Text size="sm" c="dimmed" mt={4}>
            {description}
          </Text>
        </div>
      )}

      {message && (
        <Alert color={message.type === "success" ? "green" : "red"}>
          {message.text}
        </Alert>
      )}

      {declineMode ? (
        <Stack gap="sm">
          <Textarea
            label="Reason for declining (optional)"
            placeholder="Please share if you have a conflict or need a rest..."
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            disabled={isPending}
            maxRows={4}
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setDeclineMode(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button color="red" leftSection={<X size={16} />} onClick={() => handleResponse("declined")} loading={isPending}>
              Submit Decline
            </Button>
          </Group>
        </Stack>
      ) : (
        <Group gap="sm">
          {status !== "confirmed" && (
            <Button
              color="green"
              leftSection={<Check size={16} />}
              onClick={() => handleResponse("confirmed")}
              loading={isPending}
              style={{ flex: 1 }}
            >
              Confirm
            </Button>
          )}
          {status !== "declined" && (
            <Button
              color="red"
              variant="outline"
              leftSection={<X size={16} />}
              onClick={() => handleResponse("declined")}
              loading={isPending}
              style={{ flex: 1 }}
            >
              Decline
            </Button>
          )}
        </Group>
      )}

      <Group justify="center" mt="md">
        <Button
          component={Link}
          href={`/portal/volunteer/schedule/${token}`}
          variant="subtle"
          rightSection={<ChevronRight size={14} />}
        >
          View My Full Schedule
        </Button>
      </Group>
    </Stack>
  );
}
