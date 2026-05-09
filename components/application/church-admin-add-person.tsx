"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import {
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

import { addChurchgoerAction } from "@/app/app/actions";

export function ChurchAdminAddPerson() {
  const router = useRouter();
  const [opened, { open, close }] = useDisclosure(false);
  const [isPending, startTransition] = useTransition();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [membershipStatus, setMembershipStatus] = useState("visitor");
  const [role, setRole] = useState("member");
  const [serverError, setServerError] = useState<string | null>(null);

  function handleClose() {
    setFullName("");
    setEmail("");
    setPhone("");
    setMembershipStatus("visitor");
    setRole("member");
    setServerError(null);
    close();
  }

  function handleSave() {
    setServerError(null);
    startTransition(async () => {
      try {
        await addChurchgoerAction({
          fullName,
          email: email || null,
          phone: phone || null,
          membershipStatus,
          role,
        });
        notifications.show({
          title: "Person added",
          message: `${fullName.trim()} has been added to the people list.`,
          color: "teal",
        });
        handleClose();
        router.refresh();
      } catch (error) {
        setServerError(
          error instanceof Error ? error.message : "Person could not be added.",
        );
      }
    });
  }

  return (
    <>
      <Button
        radius="xl"
        leftSection={<UserPlus size={15} />}
        onClick={open}
      >
        Add person
      </Button>

      <Modal
        opened={opened}
        onClose={handleClose}
        title="Add person"
        size="md"
        radius="lg"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.currentTarget.value)}
            required
            radius="md"
            placeholder="Jane Smith"
          />
          <TextInput
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            radius="md"
            placeholder="jane@example.com"
            description="Optional — for walk-in visitors, email can be added later."
          />
          <TextInput
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.currentTarget.value)}
            radius="md"
            placeholder="+1 555-0100"
          />
          <Select
            label="Membership status"
            value={membershipStatus}
            onChange={(v) => setMembershipStatus(v ?? "visitor")}
            data={[
              { value: "visitor", label: "Visitor" },
              { value: "active", label: "Active member" },
              { value: "inactive", label: "Inactive" },
              { value: "baptized", label: "Baptized" },
              { value: "transferred", label: "Transferred" },
            ]}
            radius="md"
          />
          <Select
            label="Role"
            value={role}
            onChange={(v) => setRole(v ?? "member")}
            data={[
              { value: "member", label: "Member / Volunteer" },
              { value: "ministry_leader", label: "Ministry leader" },
              { value: "pastor", label: "Pastor / Elder" },
              { value: "secretary", label: "Secretary / Office Admin" },
              { value: "church_admin", label: "Church admin" },
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
              onClick={handleSave}
              loading={isPending}
              disabled={!fullName.trim()}
            >
              Add person
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
