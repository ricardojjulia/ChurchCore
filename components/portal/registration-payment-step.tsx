"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { FlaskConical } from "lucide-react";

import { DonationCardStep } from "@/components/portal/donation-card-step";
import type { RegistrationCheckout } from "@/lib/event-registration-payment";

export type RegistrationPaymentState = {
  registrationId: string;
  paymentIntentId: string;
  amountLabel: string;
  /** Stripe's card form, when the payment is live (G3.0c). */
  checkout: RegistrationCheckout | null;
};

/**
 * Paying for an event registration (G3.0c), shown right after registering:
 * Stripe's card form on the church's own account when payments are live, a
 * test payment in demo mode, or a note that payment is stubbed (development
 * without Stripe keys).
 */
export function RegistrationPaymentStep({
  payment,
  churchId,
  onPaid,
  onCancel,
}: {
  payment: RegistrationPaymentState;
  churchId: string;
  /** Stripe accepted the payment ("succeeded" or "processing"), or the demo payment completed. */
  onPaid: (status: string) => void;
  /** The registrant chose not to pay: the caller cancels the registration. */
  onCancel: () => void;
}) {
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The registration form was just replaced by this step: move focus here so
  // keyboard and screen reader users land on it (Council Review 36).
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function completeDemoPayment() {
    setDemoLoading(true);
    setDemoError(null);
    try {
      const response = await fetch("/api/demo/complete-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: payment.registrationId, churchId }),
      });
      if (!response.ok) {
        setDemoError("The demo payment couldn't be completed.");
        return;
      }
      onPaid("succeeded");
    } finally {
      setDemoLoading(false);
    }
  }

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="sm">
        <Title order={3} size="h5" ref={headingRef} tabIndex={-1}>
          Pay {payment.amountLabel} to complete your registration
        </Title>
        <Text size="sm" c="dimmed">
          Your place is held while you pay.{" "}
          {payment.checkout
            ? "Closing this window, or choosing Cancel registration, cancels the registration; you won't be charged."
            : "Closing this window cancels the registration."}
        </Text>
        {payment.checkout ? (
          <DonationCardStep
            publishableKey={payment.checkout.publishableKey}
            stripeAccount={payment.checkout.stripeAccount}
            clientSecret={payment.checkout.clientSecret}
            amountLabel={payment.amountLabel}
            onPaid={onPaid}
            onCancel={onCancel}
            cancelLabel="Cancel registration"
          />
        ) : demoMode ? (
          <>
            <Paper p="sm" radius="md" style={{ background: "rgba(20,184,166,0.06)", border: "1px solid rgba(20,184,166,0.25)" }}>
              <Group gap="xs" mb="xs">
                <FlaskConical size={14} color="#0d9488" />
                <Text size="xs" fw={700} c="teal.7" tt="uppercase">Demo Mode — Test Payment</Text>
              </Group>
              <Text size="xs" c="dimmed">No real charge will be made.</Text>
            </Paper>
            {demoError ? (
              <Alert color="red" variant="light" radius="md">
                {demoError}
              </Alert>
            ) : null}
            <Button
              color="teal"
              fullWidth
              loading={demoLoading}
              onClick={completeDemoPayment}
              leftSection={<FlaskConical size={14} />}
            >
              Complete Demo Payment — {payment.amountLabel}
            </Button>
          </>
        ) : (
          <Text size="sm" c="dimmed">
            Payments are stubbed in this environment (no Stripe keys), so there is no card form to show.
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
