"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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

import { updateChurchAdminPersonAction } from "@/app/app/actions";
import type { ChurchAdminPersonEntry } from "@/lib/church-admin-people-data";

export function ChurchAdminPersonEdit({
  person,
}: {
  person: ChurchAdminPersonEntry;
}) {
  const router = useRouter();
  const [opened, { open, close }] = useDisclosure(false);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(person.fullName);
  const [phone, setPhone] = useState(person.phone ?? "");
  const [address, setAddress] = useState(person.address ?? "");
  const [displayTitle, setDisplayTitle] = useState(person.displayTitle ?? "");
  const [membershipStatus, setMembershipStatus] = useState(person.membershipStatus);
  const [preferredContactMethod, setPreferredContactMethod] = useState<string | null>(
    person.preferredContactMethod ?? null,
  );
  const [emergencyContactName, setEmergencyContactName] = useState(
    person.emergencyContactName ?? "",
  );
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(
    person.emergencyContactPhone ?? "",
  );
  const [directoryVisible, setDirectoryVisible] = useState(person.directoryVisible);
  const [contactAllowed, setContactAllowed] = useState(person.contactAllowed);

  function handleOpen() {
    setFullName(person.fullName);
    setPhone(person.phone ?? "");
    setAddress(person.address ?? "");
    setDisplayTitle(person.displayTitle ?? "");
    setMembershipStatus(person.membershipStatus);
    setPreferredContactMethod(person.preferredContactMethod ?? null);
    setEmergencyContactName(person.emergencyContactName ?? "");
    setEmergencyContactPhone(person.emergencyContactPhone ?? "");
    setDirectoryVisible(person.directoryVisible);
    setContactAllowed(person.contactAllowed);
    setServerError(null);
    open();
  }

  function handleSave() {
    setServerError(null);
    startTransition(async () => {
      try {
        await updateChurchAdminPersonAction({
          profileId: person.id,
          fullName,
          phone: phone || null,
          address: address || null,
          displayTitle: displayTitle || null,
          membershipStatus,
          preferredContactMethod,
          emergencyContactName: emergencyContactName || null,
          emergencyContactPhone: emergencyContactPhone || null,
          directoryVisible,
          contactAllowed,
        });
        close();
        router.refresh();
      } catch (error) {
        setServerError(
          error instanceof Error ? error.message : "Person could not be updated.",
        );
      }
    });
  }

  return (
    <>
      <Button variant="default" radius="xl" leftSection={<Pencil size={15} />} onClick={handleOpen}>
        Edit
      </Button>

      <Modal
        opened={opened}
        onClose={close}
        title={person.fullName}
        size="lg"
        radius="lg"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Full name"
            value={fullName}
            onChange={(event) => setFullName(event.currentTarget.value)}
            required
            radius="md"
          />
          <Text size="sm" c="dimmed">
            Auth email is not editable here yet.
          </Text>
          <TextInput
            label="Phone"
            value={phone}
            onChange={(event) => setPhone(event.currentTarget.value)}
            radius="md"
          />
          <TextInput
            label="Address"
            value={address}
            onChange={(event) => setAddress(event.currentTarget.value)}
            radius="md"
          />
          <TextInput
            label="Display title"
            value={displayTitle}
            onChange={(event) => setDisplayTitle(event.currentTarget.value)}
            radius="md"
          />
          <Select
            label="Membership status"
            value={membershipStatus}
            onChange={(value) => setMembershipStatus(value ?? "active")}
            data={[
              { value: "active", label: "Active" },
              { value: "visitor", label: "Visitor" },
              { value: "inactive", label: "Inactive" },
              { value: "baptized", label: "Baptized" },
              { value: "transferred", label: "Transferred" },
            ]}
            radius="md"
          />
          <Select
            label="Preferred contact method"
            value={preferredContactMethod}
            onChange={setPreferredContactMethod}
            data={[
              { value: "email", label: "Email" },
              { value: "sms", label: "SMS" },
              { value: "app", label: "App" },
              { value: "none", label: "No preference" },
            ]}
            clearable
            radius="md"
          />
          <Group grow>
            <TextInput
              label="Emergency contact"
              value={emergencyContactName}
              onChange={(event) => setEmergencyContactName(event.currentTarget.value)}
              radius="md"
            />
            <TextInput
              label="Emergency phone"
              value={emergencyContactPhone}
              onChange={(event) => setEmergencyContactPhone(event.currentTarget.value)}
              radius="md"
            />
          </Group>
          <Stack gap="xs">
            <Checkbox
              label="Visible in directory"
              checked={directoryVisible}
              onChange={(event) => setDirectoryVisible(event.currentTarget.checked)}
            />
            <Checkbox
              label="Allow member contact"
              checked={contactAllowed}
              onChange={(event) => setContactAllowed(event.currentTarget.checked)}
            />
          </Stack>
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
              disabled={!fullName.trim()}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
