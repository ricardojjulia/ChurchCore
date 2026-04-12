"use client";

import { useState, useTransition } from "react";
import {
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Pencil } from "lucide-react";

import { updateMemberProfileAction } from "@/app/app/actions";
import type { MemberPortalProfile } from "@/lib/member-portal-data";

type Props = {
  profile: MemberPortalProfile;
};

export function MemberProfileEdit({ profile }: Props) {
  const [opened, { open, close }] = useDisclosure(false);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(profile.fullName);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [preferredContactMethod, setPreferredContactMethod] = useState<
    string | null
  >(profile.preferredContactMethod ?? null);
  const [emergencyContactName, setEmergencyContactName] = useState(
    profile.emergencyContactName ?? "",
  );
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(
    profile.emergencyContactPhone ?? "",
  );
  const [directoryVisible, setDirectoryVisible] = useState(
    profile.directoryVisible,
  );
  const [contactAllowed, setContactAllowed] = useState(profile.contactAllowed);

  function handleOpen() {
    // Reset to current profile values each time the modal opens.
    setFullName(profile.fullName);
    setPhone(profile.phone ?? "");
    setAddress(profile.address ?? "");
    setPreferredContactMethod(profile.preferredContactMethod ?? null);
    setEmergencyContactName(profile.emergencyContactName ?? "");
    setEmergencyContactPhone(profile.emergencyContactPhone ?? "");
    setDirectoryVisible(profile.directoryVisible);
    setContactAllowed(profile.contactAllowed);
    setServerError(null);
    open();
  }

  function handleSave() {
    setServerError(null);
    startTransition(async () => {
      try {
        await updateMemberProfileAction({
          fullName,
          phone: phone || null,
          address: address || null,
          preferredContactMethod,
          emergencyContactName: emergencyContactName || null,
          emergencyContactPhone: emergencyContactPhone || null,
          directoryVisible,
          contactAllowed,
        });
        close();
      } catch (err) {
        setServerError(
          err instanceof Error ? err.message : "Failed to save. Please try again.",
        );
      }
    });
  }

  return (
    <>
      <Button
        variant="default"
        radius="xl"
        leftSection={<Pencil size={15} />}
        onClick={handleOpen}
      >
        Edit profile
      </Button>

      <Modal
        opened={opened}
        onClose={close}
        title="Edit your profile"
        radius="lg"
        size="md"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.currentTarget.value)}
            required
            radius="md"
          />

          <TextInput
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.currentTarget.value)}
            placeholder="(555) 000-0000"
            radius="md"
          />

          <TextInput
            label="Address"
            value={address}
            onChange={(e) => setAddress(e.currentTarget.value)}
            placeholder="123 Main St, City, State"
            radius="md"
          />

          <Select
            label="Preferred contact method"
            value={preferredContactMethod}
            onChange={setPreferredContactMethod}
            data={[
              { value: "email", label: "Email" },
              { value: "sms", label: "SMS / Text" },
              { value: "app", label: "In-app notification" },
              { value: "none", label: "No preference" },
            ]}
            clearable
            placeholder="Select one"
            radius="md"
          />

          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Emergency contact
            </Text>
            <TextInput
              label="Name"
              value={emergencyContactName}
              onChange={(e) => setEmergencyContactName(e.currentTarget.value)}
              placeholder="Jane Doe"
              radius="md"
            />
            <TextInput
              label="Phone"
              value={emergencyContactPhone}
              onChange={(e) => setEmergencyContactPhone(e.currentTarget.value)}
              placeholder="(555) 000-0000"
              radius="md"
            />
          </Stack>

          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Privacy
            </Text>
            <Checkbox
              label="Show my name in the church directory"
              checked={directoryVisible}
              onChange={(e) => setDirectoryVisible(e.currentTarget.checked)}
              radius="sm"
            />
            <Checkbox
              label="Allow other members to contact me"
              checked={contactAllowed}
              onChange={(e) => setContactAllowed(e.currentTarget.checked)}
              radius="sm"
            />
          </Stack>

          {serverError ? (
            <Text c="red" size="sm">
              {serverError}
            </Text>
          ) : null}

          <Group justify="flex-end" mt="xs">
            <Button variant="default" radius="xl" onClick={close}>
              Cancel
            </Button>
            <Button
              radius="xl"
              onClick={handleSave}
              loading={isPending}
              disabled={!fullName.trim()}
            >
              Save changes
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
