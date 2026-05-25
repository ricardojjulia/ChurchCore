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
import { useI18n } from "@/components/i18n-provider";

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
  const { t } = useI18n();
  const translatePeople = (key: string, values?: Record<string, string | number>) =>
    t("people", key, values);

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
          title: translatePeople("personAdded"),
          message: translatePeople("personAddedMessage", { value: fullName.trim() }),
          color: "teal",
        });
        handleClose();
        router.refresh();
      } catch (error) {
        setServerError(
          error instanceof Error ? error.message : translatePeople("personAddError"),
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
        {translatePeople("addPerson")}
      </Button>

      <Modal
        opened={opened}
        onClose={handleClose}
        title={translatePeople("addPerson")}
        size="md"
        radius="lg"
        centered
      >
        <Stack gap="md">
          <TextInput
            label={translatePeople("fullName")}
            value={fullName}
            onChange={(e) => setFullName(e.currentTarget.value)}
            required
            radius="md"
            placeholder="Jane Smith"
          />
          <TextInput
            label={translatePeople("email")}
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            radius="md"
            placeholder="jane@example.com"
            description={translatePeople("emailOptionalDescription")}
          />
          <TextInput
            label={translatePeople("phone")}
            value={phone}
            onChange={(e) => setPhone(e.currentTarget.value)}
            radius="md"
            placeholder="+1 555-0100"
          />
          <Select
            label={translatePeople("membershipStatus")}
            value={membershipStatus}
            onChange={(v) => setMembershipStatus(v ?? "visitor")}
            data={[
              { value: "visitor", label: translatePeople("visitor") },
              { value: "active", label: translatePeople("activeMember") },
              { value: "inactive", label: translatePeople("inactive") },
              { value: "baptized", label: translatePeople("baptized") },
              { value: "transferred", label: translatePeople("transferred") },
            ]}
            radius="md"
          />
          <Select
            label={translatePeople("role")}
            value={role}
            onChange={(v) => setRole(v ?? "member")}
            data={[
              { value: "member", label: translatePeople("member_volunteer") },
              { value: "ministry_leader", label: translatePeople("ministry_leader") },
              { value: "pastor", label: translatePeople("pastor_elder") },
              { value: "secretary", label: translatePeople("secretary") },
              { value: "church_admin", label: translatePeople("church_admin") },
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
              onClick={handleSave}
              loading={isPending}
              disabled={!fullName.trim()}
            >
              {translatePeople("addPerson")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
