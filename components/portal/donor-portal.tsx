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
  initiateDonationAction,
  cancelRecurringDonationAction,
} from "@/app/app/donations-actions";
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

export function DonorPortal({ data }: { data: DonorPortalData }) {
  const { donations, totalGiven } = data;

  const [giveOpen, give] = useDisclosure(false);
  const [amountDollars, setAmountDollars] = useState<number | string>(25);
  const [fund, setFund] = useState<string>("General");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

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

        if (result.isStub) {
          notifications.show({
            title: "Gift recorded (dev mode)",
            message: `Thank you for your generous gift of ${formatCents(cents)} to ${fund}. (Stripe not configured — running in stub mode.)`,
            color: "teal",
          });
        } else {
          // In production, load Stripe Elements here using result.clientSecret
          notifications.show({
            title: "Gift initiated",
            message: `Your gift of ${formatCents(cents)} to ${fund} is being processed. A receipt will be sent to ${donorEmail || "your email"}.`,
            color: "teal",
          });
        }

        setAmountDollars(25);
        setNote("");
        give.close();
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
        await cancelRecurringDonationAction(donationId);
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
          >
            Give now
          </Button>
        </Group>
      </Paper>

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
        onClose={give.close}
        title="Give to Your Church"
        position="right"
        size="md"
        radius="lg"
      >
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
            <Button variant="default" radius="xl" onClick={give.close}>
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
      </Drawer>
    </Stack>
  );
}
