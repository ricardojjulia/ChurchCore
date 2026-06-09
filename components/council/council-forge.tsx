"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Paper,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  BookOpen,
  Clock,
  Edit3,
  FileText,
  Lock,
  PlusCircle,
  ScrollText,
} from "lucide-react";

import {
  createCouncilNoteAction,
  generateSermonOutlineAction,
  updateCouncilNoteAction,
} from "@/app/app/elders-actions";
import { ApplicationShell } from "@/components/application/app-shell";
import { DisclaimerGate } from "@/components/ai/disclaimer-gate";
import { SermonOutlineModal } from "@/components/ai/sermon-outline-modal";
import type { ChurchAppSession } from "@/lib/auth";
import type { CouncilForgeData, CouncilNote, CouncilNoteType } from "@/lib/elders-types";
import { COUNCIL_NOTE_TYPE_LABELS } from "@/lib/elders-types";

// ── Liturgical integration note ──────────────────────────────
// Phase 5: Wire council_notes.note_type = 'series_plan' to the
// tenant calendar to surface liturgical seasons (Advent, Lent,
// Pentecost, etc.) alongside series titles.
// The calendar already tracks event categories; extend with
// a 'liturgical' category and link series plans to date ranges.
// ─────────────────────────────────────────────────────────────

const NOTE_TYPE_OPTIONS = Object.entries(COUNCIL_NOTE_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const NOTE_TYPE_ICON: Record<CouncilNoteType, typeof BookOpen> = {
  general: FileText,
  sermon_outline: BookOpen,
  series_plan: ScrollText,
  council_minutes: Clock,
  sabbath_reflection: Lock,
};

const NOTE_TYPE_COLOR: Record<CouncilNoteType, string> = {
  general: "gray",
  sermon_outline: "churchBlue",
  series_plan: "teal",
  council_minutes: "orange",
  sabbath_reflection: "violet",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function CouncilNoteCard({
  note,
  onEdit,
}: {
  note: CouncilNote;
  onEdit: (note: CouncilNote) => void;
}) {
  const Icon = NOTE_TYPE_ICON[note.noteType] ?? FileText;
  const color = NOTE_TYPE_COLOR[note.noteType] ?? "gray";

  return (
    <Paper withBorder p="lg" radius="lg">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="sm" align="flex-start" style={{ flex: 1 }}>
            <ThemeIcon variant="light" color={color} size="md" radius="xl">
              <Icon size={14} />
            </ThemeIcon>
            <Stack gap={2} style={{ flex: 1 }}>
              <Text fw={600} fz="sm">
                {note.title}
              </Text>
              <Group gap="xs">
                <Badge size="xs" color={color} variant="light" radius="sm">
                  {COUNCIL_NOTE_TYPE_LABELS[note.noteType]}
                </Badge>
                <Text fz="xs" c="dimmed">
                  v{note.version} · {formatDate(note.updatedAt)}
                </Text>
              </Group>
            </Stack>
          </Group>

          <Button
            size="xs"
            variant="subtle"
            radius="xl"
            leftSection={<Edit3 size={11} />}
            onClick={() => onEdit(note)}
          >
            Edit
          </Button>
        </Group>

        {note.content ? (
          <Text fz="sm" c="dimmed" lineClamp={4} style={{ whiteSpace: "pre-wrap" }}>
            {note.content}
          </Text>
        ) : (
          <Text fz="sm" c="dimmed" fs="italic">
            No content yet — click Edit to begin writing.
          </Text>
        )}

        <Group gap="xs" mt={4}>
          {note.createdByName ? (
            <Text fz="xs" c="dimmed">
              Created by {note.createdByName}
            </Text>
          ) : null}
          {note.lastEditedByName && note.lastEditedByName !== note.createdByName ? (
            <>
              <Text fz="xs" c="dimmed">
                ·
              </Text>
              <Text fz="xs" c="dimmed">
                Last edited by {note.lastEditedByName}
              </Text>
            </>
          ) : null}
        </Group>
      </Stack>
    </Paper>
  );
}

export function CouncilForge({
  session,
  data,
}: {
  session: ChurchAppSession;
  data: CouncilForgeData;
}) {
  const { notes } = data;

  // Create drawer
  const [createOpen, createDrawer] = useDisclosure(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState<CouncilNoteType>("general");

  // Edit drawer
  const [editOpen, editDrawer] = useDisclosure(false);
  const [editingNote, setEditingNote] = useState<CouncilNote | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const [isPending, startTransition] = useTransition();

  // AI Suggest state
  const [aiLoading, setAiLoading] = useState(false);
  const [outlineModalOpen, setOutlineModalOpen] = useState(false);
  const [generatedOutline, setGeneratedOutline] = useState<string | null>(null);
  const [outlineError, setOutlineError] = useState<string | null>(null);
  const [showSermonDisclaimer, setShowSermonDisclaimer] = useState(false);

  function triggerSermonAI() {
    if (!editingNote) return;
    setAiLoading(true);
    setGeneratedOutline(null);
    setOutlineError(null);
    setOutlineModalOpen(true);
    startTransition(async () => {
      const result = await generateSermonOutlineAction({
        noteId: editingNote.id,
        noteType: editingNote.noteType as "sermon_outline" | "series_plan",
        noteTitle: editingNote.title,
        existingContent: editContent.trim() || null,
      });
      setAiLoading(false);
      if (result.ok) {
        setGeneratedOutline(result.outline);
      } else {
        setOutlineError(result.error);
      }
    });
  }

  function handleAiSuggest() {
    if (!editingNote) return;
    const alreadyShown =
      typeof window !== "undefined" &&
      sessionStorage.getItem("ai_disclaimer_sermon_planning") === "shown";
    if (!alreadyShown) {
      setShowSermonDisclaimer(true);
      return;
    }
    triggerSermonAI();
  }

  function handleOutlineAccept(outline: string) {
    setEditContent((prev) => `${prev}\n\n---\n\nAI Suggestion:\n${outline}`);
  }

  function handleCreate() {
    if (!newTitle.trim()) return;
    startTransition(async () => {
      try {
        await createCouncilNoteAction({
          title: newTitle.trim(),
          content: newContent.trim() || null,
          noteType: newType,
        });
        notifications.show({
          title: "Note created",
          message: "Your council note has been saved.",
          color: "teal",
        });
        setNewTitle("");
        setNewContent("");
        setNewType("general");
        createDrawer.close();
      } catch (err) {
        notifications.show({
          title: "Error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          color: "red",
        });
      }
    });
  }

  function openEdit(note: CouncilNote) {
    setEditingNote(note);
    setEditTitle(note.title);
    setEditContent(note.content ?? "");
    editDrawer.open();
  }

  function handleUpdate() {
    if (!editingNote || !editTitle.trim()) return;
    startTransition(async () => {
      try {
        await updateCouncilNoteAction({
          noteId: editingNote.id,
          title: editTitle.trim(),
          content: editContent.trim() || null,
        });
        notifications.show({
          title: "Note updated",
          message: `Version ${editingNote.version + 1} has been saved.`,
          color: "teal",
        });
        editDrawer.close();
        setEditingNote(null);
      } catch (err) {
        notifications.show({
          title: "Error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          color: "red",
        });
      }
    });
  }

  // Group notes by type for the tabs
  const byType = notes.reduce(
    (acc, note) => {
      const key = note.noteType;
      if (!acc[key]) acc[key] = [];
      acc[key].push(note);
      return acc;
    },
    {} as Record<string, CouncilNote[]>,
  );

  const navItems = [
    { href: "/app/pastor", label: "Home", description: "Pastor overview", icon: BookOpen },
    {
      href: "/app/elders/discernment",
      label: "Discernment Room",
      description: "Elder sessions",
      icon: Lock,
    },
    {
      href: "/app/council/forge",
      label: "Council Forge",
      description: "Collaborative notes",
      icon: ScrollText,
      active: true,
    },
  ];

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/pastor"
      calendarHref="/app/calendar"
      sectionLabel="Pastor Council"
      title="Council Forge"
      description={session.appContext.church.name}
      sidebarTitle="Pastor Council Forge"
      sidebarDescription="Collaborative notes, sermon outlines, and sabbath reflections."
      navLabel="Leadership"
      navItems={navItems}
      topActions={
        <Button
          size="xs"
          variant="light"
          color="churchBlue"
          radius="xl"
          leftSection={<PlusCircle size={12} />}
          onClick={createDrawer.open}
        >
          New note
        </Button>
      }
    >
      {/* Council context note */}
      <Alert
        color="churchBlue"
        icon={<ScrollText size={14} />}
        variant="light"
        radius="md"
        mb="lg"
      >
        <Text fz="xs">
          Council Forge is a collaborative workspace for pastoral and administrative leadership. All notes are versioned and audit logged.{" "}
          <Text fz="xs" span c="dimmed">
            Liturgical calendar integration is planned for Phase 5.
          </Text>
        </Text>
      </Alert>

      <Tabs defaultValue="all" radius="xl">
        <Tabs.List>
          <Tabs.Tab value="all" leftSection={<FileText size={14} />}>
            All
            {notes.length > 0 ? (
              <Badge size="xs" color="gray" variant="filled" ml="xs">
                {notes.length}
              </Badge>
            ) : null}
          </Tabs.Tab>
          <Tabs.Tab value="sermon_outline" leftSection={<BookOpen size={14} />}>
            Sermons
          </Tabs.Tab>
          <Tabs.Tab value="series_plan" leftSection={<ScrollText size={14} />}>
            Series
          </Tabs.Tab>
          <Tabs.Tab value="council_minutes" leftSection={<Clock size={14} />}>
            Minutes
          </Tabs.Tab>
          <Tabs.Tab value="sabbath_reflection" leftSection={<Lock size={14} />}>
            Sabbath
          </Tabs.Tab>
        </Tabs.List>

        {/* All notes */}
        <Tabs.Panel value="all" pt="lg">
          {notes.length === 0 ? (
            <Alert color="gray" variant="light" radius="md">
              <Text fz="sm" c="dimmed" ta="center" py="sm">
                No council notes yet. Create your first note to begin collaborating.
              </Text>
            </Alert>
          ) : (
            <Stack gap="md">
              {notes.map((note) => (
                <CouncilNoteCard key={note.id} note={note} onEdit={openEdit} />
              ))}
            </Stack>
          )}
        </Tabs.Panel>

        {/* Per-type tabs */}
        {(["sermon_outline", "series_plan", "council_minutes", "sabbath_reflection"] as CouncilNoteType[]).map(
          (type) => (
            <Tabs.Panel key={type} value={type} pt="lg">
              {(byType[type] ?? []).length === 0 ? (
                <Alert color="gray" variant="light" radius="md">
                  <Text fz="sm" c="dimmed" ta="center" py="sm">
                    No {COUNCIL_NOTE_TYPE_LABELS[type].toLowerCase()} notes yet.
                  </Text>
                </Alert>
              ) : (
                <Stack gap="md">
                  {(byType[type] ?? []).map((note) => (
                    <CouncilNoteCard key={note.id} note={note} onEdit={openEdit} />
                  ))}
                </Stack>
              )}
            </Tabs.Panel>
          ),
        )}
      </Tabs>

      {/* Create drawer */}
      <Drawer
        opened={createOpen}
        onClose={createDrawer.close}
        title="New Council Note"
        position="right"
        size="lg"
        radius="lg"
      >
        <Stack gap="md" p="md">
          <TextInput
            label="Title"
            placeholder="Sermon title, series name, or agenda item..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.currentTarget.value)}
            required
            radius="md"
          />
          <Select
            label="Note type"
            data={NOTE_TYPE_OPTIONS}
            value={newType}
            onChange={(v) => setNewType((v as CouncilNoteType) ?? "general")}
            radius="md"
          />
          <Textarea
            label="Content"
            placeholder="Begin writing your outline, reflections, or minutes..."
            value={newContent}
            onChange={(e) => setNewContent(e.currentTarget.value)}
            minRows={8}
            autosize
            radius="md"
          />
          <Text fz="xs" c="dimmed" fs="italic">
            Each save creates a new version. Version history is preserved for audit purposes.
          </Text>
          <Divider />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" radius="xl" onClick={createDrawer.close}>
              Cancel
            </Button>
            <Button
              color="churchBlue"
              radius="xl"
              loading={isPending}
              disabled={!newTitle.trim()}
              onClick={handleCreate}
            >
              Save note
            </Button>
          </Group>
        </Stack>
      </Drawer>

      {/* Edit drawer */}
      <Drawer
        opened={editOpen}
        onClose={() => {
          editDrawer.close();
          setEditingNote(null);
        }}
        title={
          editingNote
            ? `Edit: ${COUNCIL_NOTE_TYPE_LABELS[editingNote.noteType]}`
            : "Edit Note"
        }
        position="right"
        size="lg"
        radius="lg"
      >
        {editingNote ? (
          <Stack gap="md" p="md">
            <Group gap="xs">
              <Badge
                color={NOTE_TYPE_COLOR[editingNote.noteType] ?? "gray"}
                variant="light"
                size="sm"
              >
                v{editingNote.version} → v{editingNote.version + 1}
              </Badge>
              <Text fz="xs" c="dimmed">
                Version will increment on save.
              </Text>
            </Group>
            <TextInput
              label="Title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.currentTarget.value)}
              required
              radius="md"
            />
            <Textarea
              label="Content"
              value={editContent}
              onChange={(e) => setEditContent(e.currentTarget.value)}
              minRows={10}
              autosize
              radius="md"
            />
            {(editingNote?.noteType === "sermon_outline" ||
              editingNote?.noteType === "series_plan") ? (
              <Group justify="flex-start">
                <Button
                  variant="light"
                  color="violet"
                  size="sm"
                  radius="xl"
                  loading={aiLoading}
                  onClick={handleAiSuggest}
                >
                  AI Suggest
                </Button>
              </Group>
            ) : null}
            <Divider />
            <Group justify="flex-end" gap="sm">
              <Button
                variant="default"
                radius="xl"
                onClick={() => {
                  editDrawer.close();
                  setEditingNote(null);
                }}
              >
                Cancel
              </Button>
              <Button
                color="churchBlue"
                radius="xl"
                loading={isPending}
                disabled={!editTitle.trim()}
                onClick={handleUpdate}
              >
                Save changes
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Drawer>
      {/* AI disclaimer gate for sermon planning */}
      {showSermonDisclaimer ? (
        <DisclaimerGate
          featureKey="sermon_planning"
          onConfirm={() => {
            setShowSermonDisclaimer(false);
            triggerSermonAI();
          }}
        />
      ) : null}

      {/* Sermon outline modal */}
      {editingNote &&
      (editingNote.noteType === "sermon_outline" ||
        editingNote.noteType === "series_plan") ? (
        <SermonOutlineModal
          opened={outlineModalOpen}
          onClose={() => {
            setOutlineModalOpen(false);
            setGeneratedOutline(null);
            setOutlineError(null);
          }}
          onAccept={handleOutlineAccept}
          noteTitle={editingNote.title}
          noteType={editingNote.noteType}
          outline={aiLoading ? null : generatedOutline}
          error={outlineError}
        />
      ) : null}
    </ApplicationShell>
  );
}
