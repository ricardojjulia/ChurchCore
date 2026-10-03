"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Button,
  Divider,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { Heart, Lock, AlertCircle, Check, FlaskConical } from "lucide-react";
import { cancelPublicGiftAction, submitPublicGiftAction } from "@/app/give/actions";
import { useI18n } from "@/components/i18n-provider";
import { DonationCardStep } from "@/components/portal/donation-card-step";

type PublicGivingPageProps = {
  data: {
    churchName: string;
    headline: string;
    description: string | null;
    funds: string[];
    allowAnonymous: boolean;
    slug: string;
  };
  slug: string;
};

type Checkout = {
  donationId: string;
  paymentIntentId: string;
  clientSecret: string;
  publishableKey: string;
  stripeAccount: string;
};

export function PublicGivingPage({ data }: PublicGivingPageProps) {
  const { locale, t } = useI18n();
  const tr = (key: string, values?: Record<string, string | number>) =>
    t("publicGiving", key, values);
  const [amount, setAmount] = useState<number | "">(50);
  const [fund, setFund] = useState(data.funds[0] ?? "General Fund");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [step, setStep] = useState<"form" | "submitted">("form");
  const [error, setError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [isLoading, startTransition] = useTransition();

  const PRESET_AMOUNTS = [25, 50, 100, 250, 500];

  function formatAmount(value: number | "") {
    const numeric = Number(value || 0);
    return new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(numeric);
  }

  async function handleSubmit() {
    if (!amount || Number(amount) < 1) {
      setError(tr("minimumGiftError"));
      return;
    }
    if (!isAnonymous && !email.trim()) {
      setError(tr("emailRequiredError"));
      return;
    }

    setError(null);
    // A real one-time gift on the church's own Stripe account (G3.1). Until
    // this, the page showed "thank you" without charging or recording
    // anything. Recurring gifts are for signed-in members.
    startTransition(async () => {
      const result = await submitPublicGiftAction({
        slug: data.slug,
        amountCents: Math.round(Number(amount) * 100),
        fund,
        isAnonymous,
        donorName: isAnonymous ? null : name,
        donorEmail: isAnonymous ? null : email,
        note,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!result.checkout) {
        setStep("submitted"); // stubbed (development, demo): recorded already
        return;
      }
      setCheckout({ donationId: result.donationId, paymentIntentId: result.paymentIntentId, ...result.checkout });
    });
  }

  // Leaving the card step cancels the PaymentIntent and the pending gift;
  // if Stripe already has the payment, the gift stands.
  function leaveCheckout() {
    const open = checkout;
    if (!open) return;
    startTransition(async () => {
      const result = await cancelPublicGiftAction(open.donationId, open.paymentIntentId);
      if (!result.ok) {
        setError(result.error ?? "Couldn't cancel the gift. Please try again.");
        return;
      }
      setCheckout(null);
      if (!result.cancelled) setStep("submitted");
    });
  }

  if (step === "submitted") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--background)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Paper p="xl" radius="md" withBorder style={{ maxWidth: 480, width: "100%" }}>
          <Stack align="center" gap="md">
            <div style={{ background: "var(--mantine-color-green-1)", borderRadius: "50%", width: 64, height: 64, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Check size={32} color="var(--mantine-color-green-7)" />
            </div>
            <Title order={3} ta="center">{tr("thankYou")}</Title>
            <Text c="dimmed" ta="center">
              {tr("giftReceivedPrefix")} <strong>{formatAmount(amount)}</strong> {tr("giftReceivedTo")} <strong>{fund}</strong> {tr("giftReceivedSuffix")}
            </Text>
            {!isAnonymous && email && (
              <Text size="sm" c="dimmed" ta="center">
                {tr("receiptSentTo")} <strong>{email}</strong>.
              </Text>
            )}
            <Text size="xs" c="dimmed" ta="center" mt="sm">
              {data.churchName} - {tr("generosityLine")}
            </Text>
          </Stack>
        </Paper>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", padding: "2rem 1rem" }}>
      <Stack align="center" gap="lg">
        <div style={{ textAlign: "center" }}>
          <Text size="sm" c="dimmed" tt="uppercase" fw={500} mb={4}>{data.churchName}</Text>
          <Title order={2}>{data.headline}</Title>
          {data.description && <Text c="dimmed" mt={4}>{data.description}</Text>}
        </div>

        <Paper p="xl" radius="md" withBorder style={{ maxWidth: 480, width: "100%" }}>
          {checkout ? (
            <Stack gap="md">
              {error && (
                <Alert color="red" icon={<AlertCircle size={16} />} onClose={() => setError(null)} withCloseButton>
                  {error}
                </Alert>
              )}
              <Text fw={600}>
                {formatAmount(amount)} · {fund}
              </Text>
              <DonationCardStep
                publishableKey={checkout.publishableKey}
                stripeAccount={checkout.stripeAccount}
                clientSecret={checkout.clientSecret}
                amountLabel={formatAmount(amount)}
                onPaid={() => {
                  setCheckout(null);
                  setStep("submitted");
                }}
                onBack={leaveCheckout}
                onCancel={leaveCheckout}
              />
            </Stack>
          ) : (
          <Stack gap="md">
            {error && (
              <Alert color="red" icon={<AlertCircle size={16} />} onClose={() => setError(null)} withCloseButton>
                {error}
              </Alert>
            )}

            {/* Amount */}
            <div>
              <Text fw={500} size="sm" mb="xs">{tr("giftAmount")}</Text>
              <Group gap="xs" mb="xs">
                {PRESET_AMOUNTS.map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={Number(amount) === p ? "filled" : "default"}
                    onClick={() => setAmount(p)}
                  >
                    {formatAmount(p)}
                  </Button>
                ))}
              </Group>
              <NumberInput
                placeholder={tr("otherAmount")}
                value={amount}
                onChange={(v) => setAmount(v === "" ? "" : Number(v))}
                min={1}
                prefix="$"
              />
            </div>

            {/* Fund */}
            {data.funds.length > 1 && (
              <Select
                label={tr("designateTo")}
                data={data.funds}
                value={fund}
                onChange={(v) => setFund(v ?? data.funds[0])}
              />
            )}

            <Divider />

            {/* Donor info */}
            {data.allowAnonymous && (
              <Switch
                label={tr("giveAnonymously")}
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
              />
            )}

            {!isAnonymous && (
              <>
                <TextInput
                  label={tr("fullNameOptional")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <TextInput
                  label={tr("emailForReceipt")}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </>
            )}

            <Textarea
              label={tr("noteOptional")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={tr("notePlaceholder")}
            />

            {/* Demo mode: locked card display instead of real Stripe Elements */}
            {process.env.NEXT_PUBLIC_DEMO_MODE === "true" ? (
              <Paper p="sm" radius="md" style={{ background: "rgba(20,184,166,0.06)", border: "1px solid rgba(20,184,166,0.25)" }}>
                <Group gap="xs" mb="xs">
                  <FlaskConical size={14} color="#0d9488" />
                  <Text size="xs" fw={700} c="teal.7" tt="uppercase">Demo Mode — Test Payment</Text>
                </Group>
                <Stack gap={6}>
                  <Group gap="xs">
                    <Text size="xs" c="dimmed" w={80}>Card</Text>
                    <Text size="xs" ff="monospace" fw={600}>4242 4242 4242 4242</Text>
                  </Group>
                  <Group gap="xs">
                    <Text size="xs" c="dimmed" w={80}>Expiry</Text>
                    <Text size="xs" ff="monospace" fw={600}>12 / 29</Text>
                  </Group>
                  <Group gap="xs">
                    <Text size="xs" c="dimmed" w={80}>CVC</Text>
                    <Text size="xs" ff="monospace" fw={600}>123</Text>
                  </Group>
                </Stack>
                <Text size="xs" c="dimmed" mt="xs">No real charge will be made. This simulates the full giving flow.</Text>
              </Paper>
            ) : null}

            <Button
              size="lg"
              leftSection={<Heart size={18} />}
              onClick={handleSubmit}
              loading={isLoading}
              fullWidth
            >
              {process.env.NEXT_PUBLIC_DEMO_MODE === "true" ? "Complete Demo Gift — " : `${tr("giveAmountPrefix")} `}{formatAmount(amount)}
            </Button>

            <Group gap={4} justify="center">
              <Lock size={12} />
              <Text size="xs" c="dimmed">{tr("securePayment")}</Text>
            </Group>
          </Stack>
          )}
        </Paper>
      </Stack>
    </div>
  );
}
