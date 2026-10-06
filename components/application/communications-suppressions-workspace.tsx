"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { Ban, Lock, Mail, Send } from "lucide-react";

import {
  removeSuppressionAction,
  suppressContactAction,
} from "@/app/app/communications-actions";
import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import {
  isRemovableSuppressionReason,
  MIN_REMOVAL_REASON_LENGTH,
  SUPPRESSION_REASON_LABELS,
  type SuppressionChannel,
  type SuppressionRow,
} from "@/lib/communications/suppression-types";

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
  },
  {
    href: "/app/communications/templates",
    label: "Templates",
    description: "Manage message templates",
    icon: Mail,
  },
  {
    href: "/app/communications/suppressions",
    label: "Suppressions",
    description: "Contacts that won't receive messages",
    icon: Ban,
    active: true,
  },
];

const CHANNEL_COLORS: Record<SuppressionChannel, string> = { email: "blue", sms: "teal" };

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function CommunicationsSuppressionsWorkspace({
  session,
  suppressions,
  truncated = false,
  canManage,
}: {
  session: ChurchAppSession;
  suppressions: SuppressionRow[];
  /** True when the church has more suppressions than the page loads. */
  truncated?: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [channelFilter, setChannelFilter] = useState<"all" | SuppressionChannel>("all");
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<{ color: string; message: string } | null>(null);

  const [addChannel, setAddChannel] = useState<SuppressionChannel>("email");
  const [addContact, setAddContact] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const [removing, setRemoving] = useState<SuppressionRow | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [removeError, setRemoveError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return suppressions.filter((row) => {
      if (channelFilter !== "all" && row.channel !== channelFilter) return false;
      if (!needle) return true;
      return (
        row.contact.toLowerCase().includes(needle) ||
        (row.memberName ?? "").toLowerCase().includes(needle)
      );
    });
  }, [suppressions, channelFilter, search]);

  function handleAdd() {
    setAddError(null);
    setFeedback(null);
    startTransition(async () => {
      const result = await suppressContactAction({
        channel: addChannel,
        contact: addContact,
        reason: "manual",
        notes: addNotes,
      });
      if (!result.ok) {
        setAddError(result.error);
        return;
      }
      setAddContact("");
      setAddNotes("");
      setFeedback({ color: "teal", message: "Contact suppressed. It will no longer receive messages." });
      router.refresh();
    });
  }

  function closeRemove() {
    setRemoving(null);
    setRemoveReason("");
    setRemoveError(null);
  }

  function handleRemove() {
    if (!removing) return;
    setRemoveError(null);
    const target = removing;
    startTransition(async () => {
      const result = await removeSuppressionAction({ id: target.id, reason: removeReason });
      if (!result.ok) {
        setRemoveError(result.error);
        return;
      }
      closeRemove();
      setFeedback({ color: "teal", message: `${target.contact} can receive messages again.` });
      router.refresh();
    });
  }

  const reasonTooShort = removeReason.trim().length < MIN_REMOVAL_REASON_LENGTH;

  return (
    <ApplicationShell
      session={session}
      workspaceHref={session.homePath}
      calendarHref="/app/calendar"
      sectionLabel="Communications"
      title="Suppressions"
      description={session.appContext.church.name}
      sidebarTitle="Communications"
      sidebarDescription="Send and manage messages"
      navLabel="Communications"
      navItems={navItems}
    >
      <Stack gap="lg">
        <Title order={2} fw={700}>
          Suppressions
        </Title>
        <Text c="dimmed" fz="sm">
          Contacts here are skipped when you send messages. Bounced addresses and staff additions can be
          removed by a church administrator. People who unsubscribed or marked a message as spam stay
          blocked until they opt back in themselves.
        </Text>

        <div role="status" aria-live="polite">
          {feedback ? (
            <Alert color={feedback.color} variant="light" radius="md" withCloseButton onClose={() => setFeedback(null)}>
              {feedback.message}
            </Alert>
          ) : null}
        </div>
        {truncated ? (
          <Alert color="yellow" variant="light" radius="md">
            Showing the newest {suppressions.length.toLocaleString("en-US")} suppressions; search to find others.
          </Alert>
        ) : null}

        {canManage ? (
          <Paper withBorder p="md" radius="md" aria-label="Add a suppression">
            <Stack gap="sm">
              <Text fw={600}>Add a suppression</Text>
              <Group align="flex-start" gap="sm" wrap="wrap">
                <Select
                  label="Channel"
                  data={[
                    { value: "email", label: "Email" },
                    { value: "sms", label: "SMS" },
                  ]}
                  value={addChannel}
                  onChange={(value) => setAddChannel((value as SuppressionChannel) ?? "email")}
                  allowDeselect={false}
                  w={120}
                />
                <TextInput
                  label="Contact"
                  placeholder={addChannel === "email" ? "name@example.com" : "+1 555 010 0000"}
                  value={addContact}
                  onChange={(event) => setAddContact(event.currentTarget.value)}
                  error={addError}
                  style={{ flex: 1, minWidth: 220 }}
                />
                <TextInput
                  label="Notes (optional)"
                  value={addNotes}
                  onChange={(event) => setAddNotes(event.currentTarget.value)}
                  style={{ flex: 1, minWidth: 220 }}
                />
                <Button mt={25} onClick={handleAdd} loading={isPending && !removing} disabled={!addContact.trim()}>
                  Add suppression
                </Button>
              </Group>
            </Stack>
          </Paper>
        ) : null}

        <Group gap="sm" align="flex-end" wrap="wrap">
          <SegmentedControl
            aria-label="Filter by channel"
            value={channelFilter}
            onChange={(value) => setChannelFilter(value as "all" | SuppressionChannel)}
            data={[
              { value: "all", label: "All" },
              { value: "email", label: "Email" },
              { value: "sms", label: "SMS" },
            ]}
          />
          <TextInput
            aria-label="Search by contact or name"
            placeholder="Search contact or name"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
        </Group>

        {visible.length === 0 ? (
          <Paper withBorder p="xl" radius="lg">
            <Text c="dimmed" ta="center">
              {suppressions.length === 0
                ? "No suppressed contacts. Everyone can receive messages."
                : "No suppressions match your filter."}
            </Text>
          </Paper>
        ) : (
          <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
            <Table.ScrollContainer minWidth={720}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Contact</Table.Th>
                  <Table.Th>Channel</Table.Th>
                  <Table.Th>Reason</Table.Th>
                  <Table.Th>Notes</Table.Th>
                  <Table.Th>Added</Table.Th>
                  {canManage ? <Table.Th>Actions</Table.Th> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visible.map((row) => (
                  <Table.Tr key={row.id} data-testid="suppression-row">
                    <Table.Td>
                      <Text fz="sm">{row.contact}</Text>
                      {row.memberName ? (
                        <Text fz="xs" c="dimmed">
                          {row.memberName}
                        </Text>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      <Badge color={CHANNEL_COLORS[row.channel]} size="xs" variant="light" radius="sm">
                        {row.channel.toUpperCase()}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm">{SUPPRESSION_REASON_LABELS[row.reason] ?? row.reason}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="xs" c="dimmed">
                        {row.notes ?? "—"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="xs" c="dimmed">
                        {formatDate(row.createdAt)}
                      </Text>
                      {row.addedByName ? (
                        <Text fz="xs" c="dimmed">
                          by {row.addedByName}
                        </Text>
                      ) : null}
                    </Table.Td>
                    {canManage ? (
                      <Table.Td>
                        {isRemovableSuppressionReason(row.reason) ? (
                          <Button
                            size="compact-xs"
                            variant="light"
                            color="red"
                            onClick={() => setRemoving(row)}
                            aria-label={`Remove suppression for ${row.contact}`}
                          >
                            Remove
                          </Button>
                        ) : (
                          <Group gap={4} wrap="nowrap">
                            <Lock size={12} aria-hidden />
                            <Text fz="xs" c="dimmed">
                              Only the person can opt back in
                            </Text>
                          </Group>
                        )}
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            </Table.ScrollContainer>
          </Paper>
        )}
      </Stack>

      <Modal opened={removing !== null} onClose={closeRemove} title="Remove suppression" centered>
        <Stack gap="sm">
          <Text fz="sm">
            {removing?.contact} will be able to receive messages again. Give a reason; it is recorded in
            the audit log.
          </Text>
          <Textarea
            label="Reason"
            value={removeReason}
            onChange={(event) => setRemoveReason(event.currentTarget.value)}
            minRows={2}
            error={removeError}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeRemove}>
              Cancel
            </Button>
            <Button color="red" onClick={handleRemove} loading={isPending} disabled={reasonTooShort}>
              Remove suppression
            </Button>
          </Group>
        </Stack>
      </Modal>
    </ApplicationShell>
  );
}
