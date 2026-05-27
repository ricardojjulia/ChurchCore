"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";

import {
  submitPublicChildCheckinAction,
  submitPublicChildCheckoutAction,
} from "@/app/portal/children/actions";
import type {
  PublicCcmCheckoutSessionOption,
  PublicCcmRoomOption,
  PublicCcmSessionMode,
} from "@/lib/ccm-public-data";

export function ChildrenSessionActions({
  mode,
  token,
  rooms,
  checkoutSessions,
}: {
  mode: PublicCcmSessionMode;
  token: string;
  rooms: PublicCcmRoomOption[];
  checkoutSessions: PublicCcmCheckoutSessionOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [childName, setChildName] = useState("");
  const [checkinGuardianName, setCheckinGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [roomId, setRoomId] = useState<string | null>(rooms[0]?.id ?? null);
  const [isFirstVisit, setIsFirstVisit] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(checkoutSessions[0]?.id ?? null);
  const [providedPin, setProvidedPin] = useState("");
  const [releasedToName, setReleasedToName] = useState("");
  const [checkoutGuardianName, setCheckoutGuardianName] = useState("");
  const [verificationMethod, setVerificationMethod] = useState<"pin_or_qr" | "pickup_code">(
    "pin_or_qr",
  );

  const roomOptions = useMemo(
    () => rooms.map((room) => ({ value: room.id, label: room.name })),
    [rooms],
  );

  const sessionOptions = useMemo(
    () =>
      checkoutSessions.map((session) => ({
        value: session.id,
        label: `${session.childName} (${new Date(session.checkedInAt).toLocaleTimeString()})`,
      })),
    [checkoutSessions],
  );

  const submitCheckin = () => {
    if (!roomId || !childName.trim()) {
      setError("Child name and room are required.");
      return;
    }

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await submitPublicChildCheckinAction({
        token,
        roomId,
        childName,
        guardianName: checkinGuardianName,
        guardianPhone,
        isFirstVisit,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSuccess(`${result.childName} checked in. Claim PIN: ${result.pin}`);
      setChildName("");
      setCheckinGuardianName("");
      setGuardianPhone("");
      setIsFirstVisit(false);
    });
  };

  const submitCheckout = () => {
    if (!sessionId || !providedPin.trim() || !releasedToName.trim() || !checkoutGuardianName.trim()) {
      setError("Select a child session and provide claim token, guardian name, and release name.");
      return;
    }

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await submitPublicChildCheckoutAction({
        token,
        sessionId,
        providedPin,
        releasedToName,
        guardianName: checkoutGuardianName,
        verificationMethod,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSuccess(`${result.childName} has been checked out.`);
      setProvidedPin("");
      setReleasedToName("");
      setCheckoutGuardianName("");
    });
  };

  return (
    <Stack gap="sm">
      {error ? <Alert color="red">{error}</Alert> : null}
      {success ? <Alert color="teal">{success}</Alert> : null}

      {mode === "checkin" ? (
        <>
          <Select
            label="Room"
            data={roomOptions}
            value={roomId}
            onChange={setRoomId}
            searchable
            nothingFoundMessage="No rooms available"
            disabled={isPending || roomOptions.length === 0}
            required
          />
          <TextInput
            label="Child full name"
            value={childName}
            onChange={(event) => setChildName(event.currentTarget.value)}
            required
          />
          <TextInput
            label="Guardian name"
            value={checkinGuardianName}
            onChange={(event) => setCheckinGuardianName(event.currentTarget.value)}
          />
          <TextInput
            label="Guardian phone"
            value={guardianPhone}
            onChange={(event) => setGuardianPhone(event.currentTarget.value)}
          />
          <Checkbox
            label="First-time visit"
            checked={isFirstVisit}
            onChange={(event) => setIsFirstVisit(event.currentTarget.checked)}
          />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              PIN is shown once for guardian claim verification.
            </Text>
            <Button
              onClick={submitCheckin}
              loading={isPending}
              disabled={roomOptions.length === 0}
            >
              Submit check-in
            </Button>
          </Group>
        </>
      ) : (
        <>
          <Select
            label="Child currently checked in"
            data={sessionOptions}
            value={sessionId}
            onChange={setSessionId}
            searchable
            nothingFoundMessage="No active check-in sessions"
            disabled={isPending || sessionOptions.length === 0}
            required
          />
          <TextInput
            label={verificationMethod === "pickup_code" ? "Pickup code" : "Claim PIN or QR token"}
            value={providedPin}
            onChange={(event) => setProvidedPin(event.currentTarget.value)}
            required
          />
          <Select
            label="Verification method"
            value={verificationMethod}
            onChange={(value) =>
              setVerificationMethod(value === "pickup_code" ? "pickup_code" : "pin_or_qr")
            }
            data={[
              { value: "pin_or_qr", label: "PIN or QR token" },
              { value: "pickup_code", label: "Pickup code" },
            ]}
            required
          />
          <TextInput
            label="Guardian verification name"
            value={checkoutGuardianName}
            onChange={(event) => setCheckoutGuardianName(event.currentTarget.value)}
            required
          />
          <TextInput
            label="Released to"
            value={releasedToName}
            onChange={(event) => setReleasedToName(event.currentTarget.value)}
            required
          />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Checkout verifies PIN/QR or pickup code and confirms the active guardian name.
            </Text>
            <Button
              onClick={submitCheckout}
              loading={isPending}
              disabled={sessionOptions.length === 0}
            >
              Submit checkout
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}
