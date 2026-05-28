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
import { useI18n } from "@/components/i18n-provider";
import type { MemberPortalFamily } from "@/lib/member-portal-data";

type Props = {
  family: MemberPortalFamily | null;
};

export function MemberFamilyEdit({ family }: Props) {
  const [opened, { open, close }] = useDisclosure(false);
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);

  const [familyName, setFamilyName] = useState(family?.familyName ?? "");
  const [address, setAddress] = useState(family?.address ?? "");
  const [homePhone, setHomePhone] = useState(family?.homePhone ?? "");
  const { t } = useI18n();
  const translateMember = (key: string) => t("member", key);

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
        const result = await upsertMemberFamilyAction({
          familyName,
          address: address || null,
          homePhone: homePhone || null,
        });
        setReviewMessage(
          result.status === "pending_review"
            ? translateMember("updateSubmittedForReview")
            : null,
        );
        close();
      } catch (error) {
        setServerError(
          error instanceof Error ? error.message : translateMember("familySaveError"),
        );
      }
    });
  }

  return (
    <>
      <Stack gap={4}>
        <Button
          variant={family ? "default" : "filled"}
          radius="xl"
          leftSection={family ? <Pencil size={15} /> : <Home size={15} />}
          onClick={handleOpen}
        >
          {family ? translateMember("editFamily") : translateMember("addFamily")}
        </Button>
        {reviewMessage ? (
          <Text size="xs" c="dimmed">
            {reviewMessage}
          </Text>
        ) : null}
      </Stack>

      <Modal
        opened={opened}
        onClose={close}
        title={family ? translateMember("updateFamily") : translateMember("createFamily")}
        radius="lg"
        size="md"
        centered
      >
        <Stack gap="md">
          <TextInput
            label={translateMember("familyName")}
            value={familyName}
            onChange={(event) => setFamilyName(event.currentTarget.value)}
            placeholder="Park family"
            required
            radius="md"
          />

          <TextInput
            label={translateMember("address")}
            value={address}
            onChange={(event) => setAddress(event.currentTarget.value)}
            placeholder="123 Main St, City, State"
            radius="md"
          />

          <TextInput
            label={translateMember("homePhone")}
            value={homePhone}
            onChange={(event) => setHomePhone(event.currentTarget.value)}
            placeholder="(555) 000-0000"
            radius="md"
          />

          <Text size="sm" c="dimmed">
            {translateMember("familyUpdateDescription")}
          </Text>

          {serverError ? (
            <Text size="sm" c="red">
              {serverError}
            </Text>
          ) : null}

          <Group justify="flex-end">
            <Button variant="default" radius="xl" onClick={close}>
              {translateMember("cancel")}
            </Button>
            <Button
              radius="xl"
              onClick={handleSave}
              loading={isPending}
              disabled={!familyName.trim()}
            >
              {translateMember("save")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
