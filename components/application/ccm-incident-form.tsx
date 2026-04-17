"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { AlertTriangle, CheckCircle, FileText, Plus } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { ccmNavItems } from "@/components/application/ccm-nav";
import { fileIncidentAction } from "@/app/app/ccm-actions";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  CcmIncident,
  CcmService,
  FileIncidentInput,
  IncidentSeverity,
  IncidentType,
} from "@/lib/ccm-types";

const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
  critical: "red",
  high: "orange",
  medium: "yellow",
  low: "gray",
};

const TYPE_LABELS: Record<IncidentType, string> = {
  medical: "Medical",
  behavioral: "Behavioral",
  security: "Security",
  property: "Property Damage",
  near_miss: "Near Miss",
  other: "Other",
};

// ── Incident list ─────────────────────────────────────────────────────────────

export function CcmIncidentList({
  session,
  incidents,
}: {
  session: ChurchAppSession;
  incidents: CcmIncident[];
}) {
  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Children's Ministry"
      title="Incident Reports"
      description={session.appContext.church?.name ?? ""}
      sidebarTitle="Children's Ministry"
      sidebarDescription="Safety incident log"
      navLabel="CCM"
      navItems={ccmNavItems("/app/church-admin/children/incidents")}
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {incidents.length} incident{incidents.length !== 1 ? "s" : ""} on record
          </Text>
          <Button
            component={Link}
            href="/app/church-admin/children/incidents/new"
            leftSection={<Plus size={14} />}
            color="churchBlue"
            size="sm"
          >
            File Incident
          </Button>
        </Group>

        {incidents.length === 0 ? (
          <Paper withBorder p="xl" ta="center" radius="md">
            <ThemeIcon size="xl" variant="light" color="teal" radius="xl" mx="auto">
              <CheckCircle size={24} />
            </ThemeIcon>
            <Title order={5} mt="md">No Incidents</Title>
            <Text size="sm" c="dimmed" mt="xs">
              No incident reports have been filed.
            </Text>
          </Paper>
        ) : (
          <Paper withBorder p="md" radius="md">
            <Group mb="sm">
              <ThemeIcon color="orange" variant="light" size="lg" radius="md">
                <FileText size={18} />
              </ThemeIcon>
              <Title order={5}>All Incidents</Title>
            </Group>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
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
                    <Table.Td>
                      <Text size="xs">
                        {new Date(inc.createdAt).toLocaleDateString()}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={500}>{inc.childName}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="xs" variant="light">
                        {TYPE_LABELS[inc.incidentType]}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        size="xs"
                        color={SEVERITY_COLOR[inc.severity]}
                      >
                        {inc.severity}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        color={inc.guardianNotified ? "teal" : "red"}
                        size="xs"
                      >
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
      </Stack>
    </ApplicationShell>
  );
}

// ── Incident form ─────────────────────────────────────────────────────────────

export function CcmIncidentForm({
  session,
  activeService,
}: {
  session: ChurchAppSession;
  activeService: CcmService | null;
}) {
  const [childName, setChildName] = useState("");
  const [incidentType, setIncidentType] = useState<IncidentType>("medical");
  const [severity, setSeverity] = useState<IncidentSeverity>("medium");
  const [description, setDescription] = useState("");
  const [actionsTaken, setActionsTaken] = useState("");
  const [guardianNotified, setGuardianNotified] = useState(false);
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!childName.trim() || !description.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const input: FileIncidentInput = {
          childName: childName.trim(),
          incidentType,
          severity,
          description: description.trim(),
          actionsTaken: actionsTaken.trim() || undefined,
          guardianNotified,
          followUpRequired,
          ...(activeService ? { serviceId: activeService.id } : {}),
        };
        await fileIncidentAction(input);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to file incident.");
      }
    });
  };

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Children's Ministry"
      title="File Incident Report"
      description="Document a safety or behavioral incident"
      sidebarTitle="Children's Ministry"
      sidebarDescription="Incident reporting"
      navLabel="CCM"
      navItems={ccmNavItems("/app/church-admin/children/incidents")}
    >
      <Paper withBorder p="lg" radius="md" style={{ maxWidth: 580 }}>
        {!activeService && (
          <Alert color="orange" icon={<AlertTriangle size={14} />} mb="md">
            No active service — incident will not be linked to a service.
          </Alert>
        )}

        {saved ? (
          <Stack gap="md" ta="center" py="xl">
            <ThemeIcon size="xl" variant="light" color="teal" radius="xl" mx="auto">
              <CheckCircle size={28} />
            </ThemeIcon>
            <Title order={4}>Incident Filed</Title>
            <Text size="sm" c="dimmed">
              The incident report has been saved. Follow-up items will appear in the incident list.
            </Text>
            <Group justify="center" gap="sm">
              <Button
                component={Link}
                href="/app/church-admin/children/incidents"
                variant="light"
              >
                View All Incidents
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setChildName("");
                  setDescription("");
                  setActionsTaken("");
                  setGuardianNotified(false);
                  setFollowUpRequired(false);
                  setSaved(false);
                }}
              >
                File Another
              </Button>
            </Group>
          </Stack>
        ) : (
          <Stack gap="sm">
            <Title order={4} mb="xs">Incident Report</Title>

            {error && (
              <Alert color="red" icon={<AlertTriangle size={14} />}>
                {error}
              </Alert>
            )}

            <TextInput
              label="Child's Name"
              placeholder="First and last name"
              required
              value={childName}
              onChange={(e) => setChildName(e.currentTarget.value)}
            />

            <Group gap="sm" grow>
              <Select
                label="Incident Type"
                data={[
                  { value: "medical", label: "Medical" },
                  { value: "behavioral", label: "Behavioral" },
                  { value: "security", label: "Security" },
                  { value: "property", label: "Property Damage" },
                  { value: "near_miss", label: "Near Miss" },
                  { value: "other", label: "Other" },
                ]}
                value={incidentType}
                onChange={(v) => setIncidentType((v as IncidentType) ?? "medical")}
              />
              <Select
                label="Severity"
                data={[
                  { value: "critical", label: "Critical" },
                  { value: "high", label: "High" },
                  { value: "medium", label: "Medium" },
                  { value: "low", label: "Low" },
                ]}
                value={severity}
                onChange={(v) => setSeverity((v as IncidentSeverity) ?? "medium")}
              />
            </Group>

            {(severity === "critical" || severity === "high") && (
              <Alert color="red" icon={<AlertTriangle size={14} />}>
                High/Critical incidents require guardian notification and follow-up documentation.
                Notify your Children&apos;s Ministry Director immediately.
              </Alert>
            )}

            <Textarea
              label="Description"
              placeholder="Describe exactly what happened, when, and who was involved…"
              required
              minRows={3}
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
            />

            <Textarea
              label="Actions Taken"
              placeholder="First aid administered, guardian called, staff actions…"
              minRows={2}
              value={actionsTaken}
              onChange={(e) => setActionsTaken(e.currentTarget.value)}
            />

            <Stack gap="xs">
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={guardianNotified}
                  onChange={(e) => setGuardianNotified(e.currentTarget.checked)}
                />
                <Text size="sm">Guardian was notified</Text>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={followUpRequired}
                  onChange={(e) => setFollowUpRequired(e.currentTarget.checked)}
                />
                <Text size="sm">Follow-up required</Text>
              </label>
            </Stack>

            <Group mt="sm" gap="sm">
              <Button
                color="churchBlue"
                loading={isPending}
                disabled={!childName.trim() || !description.trim()}
                onClick={handleSubmit}
              >
                File Incident Report
              </Button>
              <Button
                component={Link}
                href="/app/church-admin/children/incidents"
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
