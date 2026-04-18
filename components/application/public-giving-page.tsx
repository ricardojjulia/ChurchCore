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
import { Heart, Lock, AlertCircle, Check } from "lucide-react";

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
    { value: "one_time", label: "One-time" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
  ];

  async function handleSubmit() {
    if (!amount || Number(amount) < 1) {
      setError("Please enter a gift amount of at least $1.");
      return;
    }
    if (!isAnonymous && !email.trim()) {
      setError("Email is required to receive your giving receipt.");
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
            <Title order={3} ta="center">Thank you!</Title>
            <Text c="dimmed" ta="center">
              Your gift of{" "}
              <strong>${Number(amount).toLocaleString()}</strong> to{" "}
              <strong>{fund}</strong> has been received.
            </Text>
            {!isAnonymous && email && (
              <Text size="sm" c="dimmed" ta="center">
                A receipt will be sent to <strong>{email}</strong>.
              </Text>
            )}
            <Text size="xs" c="dimmed" ta="center" mt="sm">
              {data.churchName} — your generosity makes a difference.
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
              <Text fw={500} size="sm" mb="xs">Gift amount</Text>
              <Group gap="xs" mb="xs">
                {PRESET_AMOUNTS.map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={Number(amount) === p ? "filled" : "default"}
                    onClick={() => setAmount(p)}
                  >
                    ${p}
                  </Button>
                ))}
              </Group>
              <NumberInput
                placeholder="Other amount"
                value={amount}
                onChange={(v) => setAmount(v === "" ? "" : Number(v))}
                min={1}
                prefix="$"
              />
            </div>

            {/* Fund */}
            {data.funds.length > 1 && (
              <Select
                label="Designate to"
                data={data.funds}
                value={fund}
                onChange={(v) => setFund(v ?? data.funds[0])}
              />
            )}

            {/* Frequency */}
            <Select
              label="Frequency"
              data={FREQUENCIES.map((f) => ({ value: f.value, label: f.label }))}
              value={frequency}
              onChange={(v) => setFrequency((v ?? "one_time") as GivingFrequency)}
            />

            <Divider />

            {/* Donor info */}
            {data.allowAnonymous && (
              <Switch
                label="Give anonymously"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
              />
            )}

            {!isAnonymous && (
              <>
                <TextInput
                  label="Full name (optional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <TextInput
                  label="Email (for receipt)"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </>
            )}

            <Textarea
              label="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="In honor of, in memory of, or a message..."
            />

            <Button
              size="lg"
              leftSection={<Heart size={18} />}
              onClick={handleSubmit}
              loading={isLoading}
              fullWidth
            >
              Give ${amount ? Number(amount).toLocaleString() : "0"}
              {frequency !== "one_time" ? ` / ${frequency.replace("_", " ")}` : ""}
            </Button>

            <Group gap={4} justify="center">
              <Lock size={12} />
              <Text size="xs" c="dimmed">Secure payment powered by Stripe</Text>
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </div>
  );
}
