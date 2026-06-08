"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { AlertCircle, Edit, Trash2 } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { OperationsConfirmDeleteModal } from "@/components/application/operations-confirm-delete-modal";
import { deleteChurchDocumentAction } from "@/app/app/church-admin/operations/actions";
import type { AuthSession } from "@/lib/auth";
import type { ChurchDocument, ChurchDocumentType } from "@/lib/operations-types";

const DOC_TYPE_LABELS: Record<ChurchDocumentType, string> = {
  vision_mission: "Vision / Mission",
  faith_stance: "Faith Stance",
  policy: "Policy",
  general: "General",
  elder_council_notes: "Elder Council Notes",
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function OperationsDocumentDetailClient({
  session,
  document,
}: {
  session: AuthSession;
  document: ChurchDocument;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteChurchDocumentAction({ id: document.id });
      if (!result.ok) {
        setError(result.error ?? "Unable to delete document.");
        setDeleteOpen(false);
        return;
      }
      router.push("/app/church-admin/operations/documents");
    });
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref={session.homePath}
      sectionLabel="Church Admin"
      title={document.title}
      description={DOC_TYPE_LABELS[document.docType]}
      sidebarTitle="Operations"
      sidebarDescription="Documents & onboarding"
      navItems={[
        {
          href: "/app/church-admin/operations/documents",
          label: "Documents",
          description: "Church documents library",
          icon: "ClipboardList",
          active: true,
        },
        {
          href: "/app/church-admin/operations/onboarding",
          label: "Onboarding",
          description: "Templates & active onboarding",
          icon: "UserPlus",
        },
      ]}
    >
      <Stack gap="lg" maw={800}>
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Group gap="sm" align="center">
              <Title order={2} fw={700} c="#101827">
                {document.title}
              </Title>
              {document.docType === "elder_council_notes" ? (
                <Badge color="red">Restricted — Pastoral Only</Badge>
              ) : (
                <Badge color="blue" variant="light">
                  {DOC_TYPE_LABELS[document.docType]}
                </Badge>
              )}
            </Group>
            <Text size="xs" c="#9ca3af">
              Last updated {formatDate(document.updatedAt)}
            </Text>
          </Stack>

          <Group gap="sm">
            <Button
              component={Link}
              href={`/app/church-admin/operations/documents/${document.id}/edit`}
              leftSection={<Edit size={15} />}
              variant="default"
              size="sm"
            >
              Edit
            </Button>
            <Button
              color="red"
              variant="light"
              leftSection={<Trash2 size={15} />}
              size="sm"
              onClick={() => setDeleteOpen(true)}
            >
              Delete
            </Button>
          </Group>
        </Group>

        {error ? (
          <Alert color="red" icon={<AlertCircle size={16} />}>
            {error}
          </Alert>
        ) : null}

        <Paper radius="md" p="lg" withBorder>
          <Text
            size="sm"
            style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, color: "#374151" }}
          >
            {document.body}
          </Text>
        </Paper>
      </Stack>

      <OperationsConfirmDeleteModal
        opened={deleteOpen}
        title={document.title}
        onConfirm={handleDelete}
        onClose={() => setDeleteOpen(false)}
        loading={isPending}
      />
    </ApplicationShell>
  );
}
