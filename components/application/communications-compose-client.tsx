"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { AlertCircle, Mail, MessageSquare, Send } from "lucide-react";

import {
  composeAndSendMessageAction,
  createTemplateAction,
  previewRecipientsAction,
} from "@/app/app/communications-actions";
import { ApplicationShell } from "@/components/application/app-shell";
import { CommunicationsAudienceBuilder } from "@/components/application/communications-audience-builder";
import { CommunicationsConfirmSendModal } from "@/components/application/communications-confirm-send-modal";
import type { ChurchAppSession } from "@/lib/auth";
import type { CommunicationChannel, CommunicationTemplate, SegmentFilter } from "@/lib/communications-types";

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
    icon: Send,
    active: true,
  },
  {
    href: "/app/communications/templates",
    label: "Templates",
    description: "Manage message templates",
    icon: MessageSquare,
  },
];

export function CommunicationsComposeClient({
  session,
  ministries,
  templates,
  initialTemplate,
}: {
  session: ChurchAppSession;
  ministries: Array<{ id: string; name: string }>;
  templates: CommunicationTemplate[];
  initialTemplate?: CommunicationTemplate;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Channel
  const [channel, setChannel] = useState<CommunicationChannel>(
    initialTemplate?.channel ?? "email",
  );

  // Message fields
  const [subject, setSubject] = useState(initialTemplate?.subject ?? "");
  const [body, setBody] = useState(initialTemplate?.body ?? "");

  // Template section
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    initialTemplate?.id ?? null,
  );
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [saveTemplateError, setSaveTemplateError] = useState<string | null>(null);
  const [isSavingTemplate, startSaveTemplateTransition] = useTransition();

  // Audience
  const [segment, setSegment] = useState<SegmentFilter>({});
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Schedule
  const [scheduleEnabled, scheduleHandlers] = useDisclosure(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");

  // Confirm modal
  const [confirmOpen, confirmHandlers] = useDisclosure(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const channelTemplates = templates.filter((t) => t.channel === channel);
  const templateOptions = channelTemplates.map((t) => ({ value: t.id, label: t.name }));

  const scheduledFor = scheduleEnabled && scheduleDate && scheduleTime
    ? `${scheduleDate}T${scheduleTime}:00`
    : null;

  // Debounced recipient preview
  const fetchPreview = useCallback(
    (seg: SegmentFilter, ch: CommunicationChannel) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setPreviewLoading(true);
        setPreviewError(null);
        try {
          const result = await previewRecipientsAction(seg, ch);
          if (result.ok) {
            setRecipientCount(result.result.count);
          } else {
            setPreviewError(result.error);
            setRecipientCount(null);
          }
        } catch (err) {
          setPreviewError(err instanceof Error ? err.message : "Preview failed.");
          setRecipientCount(null);
        } finally {
          setPreviewLoading(false);
        }
      }, 400);
    },
    [],
  );

  useEffect(() => {
    fetchPreview(segment, channel);
  }, [segment, channel, fetchPreview]);

  function handleSegmentChange(newSegment: SegmentFilter) {
    setSegment(newSegment);
  }

  function handleChannelChange(newChannel: CommunicationChannel) {
    setChannel(newChannel);
    setSelectedTemplateId(null);
    if (newChannel === "sms") {
      setSubject("");
    }
  }

  function handleLoadTemplate(templateId: string | null) {
    if (!templateId) {
      setSelectedTemplateId(null);
      return;
    }
    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) return;

    if (body.trim()) {
      if (!confirm("Replace current content with the selected template?")) return;
    }

    setSelectedTemplateId(templateId);
    if (tmpl.subject) setSubject(tmpl.subject);
    setBody(tmpl.body);
  }

  function handleSaveTemplate() {
    if (!newTemplateName.trim()) {
      setSaveTemplateError("Template name is required.");
      return;
    }
    if (!body.trim()) {
      setSaveTemplateError("Message body is required to save a template.");
      return;
    }

    setSaveTemplateError(null);
    startSaveTemplateTransition(async () => {
      const result = await createTemplateAction({
        name: newTemplateName.trim(),
        channel,
        subject: channel === "email" ? (subject.trim() || null) : null,
        body: body.trim(),
      });
      if (!result.ok) {
        setSaveTemplateError(result.error);
        return;
      }
      setNewTemplateName("");
      setShowSaveTemplate(false);
    });
  }

  function handleSubmitClick() {
    setSendError(null);
    confirmHandlers.open();
  }

  function handleConfirmSend() {
    startTransition(async () => {
      const result = await composeAndSendMessageAction({
        channel,
        subject: channel === "email" ? subject.trim() : null,
        body: body.trim(),
        segment,
        scheduledFor,
        templateId: selectedTemplateId ?? undefined,
      });

      if (!result.ok) {
        confirmHandlers.close();
        setSendError(result.error);
        return;
      }

      confirmHandlers.close();
      router.push("/app/communications/history");
    });
  }

  const canSend =
    body.trim().length > 0 &&
    (channel === "sms" || subject.trim().length > 0) &&
    recipientCount !== null &&
    recipientCount > 0 &&
    !isPending;

  const timezone = session.appContext.church.timezone;

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/communications/history"
      calendarHref="/app/calendar"
      sectionLabel="Communications"
      title="Compose Message"
      description={session.appContext.church.name}
      sidebarTitle="Communications"
      sidebarDescription="Send and manage messages"
      navLabel="Communications"
      navItems={navItems}
    >
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Title order={2} fw={700} c="#101827">
            Compose Message
          </Title>
          <Button
            component={Link}
            href="/app/communications/history"
            variant="default"
            size="xs"
            radius="xl"
          >
            Cancel
          </Button>
        </Group>

        {sendError ? (
          <Alert color="red" variant="light" radius="md" icon={<AlertCircle size={16} />}>
            {sendError}
          </Alert>
        ) : null}

        {/* Channel selector */}
        <Paper withBorder p="xl" radius="lg">
          <Text fw={600} size="sm" mb="sm">
            Channel
          </Text>
          <Group gap="xs">
            <Button
              variant={channel === "email" ? "filled" : "default"}
              color={channel === "email" ? "blue" : undefined}
              leftSection={<Mail size={14} />}
              onClick={() => handleChannelChange("email")}
              radius="xl"
              size="sm"
            >
              Email
            </Button>
            <Button
              variant={channel === "sms" ? "filled" : "default"}
              color={channel === "sms" ? "teal" : undefined}
              leftSection={<MessageSquare size={14} />}
              onClick={() => handleChannelChange("sms")}
              radius="xl"
              size="sm"
            >
              SMS
            </Button>
          </Group>
        </Paper>

        {/* Template section */}
        <Paper withBorder p="xl" radius="lg">
          <Text fw={600} size="sm" mb="sm">
            Template
          </Text>
          <Stack gap="sm">
            <Group gap="sm" align="flex-end">
              <Select
                placeholder="Load a template"
                data={templateOptions}
                value={selectedTemplateId}
                onChange={handleLoadTemplate}
                clearable
                style={{ flex: 1 }}
                size="sm"
              />
              <Button
                variant="light"
                size="sm"
                onClick={() => setShowSaveTemplate((v) => !v)}
              >
                {showSaveTemplate ? "Cancel" : "Save as template"}
              </Button>
            </Group>

            {showSaveTemplate ? (
              <Stack gap="xs">
                <Group gap="sm" align="flex-end">
                  <TextInput
                    placeholder="Template name"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.currentTarget.value)}
                    style={{ flex: 1 }}
                    size="sm"
                  />
                  <Button
                    size="sm"
                    color="blue"
                    loading={isSavingTemplate}
                    onClick={handleSaveTemplate}
                  >
                    Save
                  </Button>
                </Group>
                {saveTemplateError ? (
                  <Text size="xs" c="red">
                    {saveTemplateError}
                  </Text>
                ) : null}
              </Stack>
            ) : null}
          </Stack>
        </Paper>

        {/* Message fields */}
        <Paper withBorder p="xl" radius="lg">
          <Text fw={600} size="sm" mb="sm">
            Message
          </Text>
          <Stack gap="sm">
            {channel === "email" ? (
              <TextInput
                label="Subject"
                placeholder="Message subject"
                required
                value={subject}
                onChange={(e) => setSubject(e.currentTarget.value)}
                radius="md"
              />
            ) : null}

            <div>
              <Textarea
                label="Body"
                placeholder={channel === "sms" ? "SMS message (160 chars recommended)" : "Message body"}
                required
                minRows={5}
                autosize
                value={body}
                onChange={(e) => setBody(e.currentTarget.value)}
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
          </Stack>
        </Paper>

        {/* Audience */}
        <Paper withBorder p="xl" radius="lg">
          <Text fw={600} size="sm" mb="sm">
            Audience
          </Text>
          <CommunicationsAudienceBuilder
            value={segment}
            onChange={handleSegmentChange}
            ministries={ministries}
            channel={channel}
          />
          <Group gap="sm" mt="md" align="center">
            {previewLoading ? (
              <Badge color="gray" variant="light">
                Calculating...
              </Badge>
            ) : previewError ? (
              <Badge color="red" variant="light">
                Preview error
              </Badge>
            ) : recipientCount === null ? (
              <Badge color="gray" variant="light">
                —
              </Badge>
            ) : (
              <Badge
                color={recipientCount === 0 ? "orange" : "teal"}
                variant="filled"
              >
                {recipientCount} recipient{recipientCount === 1 ? "" : "s"}
              </Badge>
            )}
            {recipientCount === 0 && !previewLoading ? (
              <Text size="xs" c="orange">
                No contactable recipients match this segment.
              </Text>
            ) : null}
          </Group>
        </Paper>

        {/* Schedule */}
        <Paper withBorder p="xl" radius="lg">
          <Stack gap="sm">
            <Switch
              label="Schedule for later"
              checked={scheduleEnabled}
              onChange={scheduleHandlers.toggle}
            />

            {scheduleEnabled ? (
              <Stack gap="xs">
                <Group gap="sm">
                  <TextInput
                    type="date"
                    label="Date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.currentTarget.value)}
                    style={{ flex: 1 }}
                    radius="md"
                    min={new Date().toISOString().slice(0, 10)}
                  />
                  <TextInput
                    type="time"
                    label="Time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.currentTarget.value)}
                    style={{ flex: 1 }}
                    radius="md"
                  />
                </Group>
                <Text size="xs" c="dimmed">
                  Times are in {timezone}
                </Text>
              </Stack>
            ) : null}
          </Stack>
        </Paper>

        {/* Submit */}
        <Group justify="flex-end">
          <Button
            color="blue"
            radius="xl"
            size="md"
            leftSection={<Send size={16} />}
            disabled={!canSend}
            loading={isPending}
            onClick={handleSubmitClick}
          >
            {scheduledFor ? "Schedule" : "Send now"}
          </Button>
        </Group>
      </Stack>

      <CommunicationsConfirmSendModal
        opened={confirmOpen}
        recipientCount={recipientCount ?? 0}
        channel={channel}
        scheduledFor={scheduledFor}
        churchTimezone={timezone}
        onConfirm={handleConfirmSend}
        onClose={confirmHandlers.close}
        loading={isPending}
      />
    </ApplicationShell>
  );
}
