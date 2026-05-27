"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { AlertTriangle, CheckCircle, UserPlus } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { CcmBadgePreview } from "@/components/application/ccm-badge-preview";
import { ccmNavItems } from "@/components/application/ccm-nav";
import { checkinChildAction } from "@/app/app/ccm-actions";
import type { ChurchAppSession } from "@/lib/auth";
import type { CcmCheckinResult, CcmService } from "@/lib/ccm-types";

interface Props {
  session: ChurchAppSession;
  activeService: CcmService | null;
}

export function CcmCheckinKiosk({ session, activeService }: Props) {
  const [childName, setChildName] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [roomId, setRoomId] = useState("");
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [result, setResult] = useState<CcmCheckinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCheckin = () => {
    if (!activeService || !childName.trim() || !roomId.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await checkinChildAction({
          serviceId: activeService.id,
          roomId,
          childName: childName.trim(),
          guardianName: guardianName.trim() || undefined,
          guardianPhone: guardianPhone.trim() || undefined,
          isFirstVisit,
        });
        setResult(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Check-in failed. Please try again.");
      }
    });
  };

  const handleReset = () => {
    setChildName("");
    setGuardianName("");
    setGuardianPhone("");
    setRoomId("");
    setIsFirstVisit(false);
    setResult(null);
    setError(null);
  };

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Children's Ministry"
      title="Check In"
      description={session.appContext.church?.name ?? ""}
      sidebarTitle="Children's Ministry"
      sidebarDescription="Drop-off kiosk"
      navLabel="CCM"
      navItems={ccmNavItems("/app/church-admin/children/checkin")}
    >
      <Stack gap="lg" style={{ maxWidth: 520 }}>
        {!activeService && (
          <Alert color="orange" icon={<AlertTriangle size={16} />}>
            No enabled day check-in session. Open a service and enable its session before checking in children.
          </Alert>
        )}

        {result ? (
          // Success state — show badge preview
          <Stack gap="md">
            <Alert color="teal" icon={<CheckCircle size={16} />} title="Check-in Successful">
              {result.session.childName} is checked in to {result.session.roomName}.
              Print the badges below, then hand the guardian claim check to the guardian.
            </Alert>
            <CcmBadgePreview
              result={result}
              serviceLabel={activeService?.serviceName ?? "Service"}
            />
            <Button variant="outline" onClick={handleReset}>
              Check In Another Child
            </Button>
          </Stack>
        ) : (
          // Check-in form
          <Paper withBorder p="lg" radius="md">
            <Title order={4} mb="md">Child Check-In</Title>
            {error && (
              <Alert color="red" mb="md" icon={<AlertTriangle size={14} />}>
                {error}
              </Alert>
            )}
            <Stack gap="sm">
              <TextInput
                label="Child's Name"
                placeholder="First and last name"
                required
                value={childName}
                onChange={(e) => setChildName(e.currentTarget.value)}
              />
              <TextInput
                label="Guardian Name"
                placeholder="Parent or guardian checking in"
                value={guardianName}
                onChange={(e) => setGuardianName(e.currentTarget.value)}
              />
              <TextInput
                label="Guardian Phone"
                placeholder="For Silent Page notifications"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.currentTarget.value)}
              />
              <TextInput
                label="Room ID"
                placeholder="Room UUID (auto-filled in production from room selector)"
                required
                value={roomId}
                onChange={(e) => setRoomId(e.currentTarget.value)}
                description="In production this will be a room picker based on child age."
              />
              <Group>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={isFirstVisit}
                    onChange={(e) => setIsFirstVisit(e.currentTarget.checked)}
                  />
                  <Text size="sm">First-time visit</Text>
                </label>
                {isFirstVisit && (
                  <Badge color="violet" size="sm" leftSection={<UserPlus size={10} />}>
                    New Family
                  </Badge>
                )}
              </Group>
              <Button
                fullWidth
                color="churchBlue"
                mt="sm"
                disabled={!activeService || !childName.trim() || !roomId.trim() || isPending}
                onClick={handleCheckin}
                leftSection={isPending ? <Loader size={14} /> : undefined}
              >
                {isPending ? "Checking in…" : "Check In & Print Badge"}
              </Button>
            </Stack>
          </Paper>
        )}
      </Stack>
    </ApplicationShell>
  );
}
