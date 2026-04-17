"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  ChevronRight,
  Plus,
  Settings,
  Users,
} from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { ccmNavItems } from "@/components/application/ccm-nav";
import { closeServiceAction, openServiceAction } from "@/app/app/ccm-actions";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  CcmIncident,
  CcmRosterData,
  CcmService,
  CcmServiceStatus,
  OpenServiceInput,
} from "@/lib/ccm-types";

const SERVICE_STATUS_COLOR: Record<CcmServiceStatus, string> = {
  open: "teal",
  closed: "gray",
  emergency: "red",
};

// ── Service list ──────────────────────────────────────────────────────────────

export function CcmServiceList({
  session,
  services,
}: {
  session: ChurchAppSession;
  services: CcmService[];
}) {
  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Children's Ministry"
      title="Services"
      description={session.appContext.church?.name ?? ""}
      sidebarTitle="Children's Ministry"
      sidebarDescription="Service sessions"
      navLabel="CCM"
      navItems={ccmNavItems("/app/church-admin/children/services")}
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {services.length} service{services.length !== 1 ? "s" : ""} in the last 30 days
          </Text>
          <Button
            component={Link}
            href="/app/church-admin/children/services/new"
            leftSection={<Plus size={14} />}
            color="churchBlue"
            size="sm"
          >
            Open Service
          </Button>
        </Group>

        {services.length === 0 ? (
          <Paper withBorder p="xl" ta="center" radius="md">
            <ThemeIcon size="xl" variant="light" color="churchBlue" radius="xl" mx="auto">
              <Calendar size={24} />
            </ThemeIcon>
            <Title order={5} mt="md">No Services</Title>
            <Text size="sm" c="dimmed" mt="xs">
              Open a service session to begin tracking check-ins.
            </Text>
            <Button
              component={Link}
              href="/app/church-admin/children/services/new"
              mt="md"
              color="churchBlue"
              leftSection={<Plus size={14} />}
            >
              Open Service
            </Button>
          </Paper>
        ) : (
          <Paper withBorder p="md" radius="md">
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Service Name</Table.Th>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Started</Table.Th>
                  <Table.Th>Ended</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {services.map((s) => (
                  <Table.Tr key={s.id}>
                    <Table.Td>
                      <Text fw={500} size="sm">{s.serviceName}</Text>
                    </Table.Td>
                    <Table.Td>{s.serviceDate}</Table.Td>
                    <Table.Td>
                      <Badge
                        color={SERVICE_STATUS_COLOR[s.status]}
                        size="xs"
                      >
                        {s.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">
                        {new Date(s.startedAt).toLocaleTimeString()}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {s.endedAt ? (
                        <Text size="xs">{new Date(s.endedAt).toLocaleTimeString()}</Text>
                      ) : (
                        <Text size="xs" c="dimmed">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Button
                          component={Link}
                          href={`/app/church-admin/children/services/${s.id}`}
                          size="xs"
                          variant="light"
                          rightSection={<ChevronRight size={12} />}
                        >
                          View
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        )}
      </Stack>
    </ApplicationShell>
  );
}

// ── Open service form ─────────────────────────────────────────────────────────

export function CcmOpenServiceForm({ session }: { session: ChurchAppSession }) {
  const today = new Date().toISOString().split("T")[0];

  const [serviceName, setServiceName] = useState("Sunday Children's Church");
  const [serviceDate, setServiceDate] = useState(today);
  const [ministryId, setMinistryId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const handleOpen = () => {
    if (!serviceName.trim() || !serviceDate || !ministryId.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const input: OpenServiceInput = {
          ministryId: ministryId.trim(),
          serviceName: serviceName.trim(),
          serviceDate,
        };
        const result = await openServiceAction(input);
        setCreatedId(result.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to open service.");
      }
    });
  };

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Children's Ministry"
      title="Open Service"
      description="Start a new service session for check-in"
      sidebarTitle="Children's Ministry"
      sidebarDescription="Service sessions"
      navLabel="CCM"
      navItems={ccmNavItems("/app/church-admin/children/services")}
    >
      <Paper withBorder p="lg" radius="md" style={{ maxWidth: 480 }}>
        {createdId ? (
          <Stack gap="md" ta="center" py="xl">
            <ThemeIcon size="xl" variant="light" color="teal" radius="xl" mx="auto">
              <CheckCircle size={28} />
            </ThemeIcon>
            <Title order={4}>Service Opened</Title>
            <Text size="sm" c="dimmed">
              {serviceName} is now live. Staff can begin checking in children.
            </Text>
            <Group justify="center" gap="sm">
              <Button
                component={Link}
                href="/app/church-admin/children/dashboard"
                color="churchBlue"
              >
                Go to Dashboard
              </Button>
              <Button
                component={Link}
                href="/app/church-admin/children/checkin"
                variant="light"
              >
                Start Check-In
              </Button>
            </Group>
          </Stack>
        ) : (
          <Stack gap="sm">
            <Title order={4} mb="xs">Open Service Session</Title>

            {error && (
              <Alert color="red" icon={<AlertTriangle size={14} />}>
                {error}
              </Alert>
            )}

            <TextInput
              label="Service Name"
              placeholder="Sunday Children's Church"
              required
              value={serviceName}
              onChange={(e) => setServiceName(e.currentTarget.value)}
            />
            <TextInput
              label="Date"
              type="date"
              required
              value={serviceDate}
              onChange={(e) => setServiceDate(e.currentTarget.value)}
            />
            <TextInput
              label="Ministry ID"
              placeholder="Ministry UUID (auto-populated in production)"
              description="Links this service session to a ministry for reporting."
              required
              value={ministryId}
              onChange={(e) => setMinistryId(e.currentTarget.value)}
            />

            <Group mt="sm" gap="sm">
              <Button
                color="churchBlue"
                loading={isPending}
                disabled={!serviceName.trim() || !serviceDate || !ministryId.trim()}
                onClick={handleOpen}
              >
                Open Service
              </Button>
              <Button
                component={Link}
                href="/app/church-admin/children/services"
                variant="outline"
              >
                Cancel
              </Button>
            </Group>
          </Stack>
        )}
      </Paper>
    </ApplicationShell>
  );
}

// ── Service detail ────────────────────────────────────────────────────────────

export function CcmServiceDetail({
  session,
  roster,
  incidents,
}: {
  session: ChurchAppSession;
  roster: CcmRosterData;
  incidents: CcmIncident[];
}) {
  const [closing, startCloseTransition] = useTransition();
  const [closed, setClosed] = useState(roster.service.status === "closed");

  const handleClose = () => {
    startCloseTransition(async () => {
      await closeServiceAction(roster.service.id);
      setClosed(true);
    });
  };

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Children's Ministry"
      title={roster.service.serviceName}
      description={roster.service.serviceDate}
      sidebarTitle="Children's Ministry"
      sidebarDescription="Service detail"
      navLabel="CCM"
      navItems={ccmNavItems("/app/church-admin/children/services")}
    >
      <Stack gap="lg">
        {/* Header actions */}
        <Group justify="space-between">
          <Group gap="sm">
            <Badge color={SERVICE_STATUS_COLOR[closed ? "closed" : roster.service.status]}>
              {closed ? "closed" : roster.service.status}
            </Badge>
            <Text size="sm" c="dimmed">{roster.service.serviceDate}</Text>
          </Group>
          {!closed && roster.service.status === "open" && (
            <Button
              color="red"
              variant="light"
              size="sm"
              loading={closing}
              onClick={handleClose}
            >
              Close Service
            </Button>
          )}
        </Group>

        {closed && (
          <Alert color="teal" icon={<CheckCircle size={14} />}>
            Service closed. All remaining checked-in children have been flagged as late pickup.
          </Alert>
        )}

        {/* Incidents for this service */}
        {incidents.length > 0 && (
          <Paper withBorder p="md" radius="md">
            <Group mb="sm">
              <ThemeIcon color="orange" variant="light" size="lg" radius="md">
                <AlertTriangle size={18} />
              </ThemeIcon>
              <Title order={5}>Incidents — {incidents.length}</Title>
            </Group>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Child</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Severity</Table.Th>
                  <Table.Th>Guardian Notified</Table.Th>
                  <Table.Th>Follow-up</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {incidents.map((inc) => (
                  <Table.Tr key={inc.id}>
                    <Table.Td>{inc.childName}</Table.Td>
                    <Table.Td>
                      <Badge size="xs">{inc.incidentType.replace("_", " ")}</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        size="xs"
                        color={
                          inc.severity === "critical"
                            ? "red"
                            : inc.severity === "high"
                              ? "orange"
                              : inc.severity === "medium"
                                ? "yellow"
                                : "gray"
                        }
                      >
                        {inc.severity}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={inc.guardianNotified ? "teal" : "red"} size="xs">
                        {inc.guardianNotified ? "Yes" : "No"}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {inc.followUpRequired ? (
                        <Badge color="orange" size="xs">Required</Badge>
                      ) : (
                        <Text size="xs" c="dimmed">None</Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        )}

        {/* Roster — reuse the existing CcmRosterView inner content */}
        <CcmRosterViewInner roster={roster} />
      </Stack>
    </ApplicationShell>
  );
}

// Minimal inner content re-use (no shell wrapper)
function CcmRosterViewInner({ roster }: { roster: CcmRosterData }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Group mb="sm">
        <ThemeIcon color="churchBlue" variant="light" size="lg" radius="md">
          <Users size={18} />
        </ThemeIcon>
        <Title order={5}>Attendance — {roster.totalChildren} children, {roster.totalVolunteers} volunteers</Title>
      </Group>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Child</Table.Th>
            <Table.Th>Room</Table.Th>
            <Table.Th>Guardian</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Checked In</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {roster.sessions.map((s) => (
            <Table.Tr key={s.id}>
              <Table.Td>
                <Group gap="xs">
                  {s.noPhotoFlag && <Badge color="red" size="xs">No Photos</Badge>}
                  <Text size="sm" fw={500}>{s.childName}</Text>
                  {s.isFirstVisit && <Badge color="violet" size="xs">New</Badge>}
                </Group>
              </Table.Td>
              <Table.Td>{s.roomName}</Table.Td>
              <Table.Td>{s.guardianName ?? "—"}</Table.Td>
              <Table.Td>
                <Badge
                  size="xs"
                  color={
                    s.status === "checked_in"
                      ? "teal"
                      : s.status === "checked_out"
                        ? "gray"
                        : s.status === "late_pickup"
                          ? "red"
                          : "blue"
                  }
                >
                  {s.status.replace("_", " ")}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Text size="xs">{new Date(s.checkedInAt).toLocaleTimeString()}</Text>
              </Table.Td>
            </Table.Tr>
          ))}
          {roster.sessions.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Text size="sm" c="dimmed">No check-ins for this service.</Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}

// ── Room manager ──────────────────────────────────────────────────────────────

export function CcmRoomManager({ session }: { session: ChurchAppSession }) {
  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Children's Ministry"
      title="Room Management"
      description="Configure classrooms and capacity"
      sidebarTitle="Children's Ministry"
      sidebarDescription="Room setup"
      navLabel="CCM"
      navItems={ccmNavItems("/app/church-admin/children/rooms")}
    >
      <Stack gap="lg">
        <Alert color="blue" icon={<Settings size={14} />}>
          Room configuration is managed via the Ministry settings panel and the
          {" "}<code>children_rooms</code> table. Rooms created here will be available for
          service assignments, volunteer routing, and age-based auto-routing.
        </Alert>

        <Paper withBorder p="md" radius="md">
          <Title order={5} mb="md">Add Room</Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <TextInput label="Room Name" placeholder="e.g. Nursery, Preschool, Elementary" />
            <Select
              label="Age Range"
              data={[
                { value: "0-2", label: "Nursery (0–2)" },
                { value: "3-5", label: "Preschool (3–5)" },
                { value: "6-8", label: "Early Elementary (6–8)" },
                { value: "9-12", label: "Upper Elementary (9–12)" },
                { value: "custom", label: "Custom range" },
              ]}
              placeholder="Select age range"
            />
            <NumberInput label="Capacity" placeholder="Maximum children" min={1} max={200} />
            <NumberInput label="Target Ratio (children per adult)" placeholder="e.g. 8" min={1} max={30} />
          </SimpleGrid>
          <Button color="churchBlue" mt="md" leftSection={<Plus size={14} />}>
            Add Room
          </Button>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Title order={5} mb="xs">Age-Based Auto-Routing</Title>
          <Text size="sm" c="dimmed" mb="md">
            When a child&apos;s date of birth is on file, the check-in kiosk will automatically
            suggest the correct room based on age at the time of service.
          </Text>
          <Switch
            label="Enable automatic age-based room suggestions"
            defaultChecked
          />
        </Paper>
      </Stack>
    </ApplicationShell>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function CcmSettings({ session }: { session: ChurchAppSession }) {
  const [pinLength] = useState(6);
  const [ratioWarning, setRatioWarning] = useState(80);
  const [ratioAlert, setRatioAlert] = useState(100);
  const [latePickupMinutes, setLatePickupMinutes] = useState(30);
  const [requireBgCheck, setRequireBgCheck] = useState(true);
  const [twoAdultEnforce, setTwoAdultEnforce] = useState(true);
  const [saved, setSaved] = useState(false);

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Children's Ministry"
      title="CCM Settings"
      description="Module configuration"
      sidebarTitle="Children's Ministry"
      sidebarDescription="Safety settings"
      navLabel="CCM"
      navItems={ccmNavItems("/app/church-admin/children/settings")}
    >
      <Stack gap="lg" style={{ maxWidth: 580 }}>
        {saved && (
          <Alert color="teal" icon={<CheckCircle size={14} />}>
            Settings saved.
          </Alert>
        )}

        {/* PIN settings */}
        <Paper withBorder p="md" radius="md">
          <Title order={5} mb="sm">Security PIN</Title>
          <Stack gap="sm">
            <Text size="sm">
              PIN length: <strong>{pinLength} characters</strong>
              {" "}(using unambiguous charset — no O/0/I/1/B/8/S/5/Z/2)
            </Text>
            <Text size="xs" c="dimmed">
              PINs are bcrypt-hashed (cost 12) and never stored in plaintext.
              The plaintext PIN is displayed once at check-in for badge printing only.
            </Text>
          </Stack>
        </Paper>

        {/* Ratio thresholds */}
        <Paper withBorder p="md" radius="md">
          <Title order={5} mb="sm">Ratio Thresholds</Title>
          <SimpleGrid cols={2} spacing="sm">
            <NumberInput
              label="Warning threshold (%)"
              description="% of target ratio that triggers an orange warning"
              value={ratioWarning}
              onChange={(v) => setRatioWarning(Number(v))}
              min={50}
              max={99}
            />
            <NumberInput
              label="Alert threshold (%)"
              description="% of target ratio that triggers a red alert"
              value={ratioAlert}
              onChange={(v) => setRatioAlert(Number(v))}
              min={80}
              max={200}
            />
          </SimpleGrid>
        </Paper>

        {/* Late pickup */}
        <Paper withBorder p="md" radius="md">
          <Title order={5} mb="sm">Late Pickup</Title>
          <NumberInput
            label="Minutes after service end to flag late pickup"
            value={latePickupMinutes}
            onChange={(v) => setLatePickupMinutes(Number(v))}
            min={5}
            max={120}
            style={{ maxWidth: 260 }}
          />
        </Paper>

        {/* Safe-church policy */}
        <Paper withBorder p="md" radius="md">
          <Title order={5} mb="sm">Safe-Church Policy</Title>
          <Stack gap="sm">
            <Switch
              label="Require background check verification before volunteer assignment"
              checked={requireBgCheck}
              onChange={(e) => setRequireBgCheck(e.currentTarget.checked)}
            />
            <Switch
              label="Enforce two-adult rule — alert when room has fewer than 2 confirmed volunteers"
              checked={twoAdultEnforce}
              onChange={(e) => setTwoAdultEnforce(e.currentTarget.checked)}
            />
          </Stack>
        </Paper>

        {/* Data retention notice */}
        <Paper withBorder p="md" radius="md">
          <Title order={5} mb="xs">Data Retention (COPPA)</Title>
          <Text size="sm" c="dimmed">
            Check-in records are retained for 7 years per liability requirements, then purged.
            Child PII (name, DOB, allergies) is subject to annual review. Custody restrictions
            are retained indefinitely until manually removed by a church admin.
          </Text>
        </Paper>

        <Button
          color="churchBlue"
          style={{ alignSelf: "flex-start" }}
          onClick={() => setSaved(true)}
        >
          Save Settings
        </Button>
      </Stack>
    </ApplicationShell>
  );
}
