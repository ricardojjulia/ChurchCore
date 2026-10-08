"use client";

import { useState, useTransition } from "react";
import { Badge, Box, Button, Flex, Group, Modal, Paper, Stack, Text, Textarea, Title } from "@mantine/core";
import { Check, X } from "lucide-react";

import type { MemberScheduleEntry } from "@/lib/volunteer-types";
import { respondToShiftAction } from "@/app/app/volunteer-actions";
import { notifications } from "@mantine/notifications";
import { useI18n } from "@/components/i18n-provider";

const CONFIRM_COLOR: Record<string, string> = {
  pending: "yellow", confirmed: "green", declined: "red", substitute: "orange",
};

export function MemberScheduleView({
  shifts: initialShifts,
  hasChurchProfile = true,
}: {
  shifts: MemberScheduleEntry[];
  /** False when the signed-in person has no profile in this church (e.g. a platform admin viewing it). */
  hasChurchProfile?: boolean;
}) {
  const { locale, t } = useI18n();
  const intlLocale = locale === "en" ? "en-US" : locale === "es-PR" ? "es-PR" : "es-US";
  const errorText = (res: { code?: string; error?: string }, fallbackKey: string) =>
    res.code === "no_profile"
      ? tr("errNoProfile")
      : res.code === "not_assigned"
        ? tr("errNotAssigned")
        : tr(fallbackKey);
  // Shift times are stored as the service's wall-clock time, so format in UTC.
  const dateLine = (shift: MemberScheduleEntry) => {
    const day = shift.serviceDate || shift.startsAt?.slice(0, 10);
    const date = day
      ? new Date(`${day}T00:00:00Z`).toLocaleDateString(intlLocale, {
          weekday: "long",
          month: "long",
          day: "numeric",
          timeZone: "UTC",
        })
      : "";
    const time = (iso: string) =>
      new Date(iso).toLocaleTimeString(intlLocale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
    return shift.startsAt && shift.endsAt ? `${date} · ${time(shift.startsAt)}–${time(shift.endsAt)}` : date;
  };
  const tr = (key: string, values?: Record<string, string | number>) =>
    t("memberSchedule", key, values);
  const [shifts, setShifts] = useState(initialShifts);
  const [isPending, startTransition] = useTransition();
  const [pendingShiftId, setPendingShiftId] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<MemberScheduleEntry | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  function handleConfirm(shift: MemberScheduleEntry) {
    if (isPending) return; // a second tap while the first is in flight must not respond twice
    setPendingShiftId(shift.shiftId);
    startTransition(async () => {
      const res = await respondToShiftAction(shift.shiftId, "confirmed");
      setPendingShiftId(null);
      if (res.ok) {
        setShifts((prev) => prev.map((s) => s.shiftId === shift.shiftId ? { ...s, confirmationStatus: "confirmed" } : s));
        notifications.show({
          title: tr("confirmedTitle"),
          message: tr("confirmedMessage", { roleName: shift.roleName }),
          color: "teal",
        });
      } else {
        notifications.show({
          title: tr("errorTitle"),
          message: errorText(res, "failedToConfirm"),
          color: "red",
        });
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
        notifications.show({
          title: tr("declinedTitle"),
          message: tr("declinedMessage", { roleName: declineTarget.roleName }),
          color: "gray",
        });
      } else {
        notifications.show({
          title: tr("errorTitle"),
          message: errorText(res, "failedToDecline"),
          color: "red",
        });
      }
    });
  }

  // The first thing to act on is the thumb-reach primary action (G2.1): the
  // next pending shift's Confirm, else the first confirmed shift's "Can't make it".
  const firstPendingId = shifts.find((s) => s.confirmationStatus === "pending")?.shiftId;
  const firstCantMakeItId = firstPendingId
    ? undefined
    : shifts.find((s) => s.confirmationStatus === "confirmed")?.shiftId;

  return (
    <Box className="touch-44">
    <Stack gap="md" p="md">
      <Title order={3}>{tr("upcomingAssignments")}</Title>
      {!hasChurchProfile ? (
        <Text size="sm" c="dimmed" role="note">
          {tr("noProfileNotice")}
        </Text>
      ) : null}

      {shifts.length === 0 ? (
        <Paper withBorder p="xl" radius="md" ta="center">
          <Text c="dimmed">{tr("noUpcomingAssignments")}</Text>
        </Paper>
      ) : (
        shifts.map((shift) => (
          <Paper key={shift.shiftId} withBorder p="md" radius="md">
            <Flex
              direction={{ base: "column", sm: "row" }}
              justify="space-between"
              align={{ base: "stretch", sm: "flex-start" }}
              gap="sm"
            >
              <Stack gap={4}>
                <Group gap="xs">
                  <Text fw={600}>{shift.roleName}</Text>
                  <Badge size="sm" color={CONFIRM_COLOR[shift.confirmationStatus]} variant="light">
                    {shift.confirmationStatus === "pending"
                      ? tr("statusPending")
                      : shift.confirmationStatus === "confirmed"
                        ? tr("statusConfirmed")
                        : shift.confirmationStatus === "declined"
                          ? tr("statusDeclined")
                          : tr("statusSubstitute")}
                  </Badge>
                </Group>
                <Text size="sm">{shift.planName}</Text>
                <Text size="xs" c="dimmed">{dateLine(shift)}</Text>
              </Stack>
              {shift.confirmationStatus === "confirmed" && (
                <Button size="xs" mih={44} w={{ base: "100%", sm: "auto" }} color="red" variant="subtle" leftSection={<X size={13} />}
                  data-primary-action={shift.shiftId === firstCantMakeItId ? true : undefined}
                  onClick={() => setDeclineTarget(shift)} disabled={isPending}>
                  {tr("cantMakeIt")}
                </Button>
              )}
              {shift.confirmationStatus === "pending" && (
                <Group gap="xs" grow wrap="nowrap">
                  <Button size="md" mih={44} color="green" leftSection={<Check size={13} />}
                    data-primary-action={shift.shiftId === firstPendingId ? true : undefined}
                    onClick={() => handleConfirm(shift)} loading={isPending && pendingShiftId === shift.shiftId}
                    disabled={isPending && pendingShiftId !== shift.shiftId}>
                    {tr("confirm")}
                  </Button>
                  <Button size="md" mih={44} color="red" variant="light" leftSection={<X size={13} />}
                    onClick={() => setDeclineTarget(shift)} disabled={isPending}>
                    {tr("decline")}
                  </Button>
                </Group>
              )}
            </Flex>
          </Paper>
        ))
      )}

      <Modal
        opened={!!declineTarget}
        onClose={() => { setDeclineTarget(null); setDeclineReason(""); }}
        title={tr("declineTitle", { roleName: declineTarget?.roleName ?? "" })}
        centered size="sm" className="touch-44"
      >
        <Stack gap="sm">
          <Textarea
            label={tr("reasonOptional")}
            placeholder={tr("reasonPlaceholder")}
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            minRows={2}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeclineTarget(null)}>{tr("cancel")}</Button>
            <Button color="red" onClick={handleDecline} loading={isPending}>{tr("decline")}</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
    </Box>
  );
}
