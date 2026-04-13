"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { FileText, HeartPulse } from "lucide-react";
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

import {
  createCareAssignmentAction,
  createPastoralNoteAction,
  updateCareAssignmentStatusAction,
} from "@/app/app/actions";
import type {
  CareAssignmentEntry,
  PastoralNoteEntry,
  PastorPersonEntry,
} from "@/lib/pastor-portal-data";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function PastorPersonCareModal({
  person,
  notes,
  assignments,
}: {
  person: PastorPersonEntry;
  notes: PastoralNoteEntry[];
  assignments: CareAssignmentEntry[];
}) {
  const router = useRouter();
  const [opened, { open, close }] = useDisclosure(false);
  const [isPending, startTransition] = useTransition();
  const [noteContent, setNoteContent] = useState("");
  const [assignmentSummary, setAssignmentSummary] = useState("");
  const [assignmentPriority, setAssignmentPriority] = useState("routine");
  const [assignmentDueAt, setAssignmentDueAt] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const openAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.status !== "closed"),
    [assignments],
  );

  function resetFormState() {
    setNoteContent("");
    setAssignmentSummary("");
    setAssignmentPriority("routine");
    setAssignmentDueAt("");
    setServerError(null);
  }

  function handleOpen() {
    resetFormState();
    open();
  }

  function handleAddNote() {
    setServerError(null);
    startTransition(async () => {
      try {
        await createPastoralNoteAction({
          profileId: person.id,
          content: noteContent,
        });
        setNoteContent("");
        router.refresh();
      } catch (error) {
        setServerError(
          error instanceof Error ? error.message : "Pastoral note could not be saved.",
        );
      }
    });
  }

  function handleCreateAssignment() {
    setServerError(null);
    startTransition(async () => {
      try {
        await createCareAssignmentAction({
          profileId: person.id,
          summary: assignmentSummary,
          priority: assignmentPriority as "routine" | "high" | "urgent",
          dueAt: assignmentDueAt || null,
        });
        setAssignmentSummary("");
        setAssignmentPriority("routine");
        setAssignmentDueAt("");
        router.refresh();
      } catch (error) {
        setServerError(
          error instanceof Error
            ? error.message
            : "Care assignment could not be created.",
        );
      }
    });
  }

  function handleStatusChange(
    assignmentId: string,
    status: "open" | "in_progress" | "closed",
  ) {
    setServerError(null);
    startTransition(async () => {
      try {
        await updateCareAssignmentStatusAction({
          assignmentId,
          status,
        });
        router.refresh();
      } catch (error) {
        setServerError(
          error instanceof Error
            ? error.message
            : "Care assignment could not be updated.",
        );
      }
    });
  }

  return (
    <>
      <Button variant="default" radius="xl" onClick={handleOpen}>
        Care
      </Button>

      <Modal
        opened={opened}
        onClose={close}
        title={person.fullName}
        size="xl"
        radius="lg"
        centered
      >
        <Stack gap="lg">
          <Group gap="sm">
            <Badge color="gray" variant="light">
              {person.membershipStatus}
            </Badge>
            {person.familyName ? (
              <Badge color="gray" variant="outline">
                {person.familyName}
              </Badge>
            ) : null}
            <Badge color="gray" variant="outline">
              {openAssignments.length} open care
            </Badge>
            <Badge color="gray" variant="outline">
              {notes.length} notes
            </Badge>
          </Group>

          <Paper withBorder radius="xl" p="lg">
            <Group gap="sm" mb="md">
              <HeartPulse size={16} />
              <Title order={4}>Care assignments</Title>
            </Group>
            <Stack gap="sm">
              {assignments.length ? (
                assignments.map((assignment) => (
                  <Paper key={assignment.id} withBorder radius="xl" p="md">
                    <Group justify="space-between" align="flex-start" gap="md">
                      <div>
                        <Text fw={600}>{assignment.summary}</Text>
                        <Text size="sm" c="dimmed" mt={4}>
                          Due: {formatDateTime(assignment.dueAt)}
                        </Text>
                        <Text size="sm" c="dimmed" mt={4}>
                          Last contact: {formatDateTime(assignment.lastContactAt)}
                        </Text>
                        {assignment.assignedToName ? (
                          <Text size="sm" c="dimmed" mt={4}>
                            Assigned: {assignment.assignedToName}
                          </Text>
                        ) : null}
                      </div>
                      <Stack gap={8} align="flex-end">
                        <Badge color="gray" variant="light">
                          {assignment.priority}
                        </Badge>
                        <Select
                          value={assignment.status}
                          onChange={(value) => {
                            if (
                              value === "open" ||
                              value === "in_progress" ||
                              value === "closed"
                            ) {
                              handleStatusChange(assignment.id, value);
                            }
                          }}
                          data={[
                            { value: "open", label: "Open" },
                            { value: "in_progress", label: "In progress" },
                            { value: "closed", label: "Closed" },
                          ]}
                          radius="xl"
                          size="xs"
                          disabled={isPending}
                        />
                      </Stack>
                    </Group>
                  </Paper>
                ))
              ) : (
                <Text size="sm" c="dimmed">
                  No care assignments yet.
                </Text>
              )}
            </Stack>
          </Paper>

          <Paper withBorder radius="xl" p="lg">
            <Group gap="sm" mb="md">
              <HeartPulse size={16} />
              <Title order={4}>Create assignment</Title>
            </Group>
            <Stack gap="sm">
              <TextInput
                value={assignmentSummary}
                onChange={(event) => setAssignmentSummary(event.currentTarget.value)}
                placeholder="Call after hospital discharge"
                radius="xl"
              />
              <Group grow align="flex-end">
                <Select
                  value={assignmentPriority}
                  onChange={(value) => setAssignmentPriority(value ?? "routine")}
                  data={[
                    { value: "routine", label: "Routine" },
                    { value: "high", label: "High" },
                    { value: "urgent", label: "Urgent" },
                  ]}
                  radius="xl"
                />
                <TextInput
                  type="datetime-local"
                  value={assignmentDueAt}
                  onChange={(event) => setAssignmentDueAt(event.currentTarget.value)}
                  radius="xl"
                />
              </Group>
              <Group justify="flex-end">
                <Button
                  radius="xl"
                  onClick={handleCreateAssignment}
                  loading={isPending}
                  disabled={!assignmentSummary.trim()}
                >
                  Add assignment
                </Button>
              </Group>
            </Stack>
          </Paper>

          <Paper withBorder radius="xl" p="lg">
            <Group gap="sm" mb="md">
              <FileText size={16} />
              <Title order={4}>Pastoral notes</Title>
            </Group>
            <Stack gap="sm">
              {notes.length ? (
                notes.map((note) => (
                  <Paper key={note.id} withBorder radius="xl" p="md">
                    <Text size="sm">{note.content}</Text>
                    <Text size="xs" c="dimmed" mt={8}>
                      {note.createdByName || "Pastor"} • {formatDateTime(note.createdAt)}
                    </Text>
                  </Paper>
                ))
              ) : (
                <Text size="sm" c="dimmed">
                  No pastoral notes yet.
                </Text>
              )}
            </Stack>
          </Paper>

          <Paper withBorder radius="xl" p="lg">
            <Group gap="sm" mb="md">
              <FileText size={16} />
              <Title order={4}>Add note</Title>
            </Group>
            <Textarea
              value={noteContent}
              onChange={(event) => setNoteContent(event.currentTarget.value)}
              placeholder="Pastoral context, prayer needs, and next contact steps"
              minRows={4}
              radius="lg"
            />
            {serverError ? (
              <Text size="sm" c="red">
                {serverError}
              </Text>
            ) : null}
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Pastoral notes are restricted to pastor access.
              </Text>
              <Group>
                <Button variant="default" radius="xl" onClick={close}>
                  Close
                </Button>
                <Button
                  radius="xl"
                  onClick={handleAddNote}
                  loading={isPending}
                  disabled={!noteContent.trim()}
                >
                  Save note
                </Button>
              </Group>
            </Group>
          </Paper>
        </Stack>
      </Modal>
    </>
  );
}
