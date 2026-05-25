"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Combine } from "lucide-react";
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

import {
  mergeChurchAdminDuplicateAction,
  reassignChurchAdminPersonFamilyAction,
} from "@/app/app/actions";
import { useI18n } from "@/components/i18n-provider";
import type {
  ChurchAdminFamilyOption,
  ChurchAdminPersonEntry,
} from "@/lib/church-admin-people-data";

const PRIVILEGED_ROLES = new Set(["church_admin", "pastor"]);

export function ChurchAdminPersonRelationships({
  person,
  families,
}: {
  person: ChurchAdminPersonEntry;
  families: ChurchAdminFamilyOption[];
}) {
  const router = useRouter();
  const [opened, { open, close }] = useDisclosure(false);
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(
    person.familyId,
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { t } = useI18n();
  const translatePeople = (key: string) => t("people", key);

  const familyOptions = [
    { value: "", label: translatePeople("noFamily") },
    ...families.map((family) => ({
      value: family.id,
      label: family.familyName,
    })),
  ];

  function handleOpen() {
    setSelectedFamilyId(person.familyId);
    setServerError(null);
    open();
  }

  function handleFamilySave() {
    setServerError(null);
    startTransition(async () => {
      try {
        await reassignChurchAdminPersonFamilyAction({
          profileId: person.id,
          familyId: selectedFamilyId || null,
        });
        close();
        router.refresh();
      } catch (error) {
        setServerError(
          error instanceof Error
            ? error.message
            : translatePeople("familyChangeError"),
        );
      }
    });
  }

  function handleMerge(sourceProfileId: string) {
    setServerError(null);
    startTransition(async () => {
      try {
        await mergeChurchAdminDuplicateAction({
          sourceProfileId,
          targetProfileId: person.id,
        });
        close();
        router.refresh();
      } catch (error) {
        setServerError(
          error instanceof Error ? error.message : translatePeople("duplicateMergeError"),
        );
      }
    });
  }

  return (
    <>
      <Button
        variant="default"
        radius="xl"
        leftSection={<ArrowRightLeft size={15} />}
        onClick={handleOpen}
      >
        {translatePeople("relationships")}
      </Button>

      <Modal
        opened={opened}
        onClose={close}
        title={person.fullName}
        size="lg"
        radius="lg"
        centered
      >
        <Stack gap="lg">
          <div>
            <Text fw={600}>{translatePeople("family")}</Text>
            <Text size="sm" c="dimmed" mt={4}>
              {translatePeople("familyDescription")}
            </Text>
          </div>

          <Group align="flex-end" gap="md" wrap="wrap">
            <Select
              label={translatePeople("household")}
              value={selectedFamilyId ?? ""}
              onChange={(value) => setSelectedFamilyId(value || null)}
              data={familyOptions}
              radius="md"
              style={{ flex: 1, minWidth: 240 }}
            />
            <Button
              radius="xl"
              onClick={handleFamilySave}
              loading={isPending}
            >
              {translatePeople("saveFamily")}
            </Button>
          </Group>

          <div>
            <Text fw={600}>{translatePeople("duplicateCandidates")}</Text>
            <Text size="sm" c="dimmed" mt={4}>
              {translatePeople("duplicateDescription")}
            </Text>
          </div>

          <Stack gap="sm">
            {person.duplicateCandidates.length ? (
              person.duplicateCandidates.map((candidate) => {
                const mergeBlocked =
                  PRIVILEGED_ROLES.has(person.role) ||
                  PRIVILEGED_ROLES.has(candidate.role);

                return (
                  <Paper key={candidate.id} withBorder radius="lg" p="md">
                    <Group justify="space-between" align="flex-start" gap="md">
                      <div>
                        <Text fw={600}>{candidate.fullName}</Text>
                        <Text size="sm" c="dimmed" mt={4}>
                          {candidate.familyName || translatePeople("noFamily")}{" "}
                          {candidate.email ? `• ${candidate.email}` : ""}
                        </Text>
                        <Text size="sm" c="dimmed" mt={4}>
                          {candidate.phone || translatePeople("noPhone")}
                        </Text>
                      </div>

                      <Stack gap="xs" align="flex-end">
                        <Badge color="gray" variant="light">
                          {translatePeople(candidate.role)}
                        </Badge>
                        <Button
                          radius="xl"
                          leftSection={<Combine size={15} />}
                          onClick={() => handleMerge(candidate.id)}
                          loading={isPending}
                          disabled={mergeBlocked}
                        >
                          {translatePeople("mergeIntoCurrent")}
                        </Button>
                      </Stack>
                    </Group>

                    {mergeBlocked ? (
                      <Text size="sm" c="dimmed" mt="sm">
                        {translatePeople("mergeBlocked")}
                      </Text>
                    ) : null}
                  </Paper>
                );
              })
            ) : (
              <Text size="sm" c="dimmed">
                {translatePeople("noDuplicateCandidates")}
              </Text>
            )}
          </Stack>

          {serverError ? (
            <Text size="sm" c="red">
              {serverError}
            </Text>
          ) : null}
        </Stack>
      </Modal>
    </>
  );
}
