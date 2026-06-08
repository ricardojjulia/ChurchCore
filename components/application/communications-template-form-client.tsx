"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Alert,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { AlertCircle, Mail, MessageSquare } from "lucide-react";

import {
  createTemplateAction,
  updateTemplateAction,
} from "@/app/app/communications-actions";
import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import type { CommunicationChannel, CommunicationTemplate } from "@/lib/communications-types";

const navItems = [
  {
    href: "/app/communications/history",
    label: "Message History",
    description: "All sent and scheduled messages",
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

export function CommunicationsTemplateFormClient({
  session,
  initialValues,
  isEdit = false,
}: {
  session: ChurchAppSession;
  initialValues?: CommunicationTemplate;
  isEdit?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(initialValues?.name ?? "");
  const [channel, setChannel] = useState<CommunicationChannel>(
    initialValues?.channel ?? "email",
  );
  const [subject, setSubject] = useState(initialValues?.subject ?? "");
  const [body, setBody] = useState(initialValues?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    body?: string;
    subject?: string;
  }>({});

  function validate() {
    const errors: { name?: string; body?: string; subject?: string } = {};
    if (!name.trim()) errors.name = "Template name is required.";
    if (!body.trim()) errors.body = "Message body is required.";
    if (channel === "email" && !subject.trim()) errors.subject = "Subject is required for email templates.";
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
        const result = await updateTemplateAction({
          id: initialValues.id,
          name: name.trim(),
          subject: channel === "email" ? subject.trim() : null,
          body: body.trim(),
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } else {
        const result = await createTemplateAction({
          name: name.trim(),
          channel,
          subject: channel === "email" ? (subject.trim() || null) : null,
          body: body.trim(),
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      router.push("/app/communications/templates");
    });
  }

  const pageTitle = isEdit ? "Edit Template" : "New Template";

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/communications/history"
      calendarHref="/app/calendar"
      sectionLabel="Communications"
      title={pageTitle}
      description={session.appContext.church.name}
      sidebarTitle="Communications"
      sidebarDescription="Send and manage messages"
      navLabel="Communications"
      navItems={navItems}
    >
      <Stack gap="lg">
        <Title order={2} fw={700} c="#101827">
          {pageTitle}
        </Title>

        {error ? (
          <Alert color="red" variant="light" radius="md" icon={<AlertCircle size={16} />}>
            {error}
          </Alert>
        ) : null}

        <form onSubmit={handleSubmit}>
          <Paper withBorder p="xl" radius="lg">
            <Stack gap="md">
              <TextInput
                label="Template Name"
                placeholder="e.g. Sunday Service Reminder"
                required
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                error={fieldErrors.name}
                radius="md"
              />

              <div>
                <Text size="sm" fw={500} mb="xs">
                  Channel
                </Text>
                <Group gap="xs">
                  <Button
                    type="button"
                    variant={channel === "email" ? "filled" : "default"}
                    color={channel === "email" ? "blue" : undefined}
                    leftSection={<Mail size={14} />}
                    onClick={() => !isEdit && setChannel("email")}
                    radius="xl"
                    size="sm"
                    disabled={isEdit}
                  >
                    Email
                  </Button>
                  <Button
                    type="button"
                    variant={channel === "sms" ? "filled" : "default"}
                    color={channel === "sms" ? "teal" : undefined}
                    leftSection={<MessageSquare size={14} />}
                    onClick={() => !isEdit && setChannel("sms")}
                    radius="xl"
                    size="sm"
                    disabled={isEdit}
                  >
                    SMS
                  </Button>
                </Group>
                {isEdit ? (
                  <Text size="xs" c="dimmed" mt={4}>
                    Channel cannot be changed after creation.
                  </Text>
                ) : null}
              </div>

              {channel === "email" ? (
                <TextInput
                  label="Subject"
                  placeholder="Email subject line"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.currentTarget.value)}
                  error={fieldErrors.subject}
                  radius="md"
                />
              ) : null}

              <div>
                <Textarea
                  label="Body"
                  placeholder={
                    channel === "sms"
                      ? "SMS message body (160 chars recommended)"
                      : "Message body"
                  }
                  required
                  minRows={4}
                  autosize
                  value={body}
                  onChange={(e) => setBody(e.currentTarget.value)}
                  error={fieldErrors.body}
                  radius="md"
                />
                {channel === "sms" ? (
                  <Text
                    size="xs"
                    c={body.length > 160 ? "red" : "dimmed"}
                    mt={4}
                    ta="right"
                  >
                    {body.length}/160 characters
                    {body.length > 160 ? " — SMS may be split into multiple parts" : ""}
                  </Text>
                ) : null}
              </div>

              <Group justify="flex-end" gap="sm" pt="md">
                <Button
                  component={Link}
                  href="/app/communications/templates"
                  variant="default"
                  radius="xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  color="blue"
                  radius="xl"
                  loading={isPending}
                >
                  {isEdit ? "Save changes" : "Create template"}
                </Button>
              </Group>
            </Stack>
          </Paper>
        </form>
      </Stack>
    </ApplicationShell>
  );
}
