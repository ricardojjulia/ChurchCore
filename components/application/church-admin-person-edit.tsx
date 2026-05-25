"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, UserX } from "lucide-react";
import {
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useDisclosure } from "@mantine/hooks";

import {
  deactivateChurchAdminPersonAction,
  updateChurchAdminPersonAction,
} from "@/app/app/actions";
import { useI18n } from "@/components/i18n-provider";
import type { ChurchAdminPersonEntry } from "@/lib/church-admin-people-data";

export function ChurchAdminPersonEdit({
  person,
}: {
  person: ChurchAdminPersonEntry;
}) {
  const router = useRouter();
  const [opened, { open, close }] = useDisclosure(false);
  const [isPending, startTransition] = useTransition();
  const [deactivatePending, startDeactivateTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const [fullName, setFullName] = useState(person.fullName);
  const [phone, setPhone] = useState(person.phone ?? "");
  const [address, setAddress] = useState(person.address ?? "");
  const [displayTitle, setDisplayTitle] = useState(person.displayTitle ?? "");
  const [role, setRole] = useState(person.role);
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
  const { t } = useI18n();
  const translatePeople = (key: string, values?: Record<string, string | number>) =>
    t("people", key, values);

  function handleDeactivate() {
    startDeactivateTransition(async () => {
      try {
        await deactivateChurchAdminPersonAction({ profileId: person.id });
        notifications.show({
          title: translatePeople("personDeactivated"),
          message: translatePeople("personDeactivatedMessage", {
            value: person.fullName,
          }),
          color: "orange",
        });
        setConfirmDeactivate(false);
        close();
        router.refresh();
      } catch (error) {
        setServerError(
          error instanceof Error ? error.message : translatePeople("deactivateError"),
        );
      }
    });
  }

  function handleOpen() {
    setFullName(person.fullName);
    setPhone(person.phone ?? "");
    setAddress(person.address ?? "");
    setDisplayTitle(person.displayTitle ?? "");
    setRole(person.role);
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
          role: role as "church_admin" | "secretary" | "pastor" | "ministry_leader" | "member",
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
          error instanceof Error ? error.message : translatePeople("personUpdateError"),
        );
      }
    });
  }

  return (
    <>
      <Button variant="default" radius="xl" leftSection={<Pencil size={15} />} onClick={handleOpen}>
        {translatePeople("edit")}
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
            label={translatePeople("fullName")}
            value={fullName}
            onChange={(event) => setFullName(event.currentTarget.value)}
            required
            radius="md"
          />
          <Text size="sm" c="dimmed">
            {translatePeople("authEmailNotEditable")}
          </Text>
          <TextInput
            label={translatePeople("phone")}
            value={phone}
            onChange={(event) => setPhone(event.currentTarget.value)}
            radius="md"
          />
          <TextInput
            label={translatePeople("address")}
            value={address}
            onChange={(event) => setAddress(event.currentTarget.value)}
            radius="md"
          />
          <TextInput
            label={translatePeople("displayTitle")}
            value={displayTitle}
            onChange={(event) => setDisplayTitle(event.currentTarget.value)}
            radius="md"
          />
          <Select
            label={translatePeople("applicationRole")}
            value={role}
            onChange={(value) => setRole(value ?? "member")}
            data={[
              { value: "member", label: translatePeople("member_volunteer") },
              { value: "ministry_leader", label: translatePeople("ministry_leader") },
              { value: "pastor", label: translatePeople("pastor_elder") },
              { value: "secretary", label: translatePeople("secretary") },
              { value: "church_admin", label: translatePeople("church_admin") },
            ]}
            radius="md"
          />
          <Select
            label={translatePeople("membershipStatus")}
            value={membershipStatus}
            onChange={(value) => setMembershipStatus(value ?? "active")}
            data={[
              { value: "active", label: translatePeople("active") },
              { value: "visitor", label: translatePeople("visitor") },
              { value: "inactive", label: translatePeople("inactive") },
              { value: "baptized", label: translatePeople("baptized") },
              { value: "transferred", label: translatePeople("transferred") },
            ]}
            radius="md"
          />
          <Select
            label={translatePeople("preferredContactMethod")}
            value={preferredContactMethod}
            onChange={setPreferredContactMethod}
            data={[
              { value: "email", label: translatePeople("email") },
              { value: "sms", label: translatePeople("sms") },
              { value: "app", label: translatePeople("app") },
              { value: "none", label: translatePeople("noPreference") },
            ]}
            clearable
            radius="md"
          />
          <Group grow>
            <TextInput
              label={translatePeople("emergencyContact")}
              value={emergencyContactName}
              onChange={(event) => setEmergencyContactName(event.currentTarget.value)}
              radius="md"
            />
            <TextInput
              label={translatePeople("emergencyPhone")}
              value={emergencyContactPhone}
              onChange={(event) => setEmergencyContactPhone(event.currentTarget.value)}
              radius="md"
            />
          </Group>
          <Stack gap="xs">
            <Checkbox
              label={translatePeople("visibleInDirectory")}
              checked={directoryVisible}
              onChange={(event) => setDirectoryVisible(event.currentTarget.checked)}
            />
            <Checkbox
              label={translatePeople("allowMemberContact")}
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
              {translatePeople("cancel")}
            </Button>
            <Button
              radius="xl"
              onClick={handleSave}
              loading={isPending}
              disabled={!fullName.trim()}
            >
              {translatePeople("save")}
            </Button>
          </Group>

          <Divider label={translatePeople("dangerZone")} labelPosition="center" />

          {confirmDeactivate ? (
            <Stack gap="xs">
              <Text size="sm" c="dimmed">
                {translatePeople("deactivateDescription", {
                  value: person.fullName,
                })}
              </Text>
              <Group gap="sm">
                <Button
                  variant="default"
                  radius="xl"
                  size="xs"
                  onClick={() => setConfirmDeactivate(false)}
                >
                  {translatePeople("cancel")}
                </Button>
                <Button
                  color="red"
                  radius="xl"
                  size="xs"
                  loading={deactivatePending}
                  onClick={handleDeactivate}
                >
                  {translatePeople("confirmDeactivate")}
                </Button>
              </Group>
            </Stack>
          ) : (
            <Button
              variant="subtle"
              color="red"
              radius="xl"
              size="xs"
              leftSection={<UserX size={14} />}
              onClick={() => setConfirmDeactivate(true)}
            >
              {translatePeople("deactivatePerson")}
            </Button>
          )}
        </Stack>
      </Modal>
    </>
  );
}
