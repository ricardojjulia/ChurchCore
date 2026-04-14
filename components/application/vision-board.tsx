"use client";

import { useState, useTransition } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { BookOpen, Plus, X } from "lucide-react";

import type { UpdateMinistryVisionInput } from "@/app/app/actions";
import { updateMinistryVisionAction } from "@/app/app/actions";

export function VisionBoard({
  ministryId,
  initialVision,
  initialAnchors,
  editable,
}: {
  ministryId: string;
  initialVision: string | null;
  initialAnchors: string[];
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [vision, setVision] = useState(initialVision ?? "");
  const [anchors, setAnchors] = useState<string[]>(initialAnchors);
  const [newAnchor, setNewAnchor] = useState("");
  const [isPending, startTransition] = useTransition();

  function addAnchor() {
    const val = newAnchor.trim();
    if (!val || anchors.includes(val)) return;
    setAnchors((prev) => [...prev, val]);
    setNewAnchor("");
  }

  function removeAnchor(anchor: string) {
    setAnchors((prev) => prev.filter((a) => a !== anchor));
  }

  function handleSave() {
    const input: UpdateMinistryVisionInput = {
      ministryId,
      visionStatement: vision.trim() || null,
      scripturalAnchor: anchors,
    };

    startTransition(async () => {
      try {
        await updateMinistryVisionAction(input);
        notifications.show({
          title: "Vision updated",
          message: "Ministry vision and scriptural anchors have been saved.",
          color: "teal",
        });
        setEditing(false);
      } catch (err) {
        notifications.show({
          title: "Error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          color: "red",
        });
      }
    });
  }

  function handleCancel() {
    setVision(initialVision ?? "");
    setAnchors(initialAnchors);
    setNewAnchor("");
    setEditing(false);
  }

  const displayVision = vision.trim() || initialVision;
  const displayAnchors = editing ? anchors : initialAnchors;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Group gap="sm">
          <BookOpen size={18} />
          <Title order={4}>Vision & Scriptural Anchors</Title>
        </Group>
        {editable && !editing ? (
          <Button variant="subtle" size="xs" radius="xl" onClick={() => setEditing(true)}>
            Edit
          </Button>
        ) : null}
      </Group>

      {editing ? (
        <Stack gap="sm">
          <Textarea
            label="Vision statement"
            placeholder="Describe the vision and calling of this ministry..."
            value={vision}
            onChange={(e) => setVision(e.currentTarget.value)}
            maxLength={2000}
            minRows={3}
            autosize
            radius="md"
          />

          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Scriptural anchors
            </Text>
            <Group gap="xs" wrap="wrap">
              {anchors.map((anchor) => (
                <Badge
                  key={anchor}
                  variant="light"
                  color="churchBlue"
                  radius="sm"
                  rightSection={
                    <ActionIcon
                      size="xs"
                      variant="transparent"
                      onClick={() => removeAnchor(anchor)}
                      aria-label={`Remove ${anchor}`}
                    >
                      <X size={10} />
                    </ActionIcon>
                  }
                >
                  {anchor}
                </Badge>
              ))}
            </Group>
            <Group gap="xs">
              <TextInput
                placeholder="e.g. Matthew 28:19-20"
                value={newAnchor}
                onChange={(e) => setNewAnchor(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAnchor();
                  }
                }}
                radius="md"
                size="sm"
                style={{ flex: 1 }}
              />
              <ActionIcon variant="light" color="churchBlue" radius="xl" onClick={addAnchor}>
                <Plus size={14} />
              </ActionIcon>
            </Group>
          </Stack>

          <Group justify="flex-end" gap="sm" mt="xs">
            <Button variant="default" radius="xl" onClick={handleCancel}>
              Cancel
            </Button>
            <Button radius="xl" color="churchBlue" loading={isPending} onClick={handleSave}>
              Save vision
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="sm">
          {displayVision ? (
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {displayVision}
            </Text>
          ) : (
            <Text size="sm" c="dimmed" fs="italic">
              No vision statement has been set for this ministry yet.
            </Text>
          )}

          {displayAnchors.length > 0 ? (
            <Group gap="xs" wrap="wrap">
              {displayAnchors.map((anchor) => (
                <Badge key={anchor} variant="light" color="churchBlue" radius="sm">
                  {anchor}
                </Badge>
              ))}
            </Group>
          ) : null}
        </Stack>
      )}
    </Stack>
  );
}
