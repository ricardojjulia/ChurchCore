"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";

// One Stripe.js load per publishable key for the page's lifetime.
const stripeByKey = new Map<string, Promise<Stripe | null>>();
function stripeFor(publishableKey: string) {
  if (!stripeByKey.has(publishableKey))
    stripeByKey.set(publishableKey, loadStripe(publishableKey));
  return stripeByKey.get(publishableKey)!;
}

type Props = {
  publishableKey: string;
  clientSecret: string;
  amountLabel: string;
  /** Stripe accepted the payment: its PaymentIntent status ("succeeded" or "processing"). */
  onPaid: (status: string) => void;
  /** Back to the amount and fund; the pending gift is cancelled. */
  onBack: () => void;
  onCancel: () => void;
};

/**
 * The card step of a gift (G3.0): Stripe's Payment Element collects the card
 * in Stripe's own iframe — no card details reach ChurchCore — and confirms
 * the PaymentIntent in the browser. The server then checks the status with
 * Stripe itself before recording anything (confirmDonationAction), and the
 * webhook stays the source of truth.
 */
export function DonationCardStep({
  publishableKey,
  clientSecret,
  ...rest
}: Props) {
  const stripePromise = useMemo(
    () => stripeFor(publishableKey),
    [publishableKey],
  );
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CardForm {...rest} />
    </Elements>
  );
}

function CardForm({
  amountLabel,
  onPaid,
  onBack,
  onCancel,
}: Omit<Props, "publishableKey" | "clientSecret">) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  async function pay() {
    if (!stripe || !elements) return;
    setPaying(true);
    setError(null);
    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      // Cards complete here; only methods that need a bank page redirect.
      redirect: "if_required",
      confirmParams: { return_url: window.location.href },
    });
    setPaying(false);
    if (stripeError) {
      // A declined card, wrong CVC, expired card… Stripe's own wording; the
      // member can fix it and try again, and nothing was charged.
      setError(
        stripeError.message ??
          "Your card couldn't be charged. Nothing was taken; please try again.",
      );
      return;
    }
    onPaid(paymentIntent?.status ?? "processing");
  }

  return (
    <Stack gap="md">
      <Text fz="sm" c="dimmed">
        Card details go straight to Stripe and are never stored by ChurchCore.
      </Text>
      <PaymentElement />
      {error ? (
        <Alert
          color="red"
          variant="light"
          radius="md"
          title="Payment didn't go through"
        >
          {error}
        </Alert>
      ) : null}
      <Group justify="space-between" gap="sm">
        <Button variant="subtle" radius="xl" onClick={onBack} disabled={paying}>
          Back
        </Button>
        <Group gap="sm">
          <Button
            variant="default"
            radius="xl"
            onClick={onCancel}
            disabled={paying}
          >
            Cancel
          </Button>
          <Button
            color="teal"
            radius="xl"
            loading={paying}
            disabled={!stripe || !elements}
            onClick={pay}
          >
            Pay {amountLabel}
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}
