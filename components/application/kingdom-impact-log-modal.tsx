"use client";

import { useState, useTransition } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Sparkles } from "lucide-react";

import type { LogKingdomImpactInput } from "@/app/app/actions";
import { logKingdomImpactAction } from "@/app/app/actions";

const IMPACT_TYPE_OPTIONS = [
  { value: "prayer_answered", label: "Prayer Answered" },
  { value: "disciple_made", label: "Disciple Made" },
  { value: "salvation", label: "Salvation" },
  { value: "restored_relationship", label: "Restored Relationship" },
];

export function KingdomImpactLogModal({ ministryId }: { ministryId: string | null }) {
  const [opened, { open, close }] = useDisclosure(false);
  const [isPending, startTransition] = useTransition();

  const [impactType, setImpactType] = useState<string | null>(null);
  const [description, setDescription] = useState("");

  function handleClose() {
    close();
    setImpactType(null);
    setDescription("");
  }

  function handleSubmit() {
    if (!impactType) return;

    const input: LogKingdomImpactInput = {
      ministryId,
      impactType: impactType as LogKingdomImpactInput["impactType"],
      description: description.trim() || null,
      occurredAt: null,
    };

    startTransition(async () => {
      try {
        await logKingdomImpactAction(input);
        notifications.show({
          title: "Impact recorded",
          message: "This Kingdom Impact has been saved.",
          color: "teal",
        });
        handleClose();
      } catch (err) {
        notifications.show({
          title: "Error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          color: "red",
        });
      }
    });
  }

  return (
    <>
      <Tooltip label="Log a Kingdom Impact" position="left">
        <ActionIcon
          onClick={open}
          size="xl"
          radius="xl"
          color="churchBlue"
          variant="filled"
          style={{ position: "fixed", bottom: 80, right: 24, zIndex: 200 }}
        >
          <Sparkles size={20} />
        </ActionIcon>
      </Tooltip>

      <Modal opened={opened} onClose={handleClose} title="Log Kingdom Impact" centered radius="lg">
        <Text size="xs" c="dimmed" mb="md">
          Record a moment where God moved — answered prayer, new disciples, salvations, or restored
          relationships. These are reviewed and curated by your church leaders.
        </Text>

        <Stack gap="md">
          <Select
            label="Impact type"
            placeholder="Select impact type"
            data={IMPACT_TYPE_OPTIONS}
            value={impactType}
            onChange={setImpactType}
            required
            radius="md"
          />

          <Textarea
            label="Description"
            placeholder="Briefly describe what happened (optional)..."
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            maxLength={1000}
            minRows={3}
            autosize
            radius="md"
          />

          <Text size="xs" c="dimmed" fs="italic">
            AI-assistive disclaimer: This log is a human record. No AI processing is applied to
            your entry.
          </Text>

          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={handleClose} radius="xl">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              loading={isPending}
              disabled={!impactType}
              radius="xl"
              color="churchBlue"
            >
              Save impact
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
