"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";

import {
  submitPublicEventRegistrationAction,
} from "@/app/portal/actions";
import type {
  PublicEventRegistrationField,
  PublicEventRegistrationOption,
} from "@/lib/public-event-registration-data";

type Props = {
  churchId: string;
  churchName: string;
  options: PublicEventRegistrationOption[];
};

export function PublicEventRegistrationPanel({ churchId, churchName, options }: Props) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [registrantName, setRegistrantName] = useState("");
  const [registrantEmail, setRegistrantEmail] = useState("");
  const [registrantPhone, setRegistrantPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string | number | boolean>>({});
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedEvent = useMemo(
    () => options.find((option) => option.eventId === selectedEventId) ?? null,
    [options, selectedEventId],
  );

  function openRegistration(eventId: string) {
    setSelectedEventId(eventId);
    setRegistrantName("");
    setRegistrantEmail("");
    setRegistrantPhone("");
    setNotes("");
    setFieldValues({});
    setMessage(null);
  }

  function closeModal() {
    setSelectedEventId(null);
    setRegistrantName("");
    setRegistrantEmail("");
    setRegistrantPhone("");
    setNotes("");
    setFieldValues({});
    setMessage(null);
  }

  function isFieldValid(field: PublicEventRegistrationField) {
    if (!field.isRequired) {
      return true;
    }

    const value = fieldValues[field.fieldKey];
    if (field.fieldType === "checkbox") {
      return Boolean(value);
    }

    if (typeof value === "number") {
      return true;
    }

    return String(value ?? "").trim().length > 0;
  }

  function handleSubmit() {
    if (!selectedEvent) {
      return;
    }

    if (!registrantName.trim()) {
      setMessage({ type: "error", text: "Name is required." });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registrantEmail.trim())) {
      setMessage({ type: "error", text: "Enter a valid email address." });
      return;
    }

    const requiredMissing = selectedEvent.fields.find((field) => !isFieldValid(field));
    if (requiredMissing) {
      setMessage({
        type: "error",
        text: `Please complete required field: ${requiredMissing.label}.`,
      });
      return;
    }

    startTransition(async () => {
      const customFields = selectedEvent.fields.reduce<Record<string, unknown>>((acc, field) => {
        const value = fieldValues[field.fieldKey];
        if (value === undefined || value === "") {
          return acc;
        }

        acc[field.fieldKey] = value;
        return acc;
      }, {});

      const result = await submitPublicEventRegistrationAction({
        churchId,
        eventId: selectedEvent.eventId,
        registrantName,
        registrantEmail,
        registrantPhone: registrantPhone || null,
        notes: notes || null,
        customFields,
      });

      if (!result.ok) {
        setMessage({ type: "error", text: result.error ?? "Registration failed." });
        return;
      }

      if (result.previewMode) {
        setMessage({ type: "success", text: "Preview mode registration submitted." });
        return;
      }

      if (result.alreadyRegistered) {
        setMessage({ type: "success", text: "This email is already registered for this event." });
        return;
      }

      const statusText = result.status === "pending_approval"
        ? "Registration submitted and awaiting approval."
        : result.status === "waitlisted"
          ? "Registration submitted to waitlist."
          : "Registration confirmed.";
      setMessage({ type: "success", text: statusText });
    });
  }

  return (
    <Paper withBorder radius="xl" p="xl">
      <Group justify="space-between" align="center" mb="lg">
        <div>
          <Title order={2} size="h3">Event registration</Title>
          <Text size="sm" c="dimmed">{churchName}</Text>
        </div>
      </Group>

      <Stack gap="sm">
        {options.length === 0 ? (
          <Text size="sm" c="dimmed">No open public event registrations are available right now.</Text>
        ) : (
          options.map((option) => (
            <Paper key={option.eventId} withBorder radius="md" p="lg">
              <Group justify="space-between" align="flex-start">
                <Stack gap={4}>
                  <Text fw={600}>{option.title}</Text>
                  <Text size="sm" c="dimmed">
                    {new Date(option.startsAt).toLocaleString()}
                  </Text>
                  <Group gap="xs">
                    <Badge variant="light" color="gray">{option.category}</Badge>
                    {option.capacity ? (
                      <Badge variant="light" color="blue">
                        {option.registrationCount}/{option.capacity}
                      </Badge>
                    ) : null}
                    {option.waitlistCount > 0 ? (
                      <Badge variant="light" color="yellow">
                        waitlist {option.waitlistCount}
                      </Badge>
                    ) : null}
                    {option.priceCents > 0 ? (
                      <Badge variant="light" color="grape">
                        {(option.priceCents / 100).toLocaleString(undefined, {
                          style: "currency",
                          currency: option.currency.toUpperCase(),
                        })}
                      </Badge>
                    ) : (
                      <Badge variant="light" color="teal">free</Badge>
                    )}
                  </Group>
                </Stack>

                <Button size="xs" onClick={() => openRegistration(option.eventId)}>
                  Register
                </Button>
              </Group>
            </Paper>
          ))
        )}
      </Stack>

      <Modal
        opened={Boolean(selectedEvent)}
        onClose={closeModal}
        title={selectedEvent ? `Register for ${selectedEvent.title}` : "Register"}
        size="lg"
        withinPortal={false}
        keepMounted
        transitionProps={{ duration: 0 }}
      >
        <Stack gap="sm">
          {message ? (
            <Alert color={message.type === "success" ? "teal" : "red"}>{message.text}</Alert>
          ) : null}

          <TextInput
            label="Full name"
            required
            value={registrantName}
            onChange={(event) => setRegistrantName(event.currentTarget.value)}
          />

          <TextInput
            label="Email"
            required
            value={registrantEmail}
            onChange={(event) => setRegistrantEmail(event.currentTarget.value)}
          />

          <TextInput
            label="Phone (optional)"
            value={registrantPhone}
            onChange={(event) => setRegistrantPhone(event.currentTarget.value)}
          />

          {selectedEvent?.fields.map((field) => {
            const key = field.fieldKey;
            const value = fieldValues[key];

            if (field.fieldType === "textarea") {
              return (
                <Textarea
                  key={field.id}
                  label={field.label}
                  required={field.isRequired}
                  value={String(value ?? "")}
                  onChange={(event) =>
                    setFieldValues((prev) => ({ ...prev, [key]: event.currentTarget.value }))
                  }
                />
              );
            }

            if (field.fieldType === "select") {
              return (
                <Select
                  key={field.id}
                  label={field.label}
                  required={field.isRequired}
                  data={field.options.map((option) => ({ value: option, label: option }))}
                  value={typeof value === "string" ? value : null}
                  onChange={(next) => setFieldValues((prev) => ({ ...prev, [key]: next ?? "" }))}
                />
              );
            }

            if (field.fieldType === "checkbox") {
              return (
                <Button
                  key={field.id}
                  variant={Boolean(value) ? "filled" : "default"}
                  onClick={() =>
                    setFieldValues((prev) => ({ ...prev, [key]: !Boolean(prev[key]) }))
                  }
                  justify="flex-start"
                >
                  {field.label}
                </Button>
              );
            }

            if (field.fieldType === "number") {
              return (
                <NumberInput
                  key={field.id}
                  label={field.label}
                  required={field.isRequired}
                  value={typeof value === "number" ? value : undefined}
                  onChange={(next) =>
                    setFieldValues((prev) => ({ ...prev, [key]: typeof next === "number" ? next : "" }))
                  }
                />
              );
            }

            return (
              <TextInput
                key={field.id}
                label={field.label}
                required={field.isRequired}
                value={String(value ?? "")}
                onChange={(event) =>
                  setFieldValues((prev) => ({ ...prev, [key]: event.currentTarget.value }))
                }
              />
            );
          })}

          <Textarea
            label="Notes (optional)"
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleSubmit} loading={isPending}>Submit registration</Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
