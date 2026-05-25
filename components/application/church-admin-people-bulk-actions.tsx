"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import {
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Text,
} from "@mantine/core";

import { updateChurchAdminPeopleBulkAction } from "@/app/app/actions";
import { useI18n } from "@/components/i18n-provider";

export function ChurchAdminPeopleBulkActions({
  selectedIds,
  onClear,
}: {
  selectedIds: string[];
  onClear: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [membershipStatus, setMembershipStatus] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const { t } = useI18n();
  const translatePeople = (key: string, values?: Record<string, string | number>) =>
    t("people", key, values);

  function runBulkUpdate(input: {
    membershipStatus?: string | null;
    directoryVisible?: boolean | null;
    contactAllowed?: boolean | null;
  }) {
    setServerError(null);
    startTransition(async () => {
      try {
        await updateChurchAdminPeopleBulkAction({
          profileIds: selectedIds,
          membershipStatus: input.membershipStatus ?? null,
          directoryVisible: input.directoryVisible ?? null,
          contactAllowed: input.contactAllowed ?? null,
        });
        setMembershipStatus(null);
        onClear();
        router.refresh();
      } catch (error) {
        setServerError(
          error instanceof Error ? error.message : translatePeople("bulkUpdateError"),
        );
      }
    });
  }

  return (
    <Paper withBorder radius="xl" p="lg" mb="lg" bg="#f8fbff">
      <Stack gap="md">
        <Group justify="space-between" align="center" gap="md">
          <Group gap="sm">
            <CheckCheck size={16} />
            <Text fw={600}>
              {translatePeople("selectedCount", { count: selectedIds.length })}
            </Text>
          </Group>
          <Button variant="subtle" radius="xl" onClick={onClear}>
            {translatePeople("clear")}
          </Button>
        </Group>

        <Group align="flex-end" gap="md" wrap="wrap">
          <Select
            label={translatePeople("membershipStatus")}
            value={membershipStatus}
            onChange={setMembershipStatus}
            data={[
              { value: "active", label: translatePeople("active") },
              { value: "visitor", label: translatePeople("visitor") },
              { value: "inactive", label: translatePeople("inactive") },
              { value: "baptized", label: translatePeople("baptized") },
              { value: "transferred", label: translatePeople("transferred") },
            ]}
            clearable
            radius="xl"
            w={220}
          />
          <Button
            radius="xl"
            variant="default"
            onClick={() => runBulkUpdate({ membershipStatus })}
            disabled={!membershipStatus}
            loading={isPending}
          >
            {translatePeople("applyStatus")}
          </Button>
          <Button
            radius="xl"
            variant="default"
            onClick={() => runBulkUpdate({ directoryVisible: true })}
            loading={isPending}
          >
            {translatePeople("showInDirectory")}
          </Button>
          <Button
            radius="xl"
            variant="default"
            onClick={() => runBulkUpdate({ directoryVisible: false })}
            loading={isPending}
          >
            {translatePeople("hideFromDirectory")}
          </Button>
          <Button
            radius="xl"
            variant="default"
            onClick={() => runBulkUpdate({ contactAllowed: true })}
            loading={isPending}
          >
            {translatePeople("allowContact")}
          </Button>
          <Button
            radius="xl"
            variant="default"
            onClick={() => runBulkUpdate({ contactAllowed: false })}
            loading={isPending}
          >
            {translatePeople("makeContactPrivate")}
          </Button>
        </Group>

        {serverError ? (
          <Text size="sm" c="red">
            {serverError}
          </Text>
        ) : null}
      </Stack>
    </Paper>
  );
}
