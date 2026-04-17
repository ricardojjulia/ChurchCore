"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { AlertTriangle, ShieldAlert, ShieldCheck, Users } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { ccmNavItems } from "@/components/application/ccm-nav";
import { assignVolunteerAction } from "@/app/app/ccm-actions";
import type { ChurchAppSession } from "@/lib/auth";
import type { CcmService, CcmVolunteerAssignment, VolunteerRole } from "@/lib/ccm-types";

const ROLE_LABELS: Record<VolunteerRole, string> = {
  lead_teacher: "Lead Teacher",
  assistant: "Assistant",
  floater: "Floater",
  security: "Security",
  greeter: "Greeter",
};

export function CcmVolunteerPanel({
  session,
  services,
  activeService,
}: {
  session: ChurchAppSession;
  services: CcmService[];
  activeService: CcmService | null;
}) {
  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    activeService?.id ?? services[0]?.id ?? "",
  );
  const [profileId, setProfileId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [role, setRole] = useState<VolunteerRole>("assistant");
  const [bgVerified, setBgVerified] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // In production these come from a real volunteer list; here we track locally
  const [assignments, setAssignments] = useState<CcmVolunteerAssignment[]>([]);

  const handleAssign = () => {
    if (!selectedServiceId || !profileId.trim() || !roomId.trim()) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await assignVolunteerAction({
          serviceId: selectedServiceId,
          roomId: roomId.trim(),
          profileId: profileId.trim(),
          role,
          backgroundCheckVerified: bgVerified,
        });
        // Optimistic: add a placeholder row
        setAssignments((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            serviceId: selectedServiceId,
            roomId: roomId.trim(),
            roomName: roomId.trim(),
            profileId: profileId.trim(),
            volunteerName: profileId.trim(),
            role,
            checkedInAt: null,
            checkedOutAt: null,
            backgroundCheckVerified: bgVerified,
            clearanceDate: null,
            clearanceExpiringSoon: false,
          } satisfies CcmVolunteerAssignment,
        ]);
        setProfileId("");
        setRoomId("");
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Assignment failed.");
      }
    });
  };

  const expiringSoon = assignments.filter((a) => a.clearanceExpiringSoon);
  const noBackgroundCheck = assignments.filter((a) => !a.backgroundCheckVerified);

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Children's Ministry"
      title="Volunteers"
      description={session.appContext.church?.name ?? ""}
      sidebarTitle="Children's Ministry"
      sidebarDescription="Volunteer assignments"
      navLabel="CCM"
      navItems={ccmNavItems("/app/church-admin/children/volunteers")}
    >
      <Stack gap="lg">
        {/* Service selector */}
        <Select
          label="Service"
          data={services.map((s) => ({
            value: s.id,
            label: `${s.serviceName} — ${s.serviceDate} (${s.status})`,
          }))}
          value={selectedServiceId}
          onChange={(v) => setSelectedServiceId(v ?? "")}
          style={{ maxWidth: 420 }}
        />

        {/* Background check warnings */}
        {noBackgroundCheck.length > 0 && (
          <Alert color="red" icon={<ShieldAlert size={16} />} title="Background Check Missing">
            {noBackgroundCheck.length} volunteer{noBackgroundCheck.length !== 1 ? "s" : ""} in this
            session do not have a verified background check on file. Confirm clearance before service.
          </Alert>
        )}
        {expiringSoon.length > 0 && (
          <Alert color="orange" icon={<AlertTriangle size={16} />} title="Background Check Expiring">
            {expiringSoon.length} volunteer{expiringSoon.length !== 1 ? "s" : ""}{" "}
            {expiringSoon.length === 1 ? "has" : "have"} a background check expiring within 30 days.
          </Alert>
        )}

        {/* Volunteer table */}
        <Paper withBorder p="md" radius="md">
          <Group mb="sm">
            <ThemeIcon color="churchBlue" variant="light" size="lg" radius="md">
              <Users size={18} />
            </ThemeIcon>
            <Title order={5}>Volunteer Assignments</Title>
          </Group>

          {assignments.length === 0 ? (
            <Text size="sm" c="dimmed">
              No volunteers assigned to this service yet.
            </Text>
          ) : (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Volunteer</Table.Th>
                  <Table.Th>Room</Table.Th>
                  <Table.Th>Role</Table.Th>
                  <Table.Th>Background Check</Table.Th>
                  <Table.Th>Clearance Expiry</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {assignments.map((v) => (
                  <Table.Tr key={v.id}>
                    <Table.Td>
                      <Text size="sm" fw={500}>{v.volunteerName}</Text>
                    </Table.Td>
                    <Table.Td>{v.roomName}</Table.Td>
                    <Table.Td>
                      <Badge size="xs" variant="light">
                        {ROLE_LABELS[v.role]}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {v.backgroundCheckVerified ? (
                        <Badge color="teal" size="xs" leftSection={<ShieldCheck size={10} />}>
                          Verified
                        </Badge>
                      ) : (
                        <Badge color="red" size="xs" leftSection={<ShieldAlert size={10} />}>
                          Not Verified
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {v.clearanceDate ? (
                        <Text size="xs" c={v.clearanceExpiringSoon ? "orange" : "dimmed"}>
                          {v.clearanceDate}
                          {v.clearanceExpiringSoon && " ⚠"}
                        </Text>
                      ) : (
                        <Text size="xs" c="dimmed">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {v.checkedInAt ? (
                        <Badge color="teal" size="xs">Checked In</Badge>
                      ) : (
                        <Badge color="gray" size="xs">Assigned</Badge>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Paper>

        {/* Assign volunteer form */}
        <Paper withBorder p="md" radius="md">
          <Title order={5} mb="sm">Assign Volunteer</Title>

          {saved && (
            <Alert color="teal" mb="sm" icon={<ShieldCheck size={14} />}>
              Volunteer assigned successfully.
            </Alert>
          )}
          {error && (
            <Alert color="red" mb="sm" icon={<AlertTriangle size={14} />}>
              {error}
            </Alert>
          )}

          <Stack gap="sm">
            <Group gap="sm" grow>
              <TextInput
                label="Profile ID (UUID)"
                placeholder="Volunteer's profile UUID"
                description="In production this will be a people picker."
                value={profileId}
                onChange={(e) => setProfileId(e.currentTarget.value)}
                required
              />
              <TextInput
                label="Room ID (UUID)"
                placeholder="Room UUID to assign"
                value={roomId}
                onChange={(e) => setRoomId(e.currentTarget.value)}
                required
              />
            </Group>
            <Group gap="sm" align="flex-end">
              <Select
                label="Role"
                data={[
                  { value: "lead_teacher", label: "Lead Teacher" },
                  { value: "assistant", label: "Assistant" },
                  { value: "floater", label: "Floater" },
                  { value: "security", label: "Security" },
                  { value: "greeter", label: "Greeter" },
                ]}
                value={role}
                onChange={(v) => setRole((v as VolunteerRole) ?? "assistant")}
                style={{ width: 180 }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", paddingBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={bgVerified}
                  onChange={(e) => setBgVerified(e.currentTarget.checked)}
                />
                <Text size="sm">Background check verified</Text>
              </label>
              <Button
                color="churchBlue"
                loading={isPending}
                disabled={!selectedServiceId || !profileId.trim() || !roomId.trim()}
                onClick={handleAssign}
                style={{ marginBottom: 2 }}
              >
                Assign
              </Button>
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </ApplicationShell>
  );
}
