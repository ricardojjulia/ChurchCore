"use client";

import { useState, useTransition } from "react";
import {
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  Textarea,
  Text,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Pencil } from "lucide-react";

import { updateMemberProfileAction } from "@/app/app/actions";
import { useI18n } from "@/components/i18n-provider";
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
  const [interests, setInterests] = useState((profile.interests ?? []).join(", "));
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
  const { t } = useI18n();
  const translateMember = (key: string) => t("member", key);

  function handleOpen() {
    // Reset to current profile values each time the modal opens.
    setFullName(profile.fullName);
    setPhone(profile.phone ?? "");
    setAddress(profile.address ?? "");
    setPreferredContactMethod(profile.preferredContactMethod ?? null);
    setInterests((profile.interests ?? []).join(", "));
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
          interests: interests
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          emergencyContactName: emergencyContactName || null,
          emergencyContactPhone: emergencyContactPhone || null,
          directoryVisible,
          contactAllowed,
        });
        close();
      } catch (err) {
        setServerError(
          err instanceof Error ? err.message : translateMember("profileSaveError"),
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
        {translateMember("editProfile")}
      </Button>

      <Modal
        opened={opened}
        onClose={close}
        title={translateMember("editYourProfile")}
        radius="lg"
        size="md"
        centered
      >
        <Stack gap="md">
          <TextInput
            label={translateMember("fullName")}
            value={fullName}
            onChange={(e) => setFullName(e.currentTarget.value)}
            required
            radius="md"
          />

          <TextInput
            label={translateMember("phone")}
            value={phone}
            onChange={(e) => setPhone(e.currentTarget.value)}
            placeholder="(555) 000-0000"
            radius="md"
          />

          <TextInput
            label={translateMember("address")}
            value={address}
            onChange={(e) => setAddress(e.currentTarget.value)}
            placeholder="123 Main St, City, State"
            radius="md"
          />

          <Select
            label={translateMember("preferredContactMethod")}
            value={preferredContactMethod}
            onChange={setPreferredContactMethod}
            data={[
              { value: "email", label: translateMember("email") },
              { value: "sms", label: translateMember("smsText") },
              { value: "app", label: translateMember("inAppNotification") },
              { value: "none", label: translateMember("noPreference") },
            ]}
            clearable
            placeholder={translateMember("selectOne")}
            radius="md"
          />

          <Textarea
            label={translateMember("interests")}
            value={interests}
            onChange={(e) => setInterests(e.currentTarget.value)}
            placeholder={translateMember("interestsPlaceholder")}
            description={translateMember("interestsDescription")}
            minRows={2}
            radius="md"
          />

          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {translateMember("emergencyContact")}
            </Text>
            <TextInput
              label={translateMember("name")}
              value={emergencyContactName}
              onChange={(e) => setEmergencyContactName(e.currentTarget.value)}
              placeholder="Jane Doe"
              radius="md"
            />
            <TextInput
              label={translateMember("phone")}
              value={emergencyContactPhone}
              onChange={(e) => setEmergencyContactPhone(e.currentTarget.value)}
              placeholder="(555) 000-0000"
              radius="md"
            />
          </Stack>

          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {translateMember("privacy")}
            </Text>
            <Checkbox
              label={translateMember("showNameInDirectory")}
              checked={directoryVisible}
              onChange={(e) => setDirectoryVisible(e.currentTarget.checked)}
              radius="sm"
            />
            <Checkbox
              label={translateMember("allowMembersContact")}
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
              {translateMember("cancel")}
            </Button>
            <Button
              radius="xl"
              onClick={handleSave}
              loading={isPending}
              disabled={!fullName.trim()}
            >
              {translateMember("saveChanges")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
