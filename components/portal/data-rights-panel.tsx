"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Button,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Download, ShieldCheck, Trash2 } from "lucide-react";

import {
  requestDataExportAction,
  requestAccountDeletionAction,
  cancelDeletionRequestAction,
  generateDataExportAction,
} from "@/lib/compliance/data-rights-actions";

export interface DataRightsPanelProps {
  exportRequestedAt: string | null;
  deleteRequestedAt: string | null;
}

export function DataRightsPanel({
  exportRequestedAt,
  deleteRequestedAt,
}: DataRightsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [deletionPending, setDeletionPending] = useState<string | null>(deleteRequestedAt);
  const [exportRequested, setExportRequested] = useState<string | null>(exportRequestedAt);

  function handleRequestExport() {
    startTransition(async () => {
      try {
        await requestDataExportAction();
        setExportRequested(new Date().toISOString());
        notifications.show({
          title: "Export requested",
          message: "Your data export has been queued. Download it below.",
          color: "blue",
        });
      } catch (err) {
        notifications.show({ title: "Error", message: String(err), color: "red" });
      }
    });
  }

  function handleDownloadExport() {
    startTransition(async () => {
      try {
        const payload = await generateDataExportAction();
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `churchcore-ops-data-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        notifications.show({
          title: "Download started",
          message: "Your personal data export has been downloaded.",
          color: "teal",
        });
      } catch (err) {
        notifications.show({ title: "Error", message: String(err), color: "red" });
      }
    });
  }

  function handleRequestDeletion() {
    startTransition(async () => {
      try {
        await requestAccountDeletionAction();
        setDeletionPending(new Date().toISOString());
        notifications.show({
          title: "Deletion requested",
          message: "Your account deletion request has been submitted. You have 30 days to cancel this request.",
          color: "orange",
        });
      } catch (err) {
        notifications.show({ title: "Error", message: String(err), color: "red" });
      }
    });
  }

  function handleCancelDeletion() {
    startTransition(async () => {
      try {
        await cancelDeletionRequestAction();
        setDeletionPending(null);
        notifications.show({
          title: "Deletion cancelled",
          message: "Your account deletion request has been withdrawn.",
          color: "teal",
        });
      } catch (err) {
        notifications.show({ title: "Error", message: String(err), color: "red" });
      }
    });
  }

  return (
    <Stack gap="lg">
      {/* Export section */}
      <Paper withBorder p="lg" radius="md">
        <Group mb="md" gap="sm">
          <ThemeIcon color="blue" variant="light" size="md" radius="md">
            <Download size={16} />
          </ThemeIcon>
          <Text fw={600} fz="sm">
            Download My Data
          </Text>
        </Group>

        <Text fz="xs" c="dimmed" mb="md">
          Download a copy of all personal information ChurchCore Ops holds about you — profile, ministry assignments, consent logs, notification preferences, and giving history. No passwords or payment card data are included.
        </Text>

        {exportRequested ? (
          <Alert color="blue" variant="light" radius="md" mb="sm">
            <Text fz="xs">
              Export requested {new Date(exportRequested).toLocaleDateString()}. Click below to download your data.
            </Text>
          </Alert>
        ) : null}

        <Group gap="xs">
          {!exportRequested ? (
            <Button
              size="xs"
              variant="light"
              color="blue"
              radius="xl"
              leftSection={<Download size={12} />}
              loading={isPending}
              onClick={handleRequestExport}
            >
              Request export
            </Button>
          ) : null}
          {exportRequested ? (
            <Button
              size="xs"
              variant="filled"
              color="blue"
              radius="xl"
              leftSection={<Download size={12} />}
              loading={isPending}
              onClick={handleDownloadExport}
            >
              Download my data
            </Button>
          ) : null}
        </Group>
      </Paper>

      {/* Privacy notice */}
      <Paper withBorder p="lg" radius="md">
        <Group mb="md" gap="sm">
          <ThemeIcon color="teal" variant="light" size="md" radius="md">
            <ShieldCheck size={16} />
          </ThemeIcon>
          <Text fw={600} fz="sm">
            Your Privacy Rights
          </Text>
        </Group>
        <Stack gap="xs">
          <Text fz="xs" c="dimmed">
            Under GDPR and CCPA you have the right to access, correct, and request deletion of your personal data.
          </Text>
          <Text fz="xs" c="dimmed">
            Your giving records are held by your local church and governed by their privacy policy. ChurchCore Ops never shares your personal or financial information with third parties without your consent.
          </Text>
          <Text fz="xs" c="dimmed">
            For questions about how your data is used, contact your church administrator directly.
          </Text>
        </Stack>
      </Paper>

      {/* Deletion section */}
      <Paper withBorder p="lg" radius="md">
        <Group mb="md" gap="sm">
          <ThemeIcon color="red" variant="light" size="md" radius="md">
            <Trash2 size={16} />
          </ThemeIcon>
          <Text fw={600} fz="sm">
            Request Account Deletion
          </Text>
        </Group>

        <Text fz="xs" c="dimmed" mb="md">
          Requesting deletion will flag your account for removal. A church administrator will review and approve the request. You have a 30-day grace period to cancel before any data is permanently erased. Your giving records may be retained by your church for legal and tax compliance.
        </Text>

        {deletionPending ? (
          <>
            <Alert color="orange" variant="light" radius="md" mb="md">
              <Text fz="xs">
                Deletion requested on {new Date(deletionPending).toLocaleDateString()}. Your account will be reviewed by a church administrator. You may cancel this request any time within 30 days.
              </Text>
            </Alert>
            <Button
              size="xs"
              variant="light"
              color="teal"
              radius="xl"
              loading={isPending}
              onClick={handleCancelDeletion}
            >
              Cancel deletion request
            </Button>
          </>
        ) : (
          <Button
            size="xs"
            variant="light"
            color="red"
            radius="xl"
            leftSection={<Trash2 size={12} />}
            loading={isPending}
            onClick={handleRequestDeletion}
          >
            Request account deletion
          </Button>
        )}
      </Paper>

      <Divider />
      <Text fz="xs" c="dimmed" ta="center">
        ChurchCore Ops is committed to your privacy. All data handling is governed by your church&rsquo;s privacy policy and applicable law.
      </Text>
    </Stack>
  );
}
