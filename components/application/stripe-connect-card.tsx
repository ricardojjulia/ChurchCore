"use client";

import { useEffect, useState, useTransition } from "react";
import { Alert, Badge, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { CreditCard } from "lucide-react";

import { disconnectStripeAccountAction } from "@/app/app/stripe-connect-actions";
import type { ChurchPaymentConnection } from "@/lib/stripe/connect";

// The church-admin card for the church's Stripe account (G3.0b, ADR 0025).
// Gifts and event payments are charged on this account; until it's
// connected and Stripe lets it take charges, online payment is off.

const RESULT_MESSAGES: Record<string, { color: string; text: string }> = {
  connected: { color: "teal", text: "Your Stripe account is connected. Online giving is on." },
  pending: {
    color: "yellow",
    text: "Your Stripe account is connected, but Stripe isn't letting it take payments yet. Finish setting it up in Stripe; this page updates when Stripe confirms.",
  },
  cancelled: { color: "gray", text: "Stripe connection cancelled. Nothing was changed." },
  invalid: { color: "red", text: "That Stripe connection link wasn't valid for this church. Please start again." },
  failed: { color: "red", text: "Couldn't connect to Stripe. Please try again." },
  already_connected: {
    color: "yellow",
    text: "This church is already connected to a Stripe account. Disconnect it first to switch accounts.",
  },
  in_use: {
    color: "red",
    text: "That Stripe account is already connected to another church. Each church connects its own account.",
  },
  not_configured: { color: "red", text: "Stripe Connect isn't set up for ChurchCore yet. Contact ChurchCore support." },
};

export function StripeConnectCard({
  connection,
  result,
}: {
  connection: ChurchPaymentConnection;
  /** The `?stripe=` status the connect flow returned with, if any. */
  result?: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const message = result ? RESULT_MESSAGES[result] : undefined;

  // The result arrives once, as ?stripe=…; drop it from the address so a
  // refresh doesn't show a stale banner beside the live status (Council
  // Review 35).
  useEffect(() => {
    if (!result) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("stripe")) return;
    url.searchParams.delete("stripe");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [result]);

  function disconnect() {
    setError(null);
    startTransition(async () => {
      const outcome = await disconnectStripeAccountAction();
      setConfirming(false);
      if (!outcome.ok) setError(outcome.error ?? "Couldn't disconnect. Please try again.");
    });
  }

  const statusBadge = !connection.connected ? (
    <Badge color="gray" variant="light">Not connected</Badge>
  ) : connection.chargesEnabled ? (
    <Badge color="teal" variant="light">Connected · taking payments</Badge>
  ) : (
    <Badge color="yellow" variant="light">Connected · setup unfinished</Badge>
  );

  return (
    <Paper withBorder radius="lg" p="md" m="md" mb={0}>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Group gap="xs">
            <CreditCard size={18} />
            <Title order={3} size="h5">
              Online payments (Stripe)
            </Title>
          </Group>
          {statusBadge}
        </Group>
        <Text fz="sm" c="dimmed">
          Gifts and event payments go straight to your church&apos;s own Stripe account. ChurchCore never holds the
          money and takes no fee; Stripe&apos;s standard processing fees apply.
          {connection.accountHint ? ` Account ${connection.accountHint}.` : ""}
        </Text>
        {message ? (
          <Alert color={message.color} variant="light" radius="md">
            {message.text}
          </Alert>
        ) : null}
        {error ? (
          <Alert color="red" variant="light" radius="md">
            {error}
          </Alert>
        ) : null}
        <Group gap="sm">
          {connection.connected && confirming ? (
            <>
              <Text fz="sm">Disconnect? Online giving and event payments stop until you connect again.</Text>
              <Button color="red" radius="xl" loading={isPending} onClick={disconnect}>
                Yes, disconnect
              </Button>
              <Button variant="subtle" radius="xl" disabled={isPending} onClick={() => setConfirming(false)}>
                Keep connected
              </Button>
            </>
          ) : connection.connected ? (
            <Button variant="default" radius="xl" onClick={() => setConfirming(true)}>
              Disconnect Stripe
            </Button>
          ) : connection.platformReady ? (
            <Button component="a" href="/api/stripe/connect/start" radius="xl" color="grape">
              Connect with Stripe
            </Button>
          ) : (
            <Text fz="sm" c="dimmed">
              Stripe Connect isn&apos;t set up for ChurchCore yet, so online payments can&apos;t be turned on.
            </Text>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}
