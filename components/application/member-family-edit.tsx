"use client";

import { useState, useTransition } from "react";
import { Home, Pencil } from "lucide-react";
import {
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

import { upsertMemberFamilyAction } from "@/app/app/actions";
import type { MemberPortalFamily } from "@/lib/member-portal-data";

type Props = {
  family: MemberPortalFamily | null;
};

export function MemberFamilyEdit({ family }: Props) {
  const [opened, { open, close }] = useDisclosure(false);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const [familyName, setFamilyName] = useState(family?.familyName ?? "");
  const [address, setAddress] = useState(family?.address ?? "");
  const [homePhone, setHomePhone] = useState(family?.homePhone ?? "");

  function handleOpen() {
    setFamilyName(family?.familyName ?? "");
    setAddress(family?.address ?? "");
    setHomePhone(family?.homePhone ?? "");
    setServerError(null);
    open();
  }

  function handleSave() {
    setServerError(null);
    startTransition(async () => {
      try {
        await upsertMemberFamilyAction({
          familyName,
          address: address || null,
          homePhone: homePhone || null,
        });
        close();
      } catch (error) {
        setServerError(
          error instanceof Error ? error.message : "Family could not be saved.",
        );
      }
    });
  }

  return (
    <>
      <Button
        variant={family ? "default" : "filled"}
        radius="xl"
        leftSection={family ? <Pencil size={15} /> : <Home size={15} />}
        onClick={handleOpen}
      >
        {family ? "Edit family" : "Add family"}
      </Button>

      <Modal
        opened={opened}
        onClose={close}
        title={family ? "Update family" : "Create family"}
        radius="lg"
        size="md"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Family name"
            value={familyName}
            onChange={(event) => setFamilyName(event.currentTarget.value)}
            placeholder="Park family"
            required
            radius="md"
          />

          <TextInput
            label="Address"
            value={address}
            onChange={(event) => setAddress(event.currentTarget.value)}
            placeholder="123 Main St, City, State"
            radius="md"
          />

          <TextInput
            label="Home phone"
            value={homePhone}
            onChange={(event) => setHomePhone(event.currentTarget.value)}
            placeholder="(555) 000-0000"
            radius="md"
          />

          <Text size="sm" c="dimmed">
            This updates the household record linked to your church profile.
          </Text>

          {serverError ? (
            <Text size="sm" c="red">
              {serverError}
            </Text>
          ) : null}

          <Group justify="flex-end">
            <Button variant="default" radius="xl" onClick={close}>
              Cancel
            </Button>
            <Button
              radius="xl"
              onClick={handleSave}
              loading={isPending}
              disabled={!familyName.trim()}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
