"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Heart, RefreshCw, XCircle } from "lucide-react";

import {
  cancelPendingDonationAction,
  confirmDonationAction,
  initiateDonationAction,
  cancelRecurringDonationAction,
} from "@/app/app/donations-actions";
import { DonationCardStep } from "@/components/portal/donation-card-step";
import type { DonationEntry, DonorPortalData } from "@/lib/donations-data";

const STATUS_COLORS: Record<DonationEntry["status"], string> = {
  pending: "yellow",
  succeeded: "green",
  failed: "red",
  refunded: "orange",
  cancelled: "gray",
};

function formatCents(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

const FUND_OPTIONS = [
  { value: "General", label: "General Fund" },
  { value: "Building Fund", label: "Building Fund" },
  { value: "Missions", label: "Missions" },
  { value: "Youth Ministry", label: "Youth Ministry" },
  { value: "Community Outreach", label: "Community Outreach" },
];

type Checkout = { clientSecret: string; donationId: string; paymentIntentId: string; cents: number; fund: string };

export function DonorPortal({
  data,
  givingNotice = null,
  publishableKey = null,
}: {
  data: DonorPortalData;
  /** Why online giving is off right now, or null when a member can give (Council Review 22). */
  givingNotice?: string | null;
  /** Stripe's publishable key, for the card step (G3.0); null in stub mode. */
  publishableKey?: string | null;
}) {
  const { donations, totalGiven } = data;

  const [giveOpen, give] = useDisclosure(false);
  const [amountDollars, setAmountDollars] = useState<number | string>(25);
  const [fund, setFund] = useState<string>("General");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [note, setNote] = useState("");
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetForm() {
    setAmountDollars(25);
    setNote("");
    setCheckout(null);
    give.close();
  }

  // Closing the drawer before paying cancels the PaymentIntent and the
  // pending gift, rather than leaving both open (G3.0).
  function closeGive() {
    const abandoned = checkout;
    resetForm();
    if (abandoned) {
      void cancelPendingDonationAction(abandoned.donationId, abandoned.paymentIntentId);
    }
  }

  // Back to the amount and fund (kept as entered): this PaymentIntent is for
  // the old amount, so it's cancelled and a new one made on Give.
  function backToForm() {
    const abandoned = checkout;
    setCheckout(null);
    if (abandoned) {
      void cancelPendingDonationAction(abandoned.donationId, abandoned.paymentIntentId);
    }
  }

  function handlePaid(status: string) {
    const paid = checkout;
    if (!paid) return;
    startTransition(async () => {
      if (status === "succeeded") {
        const confirmed = await confirmDonationAction(paid.donationId, paid.paymentIntentId);
        notifications.show(
          confirmed.ok
            ? {
                title: "Thank you for your gift",
                message: `Your gift of ${formatCents(paid.cents)} to ${paid.fund} went through. A receipt is on its way if you gave an email.`,
                color: "teal",
              }
            : {
                title: "Payment received",
                message: "Your payment went through; it may take a moment to show in your giving history.",
                color: "teal",
              },
        );
      } else {
        // e.g. a bank debit still clearing: the webhook records it.
        notifications.show({
          title: "Payment processing",
          message: `Your gift of ${formatCents(paid.cents)} is processing. It'll show in your giving history once it clears.`,
          color: "blue",
        });
      }
      resetForm();
    });
  }

  function handleGive() {
    const cents = Math.round(Number(amountDollars) * 100);
    if (cents <= 0) return;

    startTransition(async () => {
      try {
        const result = await initiateDonationAction({
          amountCents: cents,
          fundDesignation: fund,
          isAnonymous,
          note: note.trim() || undefined,
          donorName: isAnonymous ? undefined : donorName.trim() || undefined,
          donorEmail: isAnonymous ? undefined : donorEmail.trim() || undefined,
        });

        if (!result.ok) {
          notifications.show({ title: "Couldn't start your gift", message: result.error, color: "red" });
          return;
        }

        if (!result.isStub) {
          // Live: the member pays in the card step; nothing is recorded as
          // paid until Stripe says so.
          if (!publishableKey) {
            notifications.show({ title: "Couldn't start your gift", message: "Card payments aren't available right now.", color: "red" });
            return;
          }
          setCheckout({
            clientSecret: result.clientSecret,
            donationId: result.donationId,
            paymentIntentId: result.paymentIntentId,
            cents,
            fund,
          });
          return;
        }

        // Stub mode (development and the demo): there's no card to take, so
        // record the gift now.
        const confirmed = await confirmDonationAction(result.donationId, result.paymentIntentId);
        notifications.show(
          confirmed.ok
            ? {
                title: "Gift recorded (dev mode)",
                message: `Thank you for your generous gift of ${formatCents(cents)} to ${fund}. (Stripe not configured — running in stub mode.)`,
                color: "teal",
              }
            : { title: "Couldn't record your gift", message: confirmed.error ?? "Please try again.", color: "red" },
        );

        resetForm();
      } catch (err) {
        notifications.show({
          title: "Error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          color: "red",
        });
      }
    });
  }

  function handleCancelRecurring(donationId: string) {
    startTransition(async () => {
      try {
        const cancelled = await cancelRecurringDonationAction(donationId);
        if (!cancelled.ok) {
          notifications.show({ title: "Couldn't cancel", message: cancelled.error ?? "Please try again.", color: "red" });
          return;
        }
        notifications.show({
          title: "Recurring gift cancelled",
          message: "Your recurring gift has been cancelled. Thank you for your past generosity.",
          color: "teal",
        });
      } catch (err) {
        notifications.show({
          title: "Error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          color: "red",
        });
      }
    });
  }

  const activeRecurring = donations.filter(
    (d) => d.isRecurring && d.status === "succeeded" && d.stripeSubscriptionId,
  );

  return (
    <Stack gap="lg">
      {/* Summary */}
      <Paper withBorder p="lg" radius="md">
        <Group justify="space-between" align="center">
          <Stack gap={2}>
            <Text fz="xs" c="dimmed">
              Total given (all time)
            </Text>
            <Text fz="xl" fw={700}>
              {formatCents(totalGiven)}
            </Text>
          </Stack>
          <Button
            color="teal"
            radius="xl"
            leftSection={<Heart size={14} />}
            onClick={give.open}
            disabled={Boolean(givingNotice)}
          >
            Give now
          </Button>
        </Group>
      </Paper>

      {givingNotice ? (
        <Alert color="yellow" variant="light" radius="md" title="Online giving is off">
          <Text fz="sm">{givingNotice}</Text>
        </Alert>
      ) : null}

      {/* Voluntary giving notice */}
      <Alert color="teal" variant="light" radius="md" icon={<Heart size={14} />}>
        <Text fz="xs">
          All giving is 100% voluntary. There are no minimum amounts or platform fees. Every dollar goes directly to your church.
        </Text>
      </Alert>

      {/* Active recurring */}
      {activeRecurring.length > 0 ? (
        <Paper withBorder p="md" radius="md">
          <Text fw={600} fz="sm" mb="sm">
            Recurring Gifts
          </Text>
          <Stack gap="sm">
            {activeRecurring.map((d) => (
              <Group key={d.id} justify="space-between" align="center">
                <Stack gap={2}>
                  <Text fz="sm">
                    {formatCents(d.amountCents, d.currency)} / month → {d.fundDesignation ?? "General"}
                  </Text>
                  <Text fz="xs" c="dimmed">
                    Started {formatDate(d.createdAt)}
                  </Text>
                </Stack>
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  radius="xl"
                  leftSection={<XCircle size={12} />}
                  loading={isPending}
                  onClick={() => handleCancelRecurring(d.id)}
                >
                  Cancel
                </Button>
              </Group>
            ))}
          </Stack>
        </Paper>
      ) : null}

      {/* Giving history */}
      <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Amount</Table.Th>
              <Table.Th>Fund</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {donations.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text fz="sm" c="dimmed" ta="center" py="sm">
                    No giving history yet.
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              donations.map((d) => (
                <Table.Tr key={d.id}>
                  <Table.Td>
                    <Text fz="xs">{formatDate(d.createdAt)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text fz="xs" fw={600}>
                      {formatCents(d.amountCents, d.currency)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text fz="xs">{d.fundDesignation ?? "General"}</Text>
                  </Table.Td>
                  <Table.Td>
                    {d.isRecurring ? (
                      <Badge size="xs" color="blue" variant="light" leftSection={<RefreshCw size={9} />}>
                        Recurring
                      </Badge>
                    ) : (
                      <Badge size="xs" color="gray" variant="light">
                        One-time
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge size="xs" color={STATUS_COLORS[d.status]} variant="dot">
                      {d.status}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Paper>

      {/* Give drawer */}
      <Drawer
        opened={giveOpen}
        onClose={closeGive}
        title="Give to Your Church"
        position="right"
        size="md"
        radius="lg"
      >
        {checkout && publishableKey ? (
          <Stack gap="md" p="md">
            <Text fw={600}>
              {formatCents(checkout.cents)} to {checkout.fund}
            </Text>
            <DonationCardStep
              publishableKey={publishableKey}
              clientSecret={checkout.clientSecret}
              amountLabel={formatCents(checkout.cents)}
              onPaid={handlePaid}
              onBack={backToForm}
              onCancel={closeGive}
            />
          </Stack>
        ) : (
        <Stack gap="md" p="md">
          <Alert color="teal" icon={<Heart size={13} />} variant="light" radius="md">
            <Text fz="xs">
              All giving is 100% voluntary. There are no required amounts or platform fees. Your gift goes directly to your church.
            </Text>
          </Alert>

          <NumberInput
            label="Amount"
            prefix="$"
            value={amountDollars}
            onChange={setAmountDollars}
            min={1}
            decimalScale={2}
            radius="md"
            required
          />

          <Select
            label="Designate your gift"
            value={fund}
            onChange={(v) => setFund(v ?? "General")}
            data={FUND_OPTIONS}
            radius="md"
          />

          <Switch
            label="Give anonymously"
            description="Your name will not be associated with this gift in church records."
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.currentTarget.checked)}
            size="sm"
          />

          {!isAnonymous ? (
            <>
              <TextInput
                label="Your name (optional)"
                placeholder="For receipt and records"
                value={donorName}
                onChange={(e) => setDonorName(e.currentTarget.value)}
                radius="md"
              />
              <TextInput
                label="Email for receipt (optional)"
                type="email"
                placeholder="you@example.com"
                value={donorEmail}
                onChange={(e) => setDonorEmail(e.currentTarget.value)}
                radius="md"
              />
            </>
          ) : null}

          <Textarea
            label="Note (optional)"
            placeholder="Add a personal note with your gift…"
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            minRows={2}
            autosize
            radius="md"
          />

          <Divider />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" radius="xl" onClick={closeGive}>
              Cancel
            </Button>
            <Button
              color="teal"
              radius="xl"
              loading={isPending}
              disabled={!amountDollars || Number(amountDollars) <= 0}
              leftSection={<Heart size={12} />}
              onClick={handleGive}
            >
              Give {amountDollars ? formatCents(Math.round(Number(amountDollars) * 100)) : ""}
            </Button>
          </Group>
        </Stack>
        )}
      </Drawer>
    </Stack>
  );
}
