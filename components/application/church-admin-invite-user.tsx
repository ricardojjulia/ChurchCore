"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";

import { inviteUserAction } from "@/app/app/actions";
import { useI18n } from "@/components/i18n-provider";

export function ChurchAdminInviteUser() {
  const [opened, { open, close }] = useDisclosure(false);
  const [isPending, startTransition] = useTransition();

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("member");
  const [serverError, setServerError] = useState<string | null>(null);
  const { t } = useI18n();
  const translatePeople = (key: string, values?: Record<string, string | number>) =>
    t("people", key, values);

  function handleClose() {
    setEmail("");
    setFullName("");
    setRole("member");
    setServerError(null);
    close();
  }

  function handleInvite() {
    setServerError(null);
    startTransition(async () => {
      try {
        const result = await inviteUserAction({
          email,
          fullName: fullName || null,
          role,
        });

        if (result?.previewMode) {
          notifications.show({
            title: translatePeople("previewMode"),
            message: translatePeople("previewInviteMessage"),
            color: "orange",
          });
        } else {
          notifications.show({
            title: translatePeople("invitationSent"),
            message: translatePeople("invitationSentMessage", { value: email.trim() }),
            color: "teal",
          });
        }
        handleClose();
      } catch (error) {
        setServerError(
          error instanceof Error ? error.message : translatePeople("inviteError"),
        );
      }
    });
  }

  return (
    <>
      <Button
        variant="default"
        radius="xl"
        leftSection={<Mail size={15} />}
        onClick={open}
      >
        {translatePeople("inviteUser")}
      </Button>

      <Modal
        opened={opened}
        onClose={handleClose}
        title={translatePeople("inviteUser")}
        size="md"
        radius="lg"
        centered
      >
        <Stack gap="md">
          <Alert color="blue" radius="md">
            {translatePeople("inviteDescription")}
          </Alert>

          <TextInput
            label={translatePeople("email")}
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            required
            radius="md"
            placeholder="jane@example.com"
          />
          <TextInput
            label={translatePeople("fullNameOptional")}
            value={fullName}
            onChange={(e) => setFullName(e.currentTarget.value)}
            radius="md"
            placeholder="Jane Smith"
            description={translatePeople("fullNameOptionalDescription")}
          />
          <Select
            label={translatePeople("role")}
            value={role}
            onChange={(v) => setRole(v ?? "member")}
            data={[
              { value: "member", label: translatePeople("member_volunteer") },
              { value: "ministry-leader", label: translatePeople("ministry_leader") },
              { value: "pastor", label: translatePeople("pastor_elder") },
              { value: "secretary", label: translatePeople("secretary") },
              { value: "church-admin", label: translatePeople("church_admin") },
            ]}
            radius="md"
          />

          {serverError ? (
            <Text size="sm" c="red">
              {serverError}
            </Text>
          ) : null}

          <Group justify="flex-end">
            <Button variant="default" radius="xl" onClick={handleClose}>
              {translatePeople("cancel")}
            </Button>
            <Button
              radius="xl"
              onClick={handleInvite}
              loading={isPending}
              disabled={!email.trim()}
              leftSection={<Mail size={15} />}
            >
              {translatePeople("sendInvite")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
