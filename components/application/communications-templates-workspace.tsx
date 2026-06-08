"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Mail, MessageSquare, Plus, Trash2 } from "lucide-react";

import { deleteTemplateAction } from "@/app/app/communications-actions";
import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import type { CommunicationTemplate } from "@/lib/communications-types";

const navItems = [
  {
    href: "/app/communications/history",
    label: "Message History",
    description: "All sent and scheduled messages",
    icon: Mail,
  },
  {
    href: "/app/communications/compose",
    label: "Compose",
    description: "Send a new message",
    icon: Mail,
  },
  {
    href: "/app/communications/templates",
    label: "Templates",
    description: "Manage message templates",
    icon: MessageSquare,
    active: true,
  },
];

const CHANNEL_COLORS: Record<string, string> = {
  email: "blue",
  sms: "teal",
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

function ConfirmDeleteModal({
  opened,
  templateName,
  onConfirm,
  onClose,
  loading,
}: {
  opened: boolean;
  templateName: string;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  return (
    <Modal opened={opened} onClose={onClose} title="Delete template?" centered size="sm">
      <Text size="sm" c="#617184" mb="lg">
        Are you sure you want to delete &quot;{templateName}&quot;? This cannot be undone.
      </Text>
      <Group justify="flex-end" gap="sm">
        <Button variant="default" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button color="red" onClick={onConfirm} loading={loading}>
          Delete
        </Button>
      </Group>
    </Modal>
  );
}

export function CommunicationsTemplatesWorkspace({
  session,
  templates,
}: {
  session: ChurchAppSession;
  templates: CommunicationTemplate[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<CommunicationTemplate | null>(null);
  const [deleteModalOpen, deleteModalHandlers] = useDisclosure(false);
  const [feedback, setFeedback] = useState<{ color: string; message: string } | null>(null);

  function openDeleteConfirm(tmpl: CommunicationTemplate) {
    setDeleteTarget(tmpl);
    deleteModalHandlers.open();
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteTemplateAction({ id: deleteTarget.id });
      deleteModalHandlers.close();
      if (!result.ok) {
        setFeedback({ color: "red", message: result.error });
      } else {
        setFeedback({ color: "teal", message: "Template deleted." });
        router.refresh();
      }
      setDeleteTarget(null);
    });
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/communications/history"
      calendarHref="/app/calendar"
      sectionLabel="Communications"
      title="Message Templates"
      description={session.appContext.church.name}
      sidebarTitle="Communications"
      sidebarDescription="Send and manage messages"
      navLabel="Communications"
      navItems={navItems}
    >
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Title order={2} fw={700} c="#101827">
            Message Templates
          </Title>
          <Button
            component={Link}
            href="/app/communications/templates/new"
            variant="filled"
            color="blue"
            size="xs"
            radius="xl"
            leftSection={<Plus size={12} />}
          >
            New Template
          </Button>
        </Group>

        {feedback ? (
          <Alert
            color={feedback.color}
            variant="light"
            radius="md"
            withCloseButton
            onClose={() => setFeedback(null)}
          >
            {feedback.message}
          </Alert>
        ) : null}

        {templates.length === 0 ? (
          <Paper withBorder p="xl" radius="lg">
            <Stack align="center" gap="sm" py="lg">
              <Text c="dimmed" ta="center">
                No templates yet. Create your first template.
              </Text>
              <Button
                component={Link}
                href="/app/communications/templates/new"
                variant="light"
                size="sm"
                radius="xl"
              >
                Create template
              </Button>
            </Stack>
          </Paper>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {templates.map((tmpl) => (
              <Card key={tmpl.id} withBorder radius="lg" p="lg">
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-start">
                    <Text fw={700} size="sm" lineClamp={2}>
                      {tmpl.name}
                    </Text>
                    <Badge
                      color={CHANNEL_COLORS[tmpl.channel] ?? "gray"}
                      variant="light"
                      size="xs"
                    >
                      {tmpl.channel.toUpperCase()}
                    </Badge>
                  </Group>

                  {tmpl.subject ? (
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      Subject: {tmpl.subject}
                    </Text>
                  ) : null}

                  <Text size="xs" c="dimmed">
                    Updated: {formatDate(tmpl.updatedAt)}
                  </Text>

                  <Group gap="xs" justify="flex-end">
                    <Button
                      component={Link}
                      href={`/app/communications/templates/${tmpl.id}/edit`}
                      size="compact-xs"
                      variant="light"
                      color="blue"
                    >
                      Edit
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="light"
                      color="red"
                      leftSection={<Trash2 size={12} />}
                      onClick={() => openDeleteConfirm(tmpl)}
                      loading={isPending && deleteTarget?.id === tmpl.id}
                    >
                      Delete
                    </Button>
                  </Group>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        )}
      </Stack>

      <ConfirmDeleteModal
        opened={deleteModalOpen}
        templateName={deleteTarget?.name ?? ""}
        onConfirm={handleDelete}
        onClose={deleteModalHandlers.close}
        loading={isPending}
      />
    </ApplicationShell>
  );
}
