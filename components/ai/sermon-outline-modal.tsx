"use client";

import { useId } from "react";
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";

import { AI_RESPONSE_FOOTER } from "@/lib/ai-ministry/ui-constants";

export function SermonOutlineModal({
  opened,
  onClose,
  onAccept,
  noteTitle,
  noteType,
  outline,
  error,
}: {
  opened: boolean;
  onClose: () => void;
  onAccept: (outline: string) => void;
  noteTitle: string;
  noteType: "sermon_outline" | "series_plan";
  outline: string | null;
  error: string | null;
}) {
  const titleId = useId();
  const isLoading = outline === null && error === null;
  const modalTitle =
    noteType === "series_plan" ? "AI Series Suggestion" : "AI Sermon Suggestion";

  function handleAccept() {
    if (outline) {
      onAccept(outline);
      onClose();
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text id={titleId} fw={700} fz="md">
          {modalTitle}
        </Text>
      }
      aria-labelledby={titleId}
      size="lg"
      radius="lg"
    >
      <Stack gap="md">
        <Text fz="xs" c="dimmed">
          {noteTitle}
        </Text>

        {isLoading ? (
          <Stack align="center" py="xl" gap="sm">
            <Loader size="md" />
            <Text fz="sm" c="dimmed" className="sr-only" aria-live="polite">
              Generating suggestion...
            </Text>
            <Text fz="sm" c="dimmed" aria-hidden>
              Generating suggestion...
            </Text>
          </Stack>
        ) : null}

        {error ? (
          <Alert color="red" title="Unavailable" radius="md">
            {error}
          </Alert>
        ) : null}

        {outline ? (
          <Stack gap="xs">
            <ScrollArea mah={400} type="auto">
              <Text
                fz="sm"
                style={{ whiteSpace: "pre-wrap" }}
              >
                {outline}
              </Text>
            </ScrollArea>
            <Text fz="xs" c="dimmed" fs="italic" mt="xs">
              {AI_RESPONSE_FOOTER}
            </Text>
          </Stack>
        ) : null}

        {!isLoading ? (
          <Group justify="flex-end" gap="sm" pt="sm">
            <Button variant="default" radius="xl" onClick={onClose}>
              Dismiss
            </Button>
            <Button
              color="churchBlue"
              radius="xl"
              disabled={!outline}
              onClick={handleAccept}
            >
              Use This Outline
            </Button>
          </Group>
        ) : null}
      </Stack>
    </Modal>
  );
}
