"use client";

import { ActionIcon, Alert, Badge, Button, Group, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { CalendarX, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import {
  addBlockoutDatesByTokenAction,
  addMyBlockoutDatesAction,
  addVolunteerBlockoutDatesAction,
  listVolunteerBlockoutDatesAction,
  removeBlockoutDateByTokenAction,
  removeMyBlockoutDateAction,
  removeVolunteerBlockoutDateAction,
  type BlockoutChangeResult,
} from "@/app/app/volunteer-actions";
import type { BlockoutDate } from "@/lib/blockout-dates";

/**
 * Who the dates belong to, and so which actions apply:
 *  - "self": the signed-in person (member schedule page);
 *  - "token": a volunteer using their emailed schedule link;
 *  - "admin": a service-plan admin managing a volunteer (directory).
 */
export type BlockoutTarget =
  | { kind: "self" }
  | { kind: "token"; token: string }
  | { kind: "admin"; profileId: string; fullName: string };

function formatDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function add(target: BlockoutTarget, input: { from: string; to: string | null; reason: string | null }) {
  if (target.kind === "self") return addMyBlockoutDatesAction(input);
  if (target.kind === "token") return addBlockoutDatesByTokenAction({ token: target.token, ...input });
  return addVolunteerBlockoutDatesAction({ profileId: target.profileId, ...input });
}

function remove(target: BlockoutTarget, date: string) {
  if (target.kind === "self") return removeMyBlockoutDateAction({ date });
  if (target.kind === "token") return removeBlockoutDateByTokenAction({ token: target.token, date });
  return removeVolunteerBlockoutDateAction({ profileId: target.profileId, date });
}

export function BlockoutDatesPanel({
  target,
  initialDates,
  withTitle = true,
}: {
  target: BlockoutTarget;
  /** Null means "load them" (the admin view opens without them). */
  initialDates: BlockoutDate[] | null;
  withTitle?: boolean;
}) {
  const [dates, setDates] = useState<BlockoutDate[] | null>(initialDates);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scheduledOn, setScheduledOn] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const adminProfileId = target.kind === "admin" ? target.profileId : null;
  useEffect(() => {
    if (!adminProfileId || initialDates !== null) return;
    let cancelled = false;
    listVolunteerBlockoutDatesAction({ profileId: adminProfileId })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setDates(res.dates);
        else setError(res.error);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load unavailable dates.");
      });
    return () => {
      cancelled = true;
    };
  }, [adminProfileId, initialDates]);

  function apply(result: BlockoutChangeResult) {
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setError(null);
    setDates(result.dates);
    setScheduledOn(result.scheduledOn);
    return true;
  }

  function handleAdd() {
    startTransition(async () => {
      try {
        if (apply(await add(target, { from, to: to || null, reason: reason || null }))) {
          setFrom("");
          setTo("");
          setReason("");
        }
      } catch {
        setError("Couldn't save. Please try again.");
      }
    });
  }

  function handleRemove(day: string) {
    startTransition(async () => {
      try {
        apply(await remove(target, day));
      } catch {
        setError("Couldn't remove that date. Please try again.");
      }
    });
  }

  const who = target.kind === "admin" ? target.fullName : null;
  const scheduledHint =
    target.kind === "admin"
      ? `${who} is already scheduled on ${scheduledOn.map(formatDay).join(", ")}. Find a replacement on those plans.`
      : `You're already scheduled on ${scheduledOn.map(formatDay).join(", ")}. Please also decline ${
          scheduledOn.length === 1 ? "that shift" : "those shifts"
        } so your team can find someone else.`;

  return (
    <Paper withBorder radius="md" p="md" data-testid="blockout-dates">
      <Stack gap="sm">
        {withTitle ? (
          <Group gap="xs">
            <CalendarX size={18} />
            <Title order={3} size="h5">
              {who ? `Unavailable dates — ${who}` : "Dates I can't serve"}
            </Title>
          </Group>
        ) : null}
        <Text size="sm" c="dimmed">
          {who
            ? "Days this volunteer can't serve. They won't be suggested or auto-filled on these days."
            : "Let your team know the days you're away. You won't be scheduled on them."}
        </Text>

        {error ? (
          <Alert color="red" variant="light" role="alert">
            {error}
          </Alert>
        ) : null}
        {scheduledOn.length > 0 ? (
          <Alert color="yellow" variant="light" role="status">
            {scheduledHint}
          </Alert>
        ) : null}

        <Group align="flex-end" gap="xs" wrap="wrap">
          <TextInput type="date" label="From" value={from} onChange={(e) => setFrom(e.currentTarget.value)} required w={160} />
          <TextInput
            type="date"
            label="To (optional)"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.currentTarget.value)}
            w={160}
          />
          <TextInput
            label="Reason (optional)"
            placeholder="e.g. Family trip"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 160 }}
          />
          <Button onClick={handleAdd} disabled={!from} loading={isPending}>
            Add
          </Button>
        </Group>

        {dates === null ? (
          <Text size="sm" c="dimmed">
            Loading…
          </Text>
        ) : dates.length === 0 ? (
          <Text size="sm" c="dimmed">
            No upcoming unavailable dates.
          </Text>
        ) : (
          <Stack gap={4}>
            {dates.map((entry) => (
              <Group key={entry.date} justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap">
                  <Badge variant="light" color="gray">
                    {formatDay(entry.date)}
                  </Badge>
                  {entry.reason ? (
                    <Text size="sm" c="dimmed" lineClamp={1}>
                      {entry.reason}
                    </Text>
                  ) : null}
                </Group>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="lg"
                  aria-label={`Remove ${formatDay(entry.date)}`}
                  onClick={() => handleRemove(entry.date)}
                  disabled={isPending}
                >
                  <Trash2 size={16} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
