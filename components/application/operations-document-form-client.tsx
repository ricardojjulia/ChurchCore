"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Alert,
  Button,
  Group,
  NativeSelect,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { AlertCircle, AlertTriangle } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import {
  createChurchDocumentAction,
  updateChurchDocumentAction,
} from "@/app/app/church-admin/operations/actions";
import type { AuthSession } from "@/lib/auth";
import type { ChurchDocument, ChurchDocumentType } from "@/lib/operations-types";

const DOC_TYPE_OPTIONS: { value: ChurchDocumentType; label: string }[] = [
  { value: "vision_mission", label: "Vision / Mission" },
  { value: "faith_stance", label: "Faith Stance" },
  { value: "policy", label: "Policy" },
  { value: "general", label: "General" },
  { value: "elder_council_notes", label: "Elder Council Notes" },
];

export function OperationsDocumentFormClient({
  session,
  initialValues,
  isEdit = false,
}: {
  session: AuthSession;
  initialValues?: ChurchDocument;
  isEdit?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [docType, setDocType] = useState<ChurchDocumentType>(
    initialValues?.docType ?? "general",
  );
  const [body, setBody] = useState(initialValues?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    title?: string;
    body?: string;
  }>({});

  const pageTitle = isEdit ? "Edit document" : "New document";

  function validate() {
    const errors: { title?: string; body?: string } = {};
    if (!title.trim()) errors.title = "Title is required.";
    if (!body.trim()) errors.body = "Body is required.";
    return errors;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    startTransition(async () => {
      if (isEdit && initialValues) {
        const result = await updateChurchDocumentAction({
          id: initialValues.id,
          title,
          body,
        });
        if (!result.ok) {
          setError(result.error ?? "Unable to update document.");
          return;
        }
      } else {
        const result = await createChurchDocumentAction({ title, docType, body });
        if (!result.ok) {
          setError(result.error ?? "Unable to create document.");
          return;
        }
      }
      router.push("/app/church-admin/operations/documents");
    });
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref={session.homePath}
      sectionLabel="Church Admin"
      title={pageTitle}
      description={isEdit ? "Update document content" : "Create a new church document"}
      sidebarTitle="Operations"
      sidebarDescription="Documents & onboarding"
      navItems={[
        {
          href: "/app/church-admin/operations/documents",
          label: "Documents",
          description: "Church documents library",
          icon: "ClipboardList",
        },
        {
          href: "/app/church-admin/operations/onboarding",
          label: "Onboarding",
          description: "Templates & active onboarding",
          icon: "UserPlus",
        },
      ]}
    >
      <Stack gap="lg" maw={720}>
        <Title order={2} fw={700} c="#101827">
          {pageTitle}
        </Title>

        {error ? (
          <Alert color="red" icon={<AlertCircle size={16} />}>
            {error}
          </Alert>
        ) : null}

        <Paper radius="md" p="lg" withBorder>
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <TextInput
                label="Title"
                placeholder="Document title"
                required
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
                error={fieldErrors.title}
              />

              <NativeSelect
                label="Type"
                data={DOC_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                value={docType}
                onChange={(e) => setDocType(e.currentTarget.value as ChurchDocumentType)}
                disabled={isEdit}
                description={isEdit ? "Document type cannot be changed after creation." : undefined}
              />

              {docType === "elder_council_notes" ? (
                <Alert color="yellow" icon={<AlertTriangle size={16} />}>
                  This document will be encrypted at rest. Access is restricted to pastoral staff.
                </Alert>
              ) : null}

              <Textarea
                label="Body"
                placeholder="Document content"
                required
                minRows={6}
                autosize
                value={body}
                onChange={(e) => setBody(e.currentTarget.value)}
                error={fieldErrors.body}
              />

              <Group justify="flex-end" gap="sm" pt="sm">
                <Button
                  variant="default"
                  component={Link}
                  href="/app/church-admin/operations/documents"
                >
                  Cancel
                </Button>
                <Button type="submit" color="teal" loading={isPending}>
                  {isEdit ? "Save changes" : "Create document"}
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>

        {isEdit ? (
          <Text size="xs" c="#9ca3af">
            Last updated: {initialValues ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(initialValues.updatedAt)) : "—"}
          </Text>
        ) : null}
      </Stack>
    </ApplicationShell>
  );
}
