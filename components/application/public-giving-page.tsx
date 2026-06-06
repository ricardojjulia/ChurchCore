"use client";

import { useState } from "react";
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
import { useI18n } from "@/components/i18n-provider";

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

type GivingFrequency = "one_time" | "weekly" | "monthly";

export function PublicGivingPage({ data }: PublicGivingPageProps) {
  const { locale, t } = useI18n();
  const tr = (key: string, values?: Record<string, string | number>) =>
    t("publicGiving", key, values);
  const [amount, setAmount] = useState<number | "">(50);
  const [fund, setFund] = useState(data.funds[0] ?? "General Fund");
  const [frequency, setFrequency] = useState<GivingFrequency>("one_time");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [step, setStep] = useState<"form" | "submitted">("form");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const PRESET_AMOUNTS = [25, 50, 100, 250, 500];
  const FREQUENCIES: { value: GivingFrequency; label: string }[] = [
    { value: "one_time", label: tr("frequencyOneTime") },
    { value: "weekly", label: tr("frequencyWeekly") },
    { value: "monthly", label: tr("frequencyMonthly") },
  ];

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
    setIsLoading(true);

    // In production: call a server action that creates a Stripe PaymentIntent
    // and returns a client_secret for Stripe Elements to complete payment.
    // This scaffold shows the UX flow; Stripe integration wires up here.
    await new Promise((r) => setTimeout(r, 600));

    setIsLoading(false);
    setStep("submitted");
  }

  if (step === "submitted") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--mantine-color-gray-0)", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
    <div style={{ minHeight: "100vh", background: "var(--mantine-color-gray-0)", padding: "2rem 1rem" }}>
      <Stack align="center" gap="lg">
        <div style={{ textAlign: "center" }}>
          <Text size="sm" c="dimmed" tt="uppercase" fw={500} mb={4}>{data.churchName}</Text>
          <Title order={2}>{data.headline}</Title>
          {data.description && <Text c="dimmed" mt={4}>{data.description}</Text>}
        </div>

        <Paper p="xl" radius="md" withBorder style={{ maxWidth: 480, width: "100%" }}>
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

            {/* Frequency */}
            <Select
              label={tr("frequency")}
              data={FREQUENCIES.map((f) => ({ value: f.value, label: f.label }))}
              value={frequency}
              onChange={(v) => setFrequency((v ?? "one_time") as GivingFrequency)}
            />

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
              {frequency !== "one_time" ? ` / ${FREQUENCIES.find((item) => item.value === frequency)?.label ?? frequency}` : ""}
            </Button>

            <Group gap={4} justify="center">
              <Lock size={12} />
              <Text size="xs" c="dimmed">{tr("securePayment")}</Text>
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </div>
  );
}
