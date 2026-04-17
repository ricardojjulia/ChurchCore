"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  AlertTriangle,
  CheckCircle,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { ccmNavItems } from "@/components/application/ccm-nav";
import { checkoutChildAction } from "@/app/app/ccm-actions";
import type { ChurchAppSession } from "@/lib/auth";
import type { CcmCheckinSession, CcmService } from "@/lib/ccm-types";

interface Props {
  session: ChurchAppSession;
  activeService: CcmService | null;
  activeSessions: CcmCheckinSession[];
}

export function CcmCheckoutKiosk({ session, activeService, activeSessions }: Props) {
  const [search, setSearch] = useState("");
  const [selectedSession, setSelectedSession] = useState<CcmCheckinSession | null>(null);
  const [pin, setPin] = useState("");
  const [releasedTo, setReleasedTo] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const checkedIn = activeSessions.filter((s) => s.status === "checked_in");

  const filtered = search.trim()
    ? checkedIn.filter((s) =>
        s.childName.toLowerCase().includes(search.toLowerCase()) ||
        (s.guardianName ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : checkedIn;

  const handleRelease = () => {
    if (!selectedSession || !pin.trim() || !releasedTo.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await checkoutChildAction({
          sessionId: selectedSession.id,
          providedPin: pin.trim(),
          releasedToName: releasedTo.trim(),
        });
        if (res.ok) {
          setSuccess(true);
        } else {
          setError(res.error ?? "Verification failed.");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Release failed.");
      }
    });
  };

  const handleReset = () => {
    setSelectedSession(null);
    setPin("");
    setReleasedTo("");
    setSuccess(false);
    setError(null);
    setSearch("");
  };

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Children's Ministry"
      title="Pick Up"
      description={session.appContext.church?.name ?? ""}
      sidebarTitle="Children's Ministry"
      sidebarDescription="Release station"
      navLabel="CCM"
      navItems={ccmNavItems("/app/church-admin/children/checkout")}
    >
      <Stack gap="lg" style={{ maxWidth: 560 }}>
        {!activeService && (
          <Alert color="orange" icon={<AlertTriangle size={16} />}>
            No active service session.
          </Alert>
        )}

        {success && selectedSession ? (
          <Stack gap="md">
            <Alert color="teal" icon={<CheckCircle size={16} />} title="Child Released">
              {selectedSession.childName} was successfully released to {releasedTo}.
            </Alert>
            <Button variant="outline" onClick={handleReset}>
              Release Another Child
            </Button>
          </Stack>
        ) : selectedSession ? (
          // PIN verification step
          <Paper withBorder p="lg" radius="md">
            <Group mb="md" gap="xs">
              <ShieldCheck size={18} />
              <Title order={4}>Verify & Release</Title>
            </Group>

            {/* Allergy / No-Photo alerts */}
            {selectedSession.noPhotoFlag && (
              <Alert color="red" mb="sm" icon={<ShieldAlert size={14} />}>
                NO PHOTOS — This child&apos;s family has requested no photos be taken.
              </Alert>
            )}
            {selectedSession.criticalAllergies.length > 0 && (
              <Alert color="red" mb="sm" icon={<AlertTriangle size={14} />}>
                ALLERGY ALERT: {selectedSession.criticalAllergies.join(", ")}
              </Alert>
            )}

            <Paper withBorder p="sm" radius="sm" mb="md" bg="gray.0">
              <Text fw={600}>{selectedSession.childName}</Text>
              <Text size="sm" c="dimmed">{selectedSession.currentRoomName ?? selectedSession.roomName}</Text>
              {selectedSession.guardianName && (
                <Text size="xs" c="dimmed">Checked in by: {selectedSession.guardianName}</Text>
              )}
            </Paper>

            {error && (
              <Alert color="red" mb="md" icon={<AlertTriangle size={14} />}>
                {error}
              </Alert>
            )}

            <Stack gap="sm">
              <TextInput
                label="Security PIN or QR Scan"
                placeholder="6-character PIN from badge"
                value={pin}
                onChange={(e) => setPin(e.currentTarget.value.toUpperCase())}
                maxLength={36}
                styles={{ input: { fontFamily: "monospace", letterSpacing: 4, fontSize: 18 } }}
              />
              <TextInput
                label="Released To"
                placeholder="Name of person picking up child"
                required
                value={releasedTo}
                onChange={(e) => setReleasedTo(e.currentTarget.value)}
              />
              <Group mt="xs">
                <Button
                  flex={1}
                  color="churchBlue"
                  disabled={!pin.trim() || !releasedTo.trim() || isPending}
                  onClick={handleRelease}
                  leftSection={isPending ? <Loader size={14} /> : <ShieldCheck size={14} />}
                >
                  {isPending ? "Verifying…" : "Confirm Release"}
                </Button>
                <Button variant="outline" onClick={() => setSelectedSession(null)}>
                  Cancel
                </Button>
              </Group>
            </Stack>
          </Paper>
        ) : (
          // Child search step
          <Paper withBorder p="lg" radius="md">
            <Title order={4} mb="md">Find Child</Title>
            <TextInput
              placeholder="Search by child or guardian name…"
              leftSection={<Search size={14} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              mb="md"
            />
            {checkedIn.length === 0 ? (
              <Text size="sm" c="dimmed">No children currently checked in.</Text>
            ) : filtered.length === 0 ? (
              <Text size="sm" c="dimmed">No matches for &ldquo;{search}&rdquo;.</Text>
            ) : (
              <Stack gap="xs">
                {filtered.map((s) => (
                  <Card
                    key={s.id}
                    withBorder
                    padding="sm"
                    radius="sm"
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelectedSession(s)}
                  >
                    <Group justify="space-between">
                      <div>
                        <Text fw={600} size="sm">{s.childName}</Text>
                        <Text size="xs" c="dimmed">
                          {s.currentRoomName ?? s.roomName}
                          {s.guardianName ? ` · ${s.guardianName}` : ""}
                        </Text>
                      </div>
                      <Group gap="xs">
                        {s.noPhotoFlag && (
                          <Badge color="red" size="xs" variant="filled">No Photos</Badge>
                        )}
                        {s.criticalAllergies.length > 0 && (
                          <Badge color="red" size="xs">
                            {s.criticalAllergies[0]}
                            {s.criticalAllergies.length > 1 ? ` +${s.criticalAllergies.length - 1}` : ""}
                          </Badge>
                        )}
                        {s.isFirstVisit && (
                          <Badge color="violet" size="xs">New</Badge>
                        )}
                      </Group>
                    </Group>
                  </Card>
                ))}
              </Stack>
            )}
          </Paper>
        )}
      </Stack>
    </ApplicationShell>
  );
}
