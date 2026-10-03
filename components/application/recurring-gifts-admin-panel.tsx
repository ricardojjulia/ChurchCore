"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Group, Paper, Table, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import { adminCancelRecurringGiftAction, adminSetRecurringGiftPausedAction } from "@/app/app/recurring-gifts-actions";
import type { RecurringGift } from "@/lib/recurring-gifts";

// The church's recurring gifts for church admins (G3.1): who gives what, how
// often, and when next; pause, resume or cancel one (at the giver's request,
// say). An anonymous gift's giver is never shown.

const FREQUENCY: Record<RecurringGift["frequency"], string> = {
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
};

const STATUS: Record<RecurringGift["status"], { label: string; color: string }> = {
  active: { label: "Active", color: "teal" },
  paused: { label: "Paused", color: "yellow" },
  past_due: { label: "Payment failed", color: "red" },
  incomplete: { label: "Not set up", color: "gray" },
  cancelled: { label: "Cancelled", color: "gray" },
};

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function RecurringGiftsAdminPanel({ gifts }: { gifts: RecurringGift[] }) {
  const [isPending, startTransition] = useTransition();
  const [confirmingCancel, setConfirmingCancel] = useState<string | null>(null);
  const active = gifts.filter((gift) => gift.status === "active");
  const monthlyCents = active.reduce(
    (sum, gift) => sum + (gift.frequency === "monthly" ? gift.amountCents : gift.frequency === "biweekly" ? (gift.amountCents * 26) / 12 : (gift.amountCents * 52) / 12),
    0,
  );

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    startTransition(async () => {
      const result = await action();
      setConfirmingCancel(null);
      notifications.show(
        result.ok ? { title: done, message: "The giver's schedule is updated.", color: "teal" } : { title: "Couldn't update the gift", message: result.error ?? "Please try again.", color: "red" },
      );
    });
  }

  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" mb="sm">
        <Text fw={600}>Recurring gifts</Text>
        <Text fz="sm" c="dimmed">
          {active.length} active · about {formatCents(Math.round(monthlyCents))} a month
        </Text>
      </Group>
      {gifts.length === 0 ? (
        <Text fz="sm" c="dimmed">
          No recurring gifts yet. Members set them up from their giving page.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={640}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Giver</Table.Th>
                <Table.Th>Amount</Table.Th>
                <Table.Th>Fund</Table.Th>
                <Table.Th>Next gift</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {gifts.map((gift) => {
                const status = STATUS[gift.status];
                const open = gift.status !== "cancelled";
                return (
                  <Table.Tr key={gift.id}>
                    <Table.Td>{gift.isAnonymous ? <Text fz="sm" fs="italic">Anonymous</Text> : (gift.donorName ?? "—")}</Table.Td>
                    <Table.Td>
                      {formatCents(gift.amountCents)} <Text span fz="xs" c="dimmed">{FREQUENCY[gift.frequency].toLowerCase()}</Text>
                    </Table.Td>
                    <Table.Td>{gift.fundDesignation ?? "General"}</Table.Td>
                    <Table.Td>{gift.nextPaymentAt && gift.status === "active" ? new Date(gift.nextPaymentAt).toLocaleDateString("en-US") : "—"}</Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="light" color={status.color}>
                        {status.label}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {!open ? null : confirmingCancel === gift.id ? (
                        <Group gap={4} wrap="nowrap">
                          <Button size="compact-xs" color="red" loading={isPending} onClick={() => run(() => adminCancelRecurringGiftAction(gift.id), "Recurring gift cancelled")}>
                            Cancel gift
                          </Button>
                          <Button size="compact-xs" variant="subtle" onClick={() => setConfirmingCancel(null)}>
                            Keep
                          </Button>
                        </Group>
                      ) : (
                        <Group gap={4} wrap="nowrap">
                          {gift.status === "paused" || gift.status === "active" || gift.status === "past_due" ? (
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              loading={isPending}
                              onClick={() =>
                                run(
                                  () => adminSetRecurringGiftPausedAction(gift.id, gift.status !== "paused"),
                                  gift.status === "paused" ? "Recurring gift resumed" : "Recurring gift paused",
                                )
                              }
                            >
                              {gift.status === "paused" ? "Resume" : "Pause"}
                            </Button>
                          ) : null}
                          <Button size="compact-xs" variant="subtle" color="red" onClick={() => setConfirmingCancel(gift.id)}>
                            Cancel
                          </Button>
                        </Group>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Paper>
  );
}
