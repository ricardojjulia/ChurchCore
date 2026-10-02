"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
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
  cancelUnpaidPublicRegistrationAction,
  submitPublicEventRegistrationAction,
} from "@/app/portal/actions";
import {
  RegistrationPaymentStep,
  type RegistrationPaymentState,
} from "@/components/portal/registration-payment-step";
import type {
  PublicEventRegistrationField,
  PublicEventRegistrationOption,
} from "@/lib/public-event-registration-data";

type Props = {
  churchId: string;
  churchName: string;
  /** The church's IANA time zone; event times are shown in it, labelled. */
  timeZone?: string | null;
  options: PublicEventRegistrationOption[];
};

// Event times in the church's own time zone, with the zone named, so a
// visitor elsewhere doesn't read the church's 10 AM as their own (Council
// Review 33). Falls back to the browser's zone if the church's is unusable.
function formatEventTime(iso: string, timeZone: string | null | undefined): string {
  // Explicit parts: dateStyle/timeStyle can't be combined with timeZoneName.
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  };
  try {
    return new Intl.DateTimeFormat(undefined, { ...options, timeZone: timeZone ?? undefined }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(new Date(iso));
  }
}

export function PublicEventRegistrationPanel({ churchId, churchName, timeZone, options }: Props) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [registrantName, setRegistrantName] = useState("");
  const [registrantEmail, setRegistrantEmail] = useState("");
  const [registrantPhone, setRegistrantPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string | number | boolean>>({});
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [paymentCheckout, setPaymentCheckout] = useState<RegistrationPaymentState | null>(null);
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
    setPaymentCheckout(null);
    setMessage(null);
  }

  function closeModal() {
    // Leaving without paying cancels the unpaid registration, freeing its
    // place (G3.0c). Best effort: a failure leaves it unpaid for the church.
    if (paymentCheckout) {
      void cancelUnpaidPublicRegistrationAction(paymentCheckout.registrationId, paymentCheckout.paymentIntentId).catch(
        () => undefined,
      );
    }
    setSelectedEventId(null);
    setRegistrantName("");
    setRegistrantEmail("");
    setRegistrantPhone("");
    setNotes("");
    setFieldValues({});
    setPaymentCheckout(null);
    setMessage(null);
  }

  function formatAmount(cents: number, currency: string) {
    return (cents / 100).toLocaleString(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    });
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

  function handlePaid(status: string) {
    setPaymentCheckout(null);
    setMessage({
      type: "success",
      text:
        status === "succeeded"
          ? "Payment received. Your registration is complete."
          : "Your payment is processing. Your registration completes when it clears.",
    });
  }

  function cancelUnpaid() {
    if (!paymentCheckout) return;
    const { registrationId, paymentIntentId } = paymentCheckout;
    startTransition(async () => {
      const result = await cancelUnpaidPublicRegistrationAction(registrationId, paymentIntentId);
      if (!result.ok) {
        setMessage({ type: "error", text: result.error ?? "Couldn't cancel the registration. Please try again." });
        return;
      }
      setPaymentCheckout(null);
      setMessage(
        result.cancelled
          ? { type: "success", text: "Registration cancelled. You weren't charged." }
          : { type: "success", text: "Your payment already went through, so your registration stands." },
      );
    });
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
        setPaymentCheckout(null);
        return;
      }

      if (result.previewMode) {
        setMessage({ type: "success", text: "Preview mode registration submitted." });
        setPaymentCheckout(null);
        return;
      }

      if (result.alreadyRegistered) {
        setMessage({ type: "success", text: "This email is already registered for this event." });
        setPaymentCheckout(null);
        return;
      }

      const statusText = result.status === "pending_approval"
        ? "Registration submitted and awaiting approval."
        : result.status === "waitlisted"
          ? "Registration submitted to waitlist."
          : "Registration confirmed.";
      const payment =
        result.paymentIntentId && result.registrationId
          ? {
              registrationId: result.registrationId,
              paymentIntentId: result.paymentIntentId,
              amountLabel: formatAmount(selectedEvent.priceCents, selectedEvent.currency),
              checkout: result.checkout ?? null,
            }
          : null;
      setMessage({
        type: "success",
        text: payment ? `${statusText} Pay below to finish.` : statusText,
      });
      setPaymentCheckout(payment);
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
                    {formatEventTime(option.startsAt, timeZone)}
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

          {selectedEvent && selectedEvent.priceCents > 0 && !paymentCheckout ? (
            <Alert color="grape" variant="light">
              Payment required: {formatAmount(selectedEvent.priceCents, selectedEvent.currency)}.
              You&apos;ll pay by card right after registering.
            </Alert>
          ) : null}

          {paymentCheckout ? (
            <RegistrationPaymentStep
              payment={paymentCheckout}
              churchId={churchId}
              onPaid={handlePaid}
              onCancel={cancelUnpaid}
            />
          ) : (
            <>
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
                  // A real checkbox: announced as one, and marked when required
                  // (it was a toggle Button, Council Review 33).
                  return (
                    <Checkbox
                      key={field.id}
                      label={field.label}
                      required={field.isRequired}
                      checked={Boolean(value)}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setFieldValues((prev) => ({ ...prev, [key]: checked }));
                      }}
                    />
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
            </>
          )}
        </Stack>
      </Modal>
    </Paper>
  );
}
