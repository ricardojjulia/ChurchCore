"use client";

import { useMemo, useState, useTransition } from "react";
import { MailCheck } from "lucide-react";
import {
  Alert,
  Button,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";

import { submitPortalAccountRequestAction } from "@/app/portal/actions";
import type { PublicPortalChurch } from "@/lib/public-portal-data";

export function PortalRegisterForm({
  churches,
  initialChurchId,
}: {
  churches: PublicPortalChurch[];
  initialChurchId: string | null;
}) {
  const [churchId, setChurchId] = useState(
    initialChurchId ?? (churches.length === 1 ? churches[0].id : null),
  );
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isPending, startTransition] = useTransition();

  const churchOptions = useMemo(
    () =>
      churches.map((church) => ({
        value: church.id,
        label: church.name,
      })),
    [churches],
  );

  function handleSubmit() {
    startTransition(async () => {
      try {
        const result = await submitPortalAccountRequestAction({
          churchId: churchId ?? "",
          firstName,
          lastName,
          email,
          phone: phone || null,
        });

        notifications.show({
          title: "Request received",
          message: result.previewMode
            ? "Preview mode recorded the request locally. Connect the tenant backend to send it through the real approval flow."
            : "Your request was submitted. A church administrator will review it and send a portal invitation if approved.",
          color: result.previewMode ? "orange" : "teal",
        });

        setFirstName("");
        setLastName("");
        setEmail("");
        setPhone("");
      } catch (error) {
        notifications.show({
          title: "Request failed",
          message: error instanceof Error ? error.message : "The request could not be submitted.",
          color: "red",
        });
      }
    });
  }

  return (
    <Paper withBorder radius="xl" p={{ base: "lg", sm: "xl" }}>
      <Stack gap="lg">
        <div>
          <Title order={2}>Request portal access</Title>
          <Text size="sm" c="dimmed" mt="sm">
            Submit your details to request access to the ChurchForge member portal. Your church will review the request before activating an account.
          </Text>
        </div>

        <Alert color="blue" radius="xl" variant="light">
          The portal exposes only your own profile, attendance history, and serving assignments.
        </Alert>

        <Select
          label="Church"
          value={churchId}
          onChange={setChurchId}
          data={churchOptions}
          placeholder="Select your church"
          searchable
          radius="xl"
          disabled={!churchOptions.length}
        />

        <Stack gap="md">
          <TextInput
            label="First name"
            value={firstName}
            onChange={(event) => setFirstName(event.currentTarget.value)}
            radius="xl"
            required
          />
          <TextInput
            label="Last name"
            value={lastName}
            onChange={(event) => setLastName(event.currentTarget.value)}
            radius="xl"
            required
          />
          <TextInput
            label="Email"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            radius="xl"
            required
          />
          <TextInput
            label="Phone"
            value={phone}
            onChange={(event) => setPhone(event.currentTarget.value)}
            radius="xl"
          />
        </Stack>

        <Button
          leftSection={<MailCheck size={16} />}
          onClick={handleSubmit}
          loading={isPending}
          disabled={!churchId || !firstName.trim() || !lastName.trim() || !email.trim()}
        >
          Submit request
        </Button>
      </Stack>
    </Paper>
  );
}
