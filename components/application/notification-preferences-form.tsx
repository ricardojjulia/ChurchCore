"use client";

import { useState, useTransition } from "react";
import {
  Button,
  Divider,
  Group,
  Paper,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";

import { updateNotificationPreferencesAction } from "@/app/app/communications-actions";
import { useI18n } from "@/components/i18n-provider";

export interface NotificationPreferencesFormProps {
  profileId: string;
  initial: {
    emailOptIn: boolean;
    smsOptIn: boolean;
    pushOptIn: boolean;
    inAppOptIn: boolean;
  };
  isInitialSetup?: boolean;
}

export function NotificationPreferencesForm({
  profileId,
  initial,
  isInitialSetup = false,
}: NotificationPreferencesFormProps) {
  const [emailOptIn, setEmailOptIn] = useState(initial.emailOptIn);
  const [smsOptIn, setSmsOptIn] = useState(initial.smsOptIn);
  const [pushOptIn, setPushOptIn] = useState(initial.pushOptIn);
  const [inAppOptIn, setInAppOptIn] = useState(initial.inAppOptIn);

  const [isPending, startTransition] = useTransition();
  const { t } = useI18n();
  const translateMember = (key: string) => t("member", key);

  function handleSave() {
    startTransition(async () => {
      try {
        await updateNotificationPreferencesAction({
          profileId,
          emailOptIn,
          smsOptIn,
          pushOptIn,
          inAppOptIn,
        });
        notifications.show({
          title: translateMember("preferencesSaved"),
          message: translateMember("preferencesSavedMessage"),
          color: "teal",
        });
      } catch (err) {
        notifications.show({
          title: translateMember("error"),
          message: err instanceof Error ? err.message : translateMember("genericError"),
          color: "red",
        });
      }
    });
  }

  return (
    <Paper withBorder p="lg" radius="md">
      <Stack gap="md">
        <Text fw={600} fz="sm">
          {isInitialSetup
            ? translateMember("communicationConsentSetup")
            : translateMember("notificationPreferences")}
        </Text>
        <Text fz="xs" c="dimmed">
          {isInitialSetup
            ? translateMember("communicationConsentDescription")
            : translateMember("notificationPreferencesDescription")}
        </Text>

        <Stack gap="sm">
          <Switch
            checked={emailOptIn}
            onChange={(e) => setEmailOptIn(e.currentTarget.checked)}
            label={translateMember("emailNotifications")}
            description={translateMember("emailNotificationsDescription")}
            size="sm"
          />
          <Switch
            checked={smsOptIn}
            onChange={(e) => setSmsOptIn(e.currentTarget.checked)}
            label={translateMember("smsNotifications")}
            description={translateMember("smsNotificationsDescription")}
            size="sm"
          />
          <Switch
            checked={pushOptIn}
            onChange={(e) => setPushOptIn(e.currentTarget.checked)}
            label={translateMember("pushNotifications")}
            description={translateMember("pushNotificationsDescription")}
            size="sm"
          />
          <Switch
            checked={inAppOptIn}
            onChange={(e) => setInAppOptIn(e.currentTarget.checked)}
            label={translateMember("inAppNotifications")}
            description={translateMember("inAppNotificationsDescription")}
            size="sm"
          />
        </Stack>

        <Divider />

        <Text fz="xs" c="dimmed">
          {translateMember("consentRecordDescription")}
        </Text>

        <Group justify="flex-end">
          <Button
            size="xs"
            radius="xl"
            color="blue"
            loading={isPending}
            onClick={handleSave}
          >
            {isInitialSetup
              ? translateMember("saveConsentChoices")
              : translateMember("savePreferences")}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
