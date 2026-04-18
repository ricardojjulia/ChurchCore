"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Group, Modal, Paper, Stack, Text, Textarea, Title } from "@mantine/core";
import { Check, X } from "lucide-react";

import type { MemberScheduleEntry } from "@/lib/volunteer-types";
import { respondToShiftAction } from "@/app/app/volunteer-actions";
import { notifications } from "@mantine/notifications";

const CONFIRM_COLOR: Record<string, string> = {
  pending: "yellow", confirmed: "green", declined: "red", substitute: "orange",
};

export function MemberScheduleView({ shifts: initialShifts }: { shifts: MemberScheduleEntry[] }) {
  const [shifts, setShifts] = useState(initialShifts);
  const [isPending, startTransition] = useTransition();
  const [declineTarget, setDeclineTarget] = useState<MemberScheduleEntry | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  function handleConfirm(shift: MemberScheduleEntry) {
    startTransition(async () => {
      const res = await respondToShiftAction(shift.shiftId, "confirmed");
      if (res.ok) {
        setShifts((prev) => prev.map((s) => s.shiftId === shift.shiftId ? { ...s, confirmationStatus: "confirmed" } : s));
        notifications.show({ title: "Confirmed", message: `You're confirmed for ${shift.roleName}.`, color: "teal" });
      } else {
        notifications.show({ title: "Error", message: res.error ?? "Failed to confirm.", color: "red" });
      }
    });
  }

  function handleDecline() {
    if (!declineTarget) return;
    startTransition(async () => {
      const res = await respondToShiftAction(declineTarget.shiftId, "declined", declineReason || undefined);
      if (res.ok) {
        setShifts((prev) => prev.map((s) => s.shiftId === declineTarget.shiftId ? { ...s, confirmationStatus: "declined" } : s));
        setDeclineTarget(null);
        setDeclineReason("");
        notifications.show({ title: "Declined", message: `Declined ${declineTarget.roleName}.`, color: "gray" });
      } else {
        notifications.show({ title: "Error", message: res.error ?? "Failed to decline.", color: "red" });
      }
    });
  }

  return (
    <Stack gap="md" p="md">
      <Title order={3}>Upcoming Assignments</Title>

      {shifts.length === 0 ? (
        <Paper withBorder p="xl" radius="md" ta="center">
          <Text c="dimmed">No upcoming volunteer assignments.</Text>
        </Paper>
      ) : (
        shifts.map((shift) => (
          <Paper key={shift.shiftId} withBorder p="md" radius="md">
            <Group justify="space-between" align="flex-start">
              <Stack gap={4}>
                <Group gap="xs">
                  <Text fw={600}>{shift.roleName}</Text>
                  <Badge size="sm" color={CONFIRM_COLOR[shift.confirmationStatus]} variant="light">
                    {shift.confirmationStatus}
                  </Badge>
                </Group>
                <Text size="sm">{shift.planName}</Text>
                <Text size="xs" c="dimmed">
                  {new Date(shift.serviceDate + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "long", month: "long", day: "numeric",
                  })}
                </Text>
              </Stack>
              {shift.confirmationStatus === "pending" && (
                <Group gap="xs">
                  <Button size="xs" color="green" leftSection={<Check size={13} />}
                    onClick={() => handleConfirm(shift)} loading={isPending}>
                    Confirm
                  </Button>
                  <Button size="xs" color="red" variant="light" leftSection={<X size={13} />}
                    onClick={() => setDeclineTarget(shift)} disabled={isPending}>
                    Decline
                  </Button>
                </Group>
              )}
            </Group>
          </Paper>
        ))
      )}

      <Modal
        opened={!!declineTarget}
        onClose={() => { setDeclineTarget(null); setDeclineReason(""); }}
        title={`Decline: ${declineTarget?.roleName}`}
        centered size="sm"
      >
        <Stack gap="sm">
          <Textarea
            label="Reason (optional)"
            placeholder="Out of town, prior commitment…"
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            minRows={2}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeclineTarget(null)}>Cancel</Button>
            <Button color="red" onClick={handleDecline} loading={isPending}>Decline</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
