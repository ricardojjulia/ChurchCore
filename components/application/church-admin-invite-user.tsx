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

export function ChurchAdminInviteUser() {
  const [opened, { open, close }] = useDisclosure(false);
  const [isPending, startTransition] = useTransition();

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("member");
  const [serverError, setServerError] = useState<string | null>(null);

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
            title: "Preview mode",
            message:
              "Invite emails require a live Supabase backend. Start Supabase locally to send real invites.",
            color: "orange",
          });
        } else {
          notifications.show({
            title: "Invitation sent",
            message: `An invite email has been sent to ${email.trim()}.`,
            color: "teal",
          });
        }
        handleClose();
      } catch (error) {
        setServerError(
          error instanceof Error ? error.message : "Invite could not be sent.",
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
        Invite user
      </Button>

      <Modal
        opened={opened}
        onClose={handleClose}
        title="Invite user"
        size="md"
        radius="lg"
        centered
      >
        <Stack gap="md">
          <Alert color="blue" radius="md">
            The invited person will receive an email with a sign-in link and be
            added to this church with the selected role.
          </Alert>

          <TextInput
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            required
            radius="md"
            placeholder="jane@example.com"
          />
          <TextInput
            label="Full name (optional)"
            value={fullName}
            onChange={(e) => setFullName(e.currentTarget.value)}
            radius="md"
            placeholder="Jane Smith"
            description="Pre-fills their profile when they accept."
          />
          <Select
            label="Role"
            value={role}
            onChange={(v) => setRole(v ?? "member")}
            data={[
              { value: "member", label: "Member / Volunteer" },
              { value: "ministry-leader", label: "Ministry leader" },
              { value: "pastor", label: "Pastor / Elder" },
              { value: "secretary", label: "Secretary / Office Admin" },
              { value: "church-admin", label: "Church admin" },
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
              Cancel
            </Button>
            <Button
              radius="xl"
              onClick={handleInvite}
              loading={isPending}
              disabled={!email.trim()}
              leftSection={<Mail size={15} />}
            >
              Send invite
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
