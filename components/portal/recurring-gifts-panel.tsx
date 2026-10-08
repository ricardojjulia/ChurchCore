"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Drawer,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { CalendarClock, Pause, Pencil, Play, RefreshCw, XCircle } from "lucide-react";

import {
  cancelRecurringGiftAction,
  confirmRecurringGiftAction,
  setRecurringGiftPausedAction,
  startRecurringGiftAction,
  updateRecurringGiftAction,
} from "@/app/app/recurring-gifts-actions";
import { DonationCardStep } from "@/components/portal/donation-card-step";
import type { RecurringGift } from "@/lib/recurring-gifts";

// A member's recurring gifts (G3.1): set one up (amount, fund, frequency,
// start date, then the card), and change, pause, resume or cancel each.
// Charged on the church's own Stripe account (ADR 0025).

export const FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every two weeks" },
  { value: "monthly", label: "Monthly" },
];

const FREQUENCY_SUFFIX: Record<RecurringGift["frequency"], string> = {
  weekly: "/ week",
  biweekly: "/ two weeks",
  monthly: "/ month",
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

/** A payment time, as a date in the church's time zone (not the viewer's). */
export function formatDay(value: string | null, timeZone: string | null): string | null {
  if (!value) return null;
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  try {
    return new Date(value).toLocaleDateString("en-US", { ...options, timeZone: timeZone ?? undefined });
  } catch {
    return new Date(value).toLocaleDateString("en-US", options);
  }
}

/** A YYYY-MM-DD date, as written: a date, not a moment, so no time zone shifts it. */
function formatDateKey(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

type Setup = {
  recurringGiftId: string;
  clientSecret: string;
  intentType: "payment" | "setup";
  publishableKey: string;
  stripeAccount: string;
  cents: number;
  label: string;
};

export function RecurringGiftsPanel({
  gifts,
  fundOptions,
  today,
  timeZone = null,
  givingOff,
}: {
  gifts: RecurringGift[];
  fundOptions: Array<{ value: string; label: string }>;
  /** Today in the church's time zone (YYYY-MM-DD): the earliest start date. */
  today: string;
  /** The church's time zone: payment dates are shown in it. */
  timeZone?: string | null;
  /** Online giving is off for this church: no new recurring gifts. */
  givingOff: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringGift | null>(null);
  const [amountDollars, setAmountDollars] = useState<number | string>(25);
  const [fund, setFund] = useState("General");
  const [frequency, setFrequency] = useState<string>("monthly");
  const [startDate, setStartDate] = useState(today);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState<string | null>(null);
  /** Stripe accepted the card but the server couldn't record it yet: retry the confirm only. */
  const [confirmFailed, setConfirmFailed] = useState(false);
  const cardHeadingRef = useRef<HTMLParagraphElement>(null);

  // The form was just replaced by the card step: move focus there, so
  // keyboard and screen reader users land on it (Council Review 38).
  useEffect(() => {
    if (setup) cardHeadingRef.current?.focus();
  }, [setup]);

  const visible = gifts.filter((gift) => gift.status !== "cancelled");

  function notify(ok: boolean, title: string, message: string) {
    notifications.show({ title, message, color: ok ? "teal" : "red" });
  }

  function openNew() {
    setEditing(null);
    setAmountDollars(25);
    setFund("General");
    setFrequency("monthly");
    setStartDate(today);
    setIsAnonymous(false);
    setSetup(null);
    setConfirmFailed(false);
    setFormOpen(true);
  }

  function openEdit(gift: RecurringGift) {
    setEditing(gift);
    setAmountDollars(gift.amountCents / 100);
    setFund(gift.fundDesignation ?? "General");
    setFrequency(gift.frequency);
    setSetup(null);
    setFormOpen(true);
  }

  // Leaving the card step cancels the half-made gift, so no subscription is
  // left waiting on a card that never comes. The drawer closes only once
  // that has worked.
  function closeForm() {
    const abandoned = setup;
    if (!abandoned) {
      setFormOpen(false);
      return;
    }
    startTransition(async () => {
      const result = await cancelRecurringGiftAction(abandoned.recurringGiftId).catch(() => ({ ok: false as const, error: "Please try again." }));
      if (!result.ok) {
        notify(false, "Couldn't cancel", result.error);
        return;
      }
      setSetup(null);
      setFormOpen(false);
    });
  }

  function submit() {
    const cents = Math.round(Number(amountDollars) * 100);
    if (!cents || cents <= 0) return;
    const label = `${formatCents(cents)} ${FREQUENCY_SUFFIX[frequency as RecurringGift["frequency"]] ?? ""}`;
    startTransition(async () => {
      if (editing) {
        const result = await updateRecurringGiftAction(editing.id, { amountCents: cents, fundDesignation: fund, frequency });
        if (!result.ok) return notify(false, "Couldn't change your gift", result.error);
        notify(true, "Recurring gift updated", `From the next gift on: ${label} to ${fund}.`);
        setFormOpen(false);
        return;
      }
      const result = await startRecurringGiftAction({ amountCents: cents, fundDesignation: fund, frequency, startDate, isAnonymous });
      if (!result.ok) return notify(false, "Couldn't start your recurring gift", result.error);
      if (!result.checkout) {
        // Stub mode (development, demo): no card to take.
        notify(true, "Recurring gift set up (dev mode)", `${label} to ${fund}. Stripe isn't configured, so nothing is charged.`);
        setFormOpen(false);
        return;
      }
      setSetup({ recurringGiftId: result.recurringGiftId, cents, label, ...result.checkout });
    });
  }

  // After Stripe accepts the card. If recording it fails, the drawer stays
  // open with a retry that repeats only this step (the card step is done):
  // closing would hide a gift whose card Stripe will charge (PR 177 review).
  function cardConfirmed() {
    const done = setup;
    if (!done) return;
    startTransition(async () => {
      const result = await confirmRecurringGiftAction(done.recurringGiftId).catch(() => ({
        ok: false as const,
        error: "Couldn't finish setting up your gift.",
      }));
      if (!result.ok) {
        setConfirmFailed(true);
        return;
      }
      const startsLater = done.intentType === "setup";
      notify(
        true,
        "Thank you for your recurring gift",
        result.gift.status === "active"
          ? startsLater
            ? `${done.label} to ${fund} starts on ${formatDay(result.gift.nextPaymentAt, timeZone) ?? formatDateKey(startDate)}.`
            : `${done.label} to ${fund} is set up. Your receipt for the first gift will follow shortly.`
          : "Your card was accepted; your gift will show as active in a moment.",
      );
      setConfirmFailed(false);
      setSetup(null);
      setFormOpen(false);
    });
  }

  function togglePaused(gift: RecurringGift) {
    const pausing = gift.status !== "paused";
    startTransition(async () => {
      const result = await setRecurringGiftPausedAction(gift.id, pausing);
      if (!result.ok) return notify(false, pausing ? "Couldn't pause" : "Couldn't resume", result.error);
      notify(true, pausing ? "Recurring gift paused" : "Recurring gift resumed", pausing ? "Nothing will be charged until you resume it." : "Your gifts will continue on schedule.");
    });
  }

  function cancel(gift: RecurringGift) {
    startTransition(async () => {
      const result = await cancelRecurringGiftAction(gift.id);
      setConfirmingCancel(null);
      if (!result.ok) return notify(false, "Couldn't cancel", result.error);
      notify(true, "Recurring gift cancelled", "No further gifts will be charged. Thank you for your generosity.");
    });
  }

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <RefreshCw size={14} />
          <Text fw={600} fz="sm">
            Recurring gifts
          </Text>
        </Group>
        <Button size="xs" variant="light" radius="xl" onClick={openNew} disabled={givingOff}>
          Set up a recurring gift
        </Button>
      </Group>

      {visible.length === 0 ? (
        <Text fz="sm" c="dimmed">
          Give weekly, every two weeks, or monthly, and change, pause or stop it any time.
        </Text>
      ) : (
        <Stack gap="sm">
          {visible.map((gift) => {
            const status = STATUS[gift.status];
            const next = formatDay(gift.nextPaymentAt, timeZone);
            return (
              <Paper key={gift.id} withBorder p="sm" radius="md" bg="dark.6">
                <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <Group gap="xs">
                      <Text fz="sm" fw={600}>
                        {formatCents(gift.amountCents)} {FREQUENCY_SUFFIX[gift.frequency]}
                      </Text>
                      <Badge size="xs" color={status.color} variant="light">
                        {status.label}
                      </Badge>
                    </Group>
                    <Text fz="xs" c="dimmed">
                      {gift.fundDesignation ?? "General"}
                      {next && gift.status !== "paused" ? ` · next gift ${next}` : ""}
                      {gift.isAnonymous ? " · anonymous" : ""}
                    </Text>
                  </Stack>
                  {confirmingCancel === gift.id ? (
                    <Group gap={6}>
                      <Text fz="xs">Stop this gift?</Text>
                      <Button size="compact-xs" color="red" loading={isPending} onClick={() => cancel(gift)}>
                        Yes, cancel it
                      </Button>
                      <Button size="compact-xs" variant="subtle" onClick={() => setConfirmingCancel(null)}>
                        Keep it
                      </Button>
                    </Group>
                  ) : (
                    <Group gap={4}>
                      <Button size="compact-xs" variant="subtle" leftSection={<Pencil size={11} />} onClick={() => openEdit(gift)} disabled={isPending}>
                        Change
                      </Button>
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        leftSection={gift.status === "paused" ? <Play size={11} /> : <Pause size={11} />}
                        onClick={() => togglePaused(gift)}
                        loading={isPending}
                      >
                        {gift.status === "paused" ? "Resume" : "Pause"}
                      </Button>
                      <Button size="compact-xs" variant="subtle" color="red" leftSection={<XCircle size={11} />} onClick={() => setConfirmingCancel(gift.id)}>
                        Cancel
                      </Button>
                    </Group>
                  )}
                </Group>
              </Paper>
            );
          })}
        </Stack>
      )}

      <Drawer
        className="touch-44"
        opened={formOpen}
        onClose={closeForm}
        closeOnEscape={!isPending}
        closeOnClickOutside={!isPending}
        title={editing ? "Change recurring gift" : "Set up a recurring gift"}
        position="right"
        size="md"
        radius="lg"
      >
        {setup ? (
          <Stack gap="md" p="md">
            <Text fw={600} ref={cardHeadingRef} tabIndex={-1}>
              {setup.label} to {fund}
            </Text>
            {confirmFailed ? (
              <Stack gap="sm">
                <Alert color="red" variant="light" radius="md" title="Almost done">
                  Your card was accepted, but we couldn&apos;t finish setting up your gift. Please try again; your card
                  won&apos;t be asked for again.
                </Alert>
                <Button loading={isPending} onClick={cardConfirmed}>
                  Try again
                </Button>
              </Stack>
            ) : (
            <>
            <Text fz="xs" c="dimmed">
              {setup.intentType === "setup"
                ? `Your card is saved now and first charged on ${formatDateKey(startDate)}.`
                : "Your first gift is charged now, then on the same schedule."}
            </Text>
            <DonationCardStep
              publishableKey={setup.publishableKey}
              stripeAccount={setup.stripeAccount}
              clientSecret={setup.clientSecret}
              amountLabel={setup.label}
              intentType={setup.intentType}
              submitLabel={setup.intentType === "setup" ? "Save card and start" : `Give ${formatCents(setup.cents)}`}
              cancelLabel="Cancel"
              onPaid={cardConfirmed}
              onCancel={closeForm}
            />
            </>
            )}
          </Stack>
        ) : (
          <Stack gap="md" p="md">
            <NumberInput label="Amount" prefix="$" value={amountDollars} onChange={setAmountDollars} min={1} decimalScale={2} required />
            <Select label="How often" data={FREQUENCY_OPTIONS} value={frequency} onChange={(v) => setFrequency(v ?? "monthly")} allowDeselect={false} />
            <Select label="Designate your gift" data={fundOptions} value={fund} onChange={(v) => setFund(v ?? "General")} allowDeselect={false} />
            {editing ? (
              <Text fz="xs" c="dimmed">
                Changes apply from your next gift on.
              </Text>
            ) : (
              <>
                <TextInput
                  type="date"
                  label="Start date"
                  description="In your church's time zone. Today, or a later date: your card is saved now and first charged then."
                  value={startDate}
                  min={today}
                  onChange={(event) => setStartDate(event.currentTarget.value)}
                  leftSection={<CalendarClock size={14} />}
                />
                <Switch
                  label="Give anonymously"
                  description="Your name won't be shown with these gifts in church records. Receipts still come to you."
                  checked={isAnonymous}
                  onChange={(event) => setIsAnonymous(event.currentTarget.checked)}
                />
              </>
            )}
            <Group justify="flex-end" gap="sm">
              <Button variant="default" onClick={closeForm} disabled={isPending}>
                Cancel
              </Button>
              <Button loading={isPending} disabled={!amountDollars || Number(amountDollars) <= 0} onClick={submit}>
                {editing ? "Save changes" : "Continue"}
              </Button>
            </Group>
          </Stack>
        )}
      </Drawer>
    </Paper>
  );
}
