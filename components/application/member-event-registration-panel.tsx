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
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import {
  cancelUnpaidMemberRegistrationAction,
  memberRegisterForEventAction,
} from "@/app/app/member-actions";
import {
  RegistrationPaymentStep,
  type RegistrationPaymentState,
} from "@/components/portal/registration-payment-step";
import type { MemberPortalFamilyMember } from "@/lib/member-portal-data";
import type {
  MemberEventRegistrationField,
  MemberEventRegistrationOption,
} from "@/lib/member-event-registration-data";

type Props = {
  churchId: string;
  options: MemberEventRegistrationOption[];
  familyMembers: MemberPortalFamilyMember[];
};

function getStatusLabel(status: MemberEventRegistrationOption["memberRegistrationStatus"]) {
  if (status === "pending_approval") return "pending approval";
  if (status === "waitlisted") return "waitlisted";
  if (status === "attended") return "attended";
  if (status === "confirmed") return "registered";
  return null;
}

export function MemberEventRegistrationPanel({ churchId, options, familyMembers }: Props) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [targetProfileId, setTargetProfileId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string | number | boolean>>({});
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [paymentCheckout, setPaymentCheckout] = useState<RegistrationPaymentState | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedEvent = useMemo(
    () => options.find((option) => option.eventId === selectedEventId) ?? null,
    [options, selectedEventId],
  );

  function openRegistration(option: MemberEventRegistrationOption) {
    setSelectedEventId(option.eventId);
    setNotes("");
    setFieldValues({});
    setMessage(null);
    setPaymentCheckout(null);
    setTargetProfileId(option.householdRegistrationEnabled ? familyMembers[0]?.id ?? null : null);
  }

  function closeModal() {
    // Leaving without paying cancels the unpaid registration, freeing its
    // place (G3.0c). Best effort: a failure leaves it unpaid for the church.
    if (paymentCheckout) {
      void cancelUnpaidMemberRegistrationAction(paymentCheckout.registrationId, paymentCheckout.paymentIntentId).catch(
        () => undefined,
      );
    }
    setSelectedEventId(null);
    setNotes("");
    setFieldValues({});
    setMessage(null);
    setPaymentCheckout(null);
    setTargetProfileId(null);
  }

  function formatAmount(cents: number, currency: string) {
    return (cents / 100).toLocaleString(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    });
  }

  function isFieldValid(field: MemberEventRegistrationField) {
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
      const result = await cancelUnpaidMemberRegistrationAction(registrationId, paymentIntentId);
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

      const result = await memberRegisterForEventAction({
        eventId: selectedEvent.eventId,
        targetProfileId: targetProfileId ?? undefined,
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
        setMessage({ type: "success", text: "This person is already registered for this event." });
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
        <Title order={3} size="h4">Event registration</Title>
        <Text size="sm" c="dimmed">Member self-service registrations</Text>
      </Group>

      <Stack gap="sm">
        {options.length === 0 ? (
          <Text size="sm" c="dimmed">No open registrations are available right now.</Text>
        ) : (
          options.map((option) => {
            const statusLabel = getStatusLabel(option.memberRegistrationStatus);
            return (
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
                      {statusLabel ? (
                        <Badge variant="light" color="indigo">{statusLabel}</Badge>
                      ) : null}
                    </Group>
                  </Stack>

                  <Button
                    size="xs"
                    onClick={() => openRegistration(option)}
                    disabled={Boolean(option.memberRegistrationStatus)}
                  >
                    {option.memberRegistrationStatus ? "Registered" : "Register"}
                  </Button>
                </Group>
              </Paper>
            );
          })
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
              {selectedEvent?.householdRegistrationEnabled && familyMembers.length > 1 ? (
                <Select
                  label="Register household member"
                  data={familyMembers.map((member) => ({ value: member.id, label: member.fullName }))}
                  value={targetProfileId}
                  onChange={setTargetProfileId}
                />
              ) : null}

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
                    <Switch
                      key={field.id}
                      label={field.label}
                      checked={Boolean(value)}
                      onChange={(event) =>
                        setFieldValues((prev) => ({ ...prev, [key]: event.currentTarget.checked }))
                      }
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
