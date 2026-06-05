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
  churchId?: string;
  initial: {
    emailOptIn: boolean;
    smsOptIn: boolean;
    pushOptIn: boolean;
    inAppOptIn: boolean;
  };
  isInitialSetup?: boolean;
}

async function subscribeBrowserPush(churchId: string, profileId: string): Promise<void> {
  if (typeof window === "undefined" || !("PushManager" in window)) return;

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidPublicKey,
    });

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subscription.toJSON(), churchId, profileId }),
    });
  } catch {
    // Browser push subscription is best-effort — never block the form save
  }
}

export function NotificationPreferencesForm({
  profileId,
  churchId,
  initial,
  isInitialSetup = false,
}: NotificationPreferencesFormProps) {
  const [emailOptIn, setEmailOptIn] = useState(initial.emailOptIn);
  const [smsOptIn, setSmsOptIn] = useState(initial.smsOptIn);
  const [pushOptIn, setPushOptIn] = useState(initial.pushOptIn);
  const [inAppOptIn, setInAppOptIn] = useState(initial.inAppOptIn);
  const [browserPushSupported] = useState(
    typeof window !== "undefined" && "PushManager" in window,
  );

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
          {browserPushSupported ? (
            <Switch
              checked={pushOptIn}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                setPushOptIn(checked);
                if (checked && churchId) {
                  void subscribeBrowserPush(churchId, profileId);
                }
              }}
              label={translateMember("pushNotifications")}
              description={translateMember("pushNotificationsDescription")}
              size="sm"
            />
          ) : null}
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
