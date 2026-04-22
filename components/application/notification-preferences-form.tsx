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
          title: "Preferences saved",
          message: "Your notification preferences have been updated.",
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

  return (
    <Paper withBorder p="lg" radius="md">
      <Stack gap="md">
        <Text fw={600} fz="sm">
          {isInitialSetup ? "Communication Consent Setup" : "Notification Preferences"}
        </Text>
        <Text fz="xs" c="dimmed">
          {isInitialSetup
            ? "Confirm which channels your church may use to contact you. You can update these choices at any time."
            : "Choose how you would like to receive communications from your church. You can change these at any time."}
        </Text>

        <Stack gap="sm">
          <Switch
            checked={emailOptIn}
            onChange={(e) => setEmailOptIn(e.currentTarget.checked)}
            label="Email notifications"
            description="Receive church announcements and updates by email."
            size="sm"
          />
          <Switch
            checked={smsOptIn}
            onChange={(e) => setSmsOptIn(e.currentTarget.checked)}
            label="SMS notifications"
            description="Receive time-sensitive text messages (standard rates apply)."
            size="sm"
          />
          <Switch
            checked={pushOptIn}
            onChange={(e) => setPushOptIn(e.currentTarget.checked)}
            label="Push notifications"
            description="Receive alerts on your device when the app is installed."
            size="sm"
          />
          <Switch
            checked={inAppOptIn}
            onChange={(e) => setInAppOptIn(e.currentTarget.checked)}
            label="In-app notifications"
            description="See notification badges and messages inside the portal."
            size="sm"
          />
        </Stack>

        <Divider />

        <Text fz="xs" c="dimmed">
          Saving these preferences writes an append-only consent record for each communication channel.
        </Text>

        <Group justify="flex-end">
          <Button
            size="xs"
            radius="xl"
            color="blue"
            loading={isPending}
            onClick={handleSave}
          >
            {isInitialSetup ? "Save consent choices" : "Save preferences"}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
