"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { BarChart2, Plus, Check, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import type { ChurchAppSession } from "@/lib/auth";
import type { ServiceAttendanceEntry } from "@/lib/groups-types";
import { logServiceAttendanceAction } from "@/app/app/groups-actions";

const NAV_ITEMS = [
  { href: "/app/church-admin/groups", label: "Small Groups", description: "Group directory", icon: BarChart2, active: false },
  { href: "/app/church-admin/attendance", label: "Attendance", description: "Service headcounts", icon: BarChart2, active: true },
];

const SERVICE_TYPES = [
  { value: "sunday_morning", label: "Sunday Morning" },
  { value: "sunday_evening", label: "Sunday Evening" },
  { value: "wednesday", label: "Wednesday Service" },
  { value: "special", label: "Special Event" },
];

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

export function AttendanceDashboard({
  session,
  records,
}: {
  session: ChurchAppSession;
  records: ServiceAttendanceEntry[];
}) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [serviceDate, setServiceDate] = useState("");
  const [serviceType, setServiceType] = useState("sunday_morning");
  const [headcount, setHeadcount] = useState<number | "">(0);
  const [notes, setNotes] = useState("");

  const recentTen = records.slice(0, 10);
  const avgLast4 = recentTen.length > 0
    ? Math.round(
        recentTen.slice(0, 4)
          .filter((r) => r.headcount !== null)
          .reduce((s, r) => s + (r.headcount ?? 0), 0) /
        Math.max(1, recentTen.slice(0, 4).filter((r) => r.headcount !== null).length),
      )
    : null;

  const trend = recentTen.length >= 4
    ? (recentTen[0]?.headcount ?? 0) > (recentTen[3]?.headcount ?? 0)
    : null;

  function handleLog() {
    if (!serviceDate || !headcount) { setMsg({ type: "error", text: "Date and headcount are required." }); return; }
    startTransition(async () => {
      const res = await logServiceAttendanceAction(serviceDate, serviceType, Number(headcount), notes || undefined);
      if (res.ok) {
        setServiceDate("");
        setHeadcount(0);
        setNotes("");
        setMsg({ type: "success", text: "Attendance logged." });
      } else {
        setMsg({ type: "error", text: res.error ?? "Failed to log attendance." });
      }
    });
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Attendance"
      title="Attendance Tracking"
      description={session.appContext.church?.name ?? ""}
      sidebarTitle="Attendance"
      sidebarDescription="Service headcounts & trends"
      navLabel="Attendance"
      navItems={NAV_ITEMS}
    >
      <Stack gap="md" p="md">
        <Group justify="space-between">
          <div>
            <Title order={2}>Attendance Tracking</Title>
            <Text c="dimmed" size="sm">Service headcounts and trends</Text>
          </div>
          {avgLast4 !== null && (
            <Paper p="sm" withBorder radius="md">
              <Group gap="xs">
                {trend === true && <TrendingUp size={16} color="green" />}
                {trend === false && <TrendingDown size={16} color="red" />}
                <div>
                  <Text size="xs" c="dimmed">4-week avg</Text>
                  <Text fw={700} size="lg">{avgLast4}</Text>
                </div>
              </Group>
            </Paper>
          )}
        </Group>

        {msg && (
          <Alert
            color={msg.type === "success" ? "green" : "red"}
            icon={msg.type === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
            onClose={() => setMsg(null)}
            withCloseButton
          >
            {msg.text}
          </Alert>
        )}

        <Paper withBorder radius="md" p="md">
          <Text fw={500} mb="sm">Log Attendance</Text>
          <Group gap="sm" align="flex-end" wrap="wrap">
            <TextInput
              label="Service Date"
              type="date"
              value={serviceDate}
              onChange={(e) => setServiceDate(e.target.value)}
              required
            />
            <Select
              label="Service Type"
              data={SERVICE_TYPES}
              value={serviceType}
              onChange={(v) => setServiceType(v ?? "sunday_morning")}
              style={{ minWidth: 180 }}
            />
            <NumberInput
              label="Headcount"
              value={headcount}
              onChange={(v) => setHeadcount(v === "" ? "" : Number(v))}
              min={0}
              required
            />
            <TextInput
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
            />
            <Button leftSection={<Plus size={14} />} onClick={handleLog} loading={isPending}>
              Log
            </Button>
          </Group>
        </Paper>

        <Paper withBorder radius="md">
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Service</Table.Th>
                <Table.Th>Headcount</Table.Th>
                <Table.Th>Notes</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {records.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={4} ta="center" py="xl">
                    <Text c="dimmed" size="sm">No attendance records yet.</Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                records.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td>{formatDate(r.serviceDate)}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" size="sm" tt="capitalize">
                        {SERVICE_TYPES.find((t) => t.value === r.serviceType)?.label ?? r.serviceType}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text fw={500}>{r.headcount ?? "—"}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">{r.notes ?? "—"}</Text>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Paper>
      </Stack>
    </ApplicationShell>
  );
}
