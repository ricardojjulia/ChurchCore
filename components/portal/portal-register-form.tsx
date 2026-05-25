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
import { useI18n } from "@/components/i18n-provider";
import type { PublicPortalChurch } from "@/lib/public-portal-data";

export function PortalRegisterForm({
  churches,
  initialChurchId,
  resolvedChurch,
}: {
  churches: PublicPortalChurch[];
  initialChurchId: string | null;
  resolvedChurch: PublicPortalChurch | null;
}) {
  const [churchId, setChurchId] = useState(
    initialChurchId ?? (churches.length === 1 ? churches[0].id : null),
  );
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isPending, startTransition] = useTransition();
  const { t } = useI18n();
  const translate = (key: string, values?: Record<string, string | number>) =>
    t("portal", key, values);

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
          title: translate("requestReceived"),
          message: result.previewMode
            ? translate("previewRequestSubmitted")
            : translate("requestSubmitted"),
          color: result.previewMode ? "orange" : "teal",
        });

        setFirstName("");
        setLastName("");
        setEmail("");
        setPhone("");
      } catch (error) {
        notifications.show({
          title: translate("requestFailed"),
          message:
            error instanceof Error ? error.message : translate("requestFailedMessage"),
          color: "red",
        });
      }
    });
  }

  return (
    <Paper withBorder radius="xl" p={{ base: "lg", sm: "xl" }}>
      <Stack gap="lg">
        <div>
          <Title order={2}>{translate("requestTitle")}</Title>
          <Text size="sm" c="dimmed" mt="sm">
            {translate("registerDescription")}
          </Text>
        </div>

        <Alert color="blue" radius="xl" variant="light">
          {translate("portalPrivacy")}
        </Alert>

        {resolvedChurch ? (
          <Alert color="teal" radius="xl" variant="light">
            {translate("detectedChurchRoute", { church: resolvedChurch.name })}
          </Alert>
        ) : null}

        <Select
          label={translate("church")}
          value={churchId}
          onChange={setChurchId}
          data={churchOptions}
          placeholder={translate("selectChurch")}
          searchable
          radius="xl"
          disabled={!churchOptions.length || Boolean(resolvedChurch)}
        />

        <Stack gap="md">
          <TextInput
            label={translate("firstName")}
            value={firstName}
            onChange={(event) => setFirstName(event.currentTarget.value)}
            radius="xl"
            required
          />
          <TextInput
            label={translate("lastName")}
            value={lastName}
            onChange={(event) => setLastName(event.currentTarget.value)}
            radius="xl"
            required
          />
          <TextInput
            label={translate("email")}
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            radius="xl"
            required
          />
          <TextInput
            label={translate("phone")}
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
          {translate("submitRequest")}
        </Button>
      </Stack>
    </Paper>
  );
}
