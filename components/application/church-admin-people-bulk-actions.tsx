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
          error instanceof Error ? error.message : "Bulk update could not be applied.",
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
            <Text fw={600}>{selectedIds.length} selected</Text>
          </Group>
          <Button variant="subtle" radius="xl" onClick={onClear}>
            Clear
          </Button>
        </Group>

        <Group align="flex-end" gap="md" wrap="wrap">
          <Select
            label="Membership status"
            value={membershipStatus}
            onChange={setMembershipStatus}
            data={[
              { value: "active", label: "Active" },
              { value: "visitor", label: "Visitor" },
              { value: "inactive", label: "Inactive" },
              { value: "baptized", label: "Baptized" },
              { value: "transferred", label: "Transferred" },
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
            Apply status
          </Button>
          <Button
            radius="xl"
            variant="default"
            onClick={() => runBulkUpdate({ directoryVisible: true })}
            loading={isPending}
          >
            Show in directory
          </Button>
          <Button
            radius="xl"
            variant="default"
            onClick={() => runBulkUpdate({ directoryVisible: false })}
            loading={isPending}
          >
            Hide from directory
          </Button>
          <Button
            radius="xl"
            variant="default"
            onClick={() => runBulkUpdate({ contactAllowed: true })}
            loading={isPending}
          >
            Allow contact
          </Button>
          <Button
            radius="xl"
            variant="default"
            onClick={() => runBulkUpdate({ contactAllowed: false })}
            loading={isPending}
          >
            Make contact private
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
