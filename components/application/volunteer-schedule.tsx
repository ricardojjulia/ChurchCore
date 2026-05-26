"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import {
  CalendarCheck,
  Check,
  ChevronRight,
  Clock,
  Link2Off,
  Plus,
  UserCheck,
  UserMinus,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { ReadinessTargetState } from "@/components/application/readiness-target-state";
import type { ServicePlanDetail, ServicePlanListEntry, ServicePlanTemplate, VolunteerPoolEntry } from "@/lib/volunteer-types";
import {
  addPlanPositionAction,
  assignVolunteerAction,
  createServicePlanAction,
  removeAssignmentAction,
  updateServicePlanStatusAction,
} from "@/app/app/volunteer-actions";

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
const STATUS_COLOR: Record<string, string> = {
  draft: "gray", published: "blue", complete: "green", cancelled: "red",
};
const CONFIRM_COLOR: Record<string, string> = {
  pending: "yellow", confirmed: "green", declined: "red", substitute: "orange",
};

// ── Service plans list ───────────────────────────────────────

export function ServicePlansWorkspace({
  plans: initialPlans,
  templates,
  source,
}: {
  plans: ServicePlanListEntry[];
  templates: ServicePlanTemplate[];
  source: "preview" | "live";
}) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const [plans] = useState(initialPlans);
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", serviceDate: "", serviceTime: "", notes: "", templateId: "",
  });

  const visiblePlans =
    view === "unassigned"
      ? plans.filter((plan) => plan.filledCount < plan.positionCount)
      : plans;
  const upcoming = visiblePlans.filter((p) => p.serviceDate >= new Date().toISOString().slice(0, 10));
  const past = visiblePlans.filter((p) => p.serviceDate < new Date().toISOString().slice(0, 10));
  const readinessState =
    view === "unassigned"
      ? source === "preview"
        ? {
            state: "no-backend" as const,
            title: "Readiness target unavailable",
            description:
              "Volunteer schedule readiness can be previewed, but live service-plan coverage checks need tenant data.",
            detail: "Configure the tenant backend before using this target to clear readiness.",
          }
        : visiblePlans.length === 0
          ? {
              state: "completed" as const,
              title: "Volunteer schedule readiness is clear",
              description: "No upcoming service plans currently need volunteer coverage.",
            }
          : {
              state: "validation-error" as const,
              title: "Service plans need volunteer coverage",
              description:
                "Open the matching service plans below to fill positions and confirm volunteers.",
              detail: `${visiblePlans.length} plan${visiblePlans.length === 1 ? "" : "s"} need coverage.`,
            }
      : source === "live" && plans.length === 0
        ? {
            state: "empty" as const,
            title: "No service plans yet",
            description:
              "Create service plans before using this workspace for volunteer coverage and readiness work.",
          }
        : null;

  function handleCreate() {
    if (!form.name.trim() || !form.serviceDate) return;
    startTransition(async () => {
      const res = await createServicePlanAction({
        name: form.name, serviceDate: form.serviceDate,
        serviceTime: form.serviceTime || undefined,
        notes: form.notes || undefined,
        templateId: form.templateId || undefined,
      });
      if (res.ok && res.id) {
        window.location.href = `/app/church-admin/volunteers/schedules/${res.id}`;
      } else {
        setMsg(res.error ?? "Failed to create plan.");
      }
    });
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={3}>Service Plans</Title>
          <Text c="dimmed" size="sm">
            {view === "unassigned"
              ? `${visiblePlans.length} need volunteer coverage`
              : `${upcoming.length} upcoming`}
          </Text>
        </div>
        <Button leftSection={<Plus size={15} />} onClick={() => setShowCreate(true)}>
          New Plan
        </Button>
      </Group>

      {msg && <Alert color="red" onClose={() => setMsg(null)} withCloseButton>{msg}</Alert>}

      {view === "unassigned" && (
        <Paper withBorder radius="lg" p="md" bg="#f8fbff">
          <Group justify="space-between" gap="md">
            <div>
              <Text fw={700} size="sm">Readiness view: plans needing volunteer coverage.</Text>
              <Text size="sm" c="dimmed" mt={4}>
                Open a service plan to fill positions and confirm volunteers.
              </Text>
            </div>
            <Text component={Link} href="/app/church-admin/readiness" size="sm" fw={700} c="churchBlue">
              Back to readiness
            </Text>
          </Group>
        </Paper>
      )}

      {readinessState ? (
        <ReadinessTargetState
          {...readinessState}
          primaryAction={{ label: "Back to readiness", href: "/app/church-admin/readiness" }}
          secondaryAction={{ label: "All service plans", href: "/app/church-admin/volunteers/schedules" }}
        />
      ) : null}

      {[
        { label: "Upcoming", rows: upcoming },
        { label: "Past", rows: past },
      ].map(({ label, rows }) => (
        <Stack key={label} gap="sm">
          <Text fw={600} size="sm" c="dimmed" tt="uppercase">{label}</Text>
          {rows.length === 0 ? (
            <Text size="sm" c="dimmed">No {label.toLowerCase()} service plans.</Text>
          ) : (
            <Paper withBorder radius="md">
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Filled</Table.Th>
                    <Table.Th>Confirmed</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((p) => (
                    <Table.Tr key={p.id}>
                      <Table.Td fw={500}>{p.name}</Table.Td>
                      <Table.Td><Text size="sm">{formatDate(p.serviceDate)}</Text></Table.Td>
                      <Table.Td>
                        <Badge size="sm" color={STATUS_COLOR[p.status]} variant="light" tt="capitalize">{p.status}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{p.filledCount} / {p.positionCount * 1}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="sm" color={p.confirmedCount > 0 ? "green" : "gray"} variant="light">
                          {p.confirmedCount} confirmed
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Button
                          component={Link}
                          href={`/app/church-admin/volunteers/schedules/${p.id}`}
                          size="xs" variant="subtle"
                          rightSection={<ChevronRight size={13} />}
                        >
                          Open
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          )}
        </Stack>
      ))}

      <Modal opened={showCreate} onClose={() => setShowCreate(false)} title="New Service Plan" centered>
        <Stack gap="sm">
          <TextInput label="Plan name" placeholder="Sunday Morning, VBS Day 1…" required
            value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Group gap="sm">
            <TextInput label="Service date" type="date" required style={{ flex: 1 }}
              value={form.serviceDate} onChange={(e) => setForm((f) => ({ ...f, serviceDate: e.target.value }))} />
            <TextInput label="Service time" type="time" style={{ flex: 1 }}
              value={form.serviceTime} onChange={(e) => setForm((f) => ({ ...f, serviceTime: e.target.value }))} />
          </Group>
          {templates.length > 0 && (
            <Select label="Apply template (optional)" placeholder="Choose a template"
              data={[{ value: "", label: "No template" }, ...templates.map((t) => ({ value: t.id, label: t.name }))]}
              value={form.templateId} onChange={(v) => setForm((f) => ({ ...f, templateId: v ?? "" }))} />
          )}
          <Textarea label="Notes (optional)" minRows={2}
            value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={isPending}>Create</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

// ── Service plan detail / builder ────────────────────────────

export function ServicePlanBuilder({
  detail: initialDetail,
  pool,
}: {
  detail: ServicePlanDetail;
  pool: VolunteerPoolEntry[];
}) {
  const [detail, setDetail] = useState(initialDetail);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showAddPosition, setShowAddPosition] = useState(false);
  const [posForm, setPosForm] = useState({ roleName: "", quantityNeeded: 1 });
  const [assignTarget, setAssignTarget] = useState<{ positionId: string; roleName: string } | null>(null);
  const [volunteerSearch, setVolunteerSearch] = useState("");

  const filteredPool = pool.filter((v) =>
    !volunteerSearch ||
    [v.fullName, v.email].filter(Boolean).join(" ").toLowerCase().includes(volunteerSearch.toLowerCase())
  );

  function handlePublish(status: "published" | "complete" | "cancelled") {
    startTransition(async () => {
      const res = await updateServicePlanStatusAction(detail.plan.id, status);
      if (res.ok) setDetail((d) => ({ ...d, plan: { ...d.plan, status } }));
      else setMsg({ type: "error", text: res.error ?? "Failed." });
    });
  }

  function handleAddPosition() {
    if (!posForm.roleName.trim()) return;
    startTransition(async () => {
      const res = await addPlanPositionAction({
        planId: detail.plan.id, roleName: posForm.roleName, quantityNeeded: posForm.quantityNeeded,
        sortOrder: detail.positions.length,
      });
      if (res.ok && res.id) {
        setDetail((d) => ({
          ...d,
          positions: [...d.positions, {
            id: res.id!, planId: d.plan.id, churchId: d.plan.churchId,
            roleName: posForm.roleName, quantityNeeded: posForm.quantityNeeded,
            ministryId: null, sortOrder: d.positions.length,
            shifts: [], filled: 0, pending: 0,
          }],
        }));
        setShowAddPosition(false);
        setPosForm({ roleName: "", quantityNeeded: 1 });
      } else {
        setMsg({ type: "error", text: res.error ?? "Failed." });
      }
    });
  }

  function handleAssign(profileId: string, fullName: string) {
    if (!assignTarget) return;
    const serviceDate = detail.plan.serviceDate;
    const startsAt = detail.plan.serviceTime
      ? `${serviceDate}T${detail.plan.serviceTime}`
      : `${serviceDate}T09:00:00`;
    const endsAt = detail.plan.serviceTime
      ? `${serviceDate}T${detail.plan.serviceTime}`
      : `${serviceDate}T12:00:00`;

    startTransition(async () => {
      const res = await assignVolunteerAction({
        planId: detail.plan.id, positionId: assignTarget.positionId,
        profileId, roleName: assignTarget.roleName, startsAt, endsAt,
      });
      if (res.ok) {
        setAssignTarget(null);
        setVolunteerSearch("");
        setDetail((d) => ({
          ...d,
          positions: d.positions.map((p) =>
            p.id === assignTarget.positionId
              ? {
                  ...p,
                  filled: p.filled + 1,
                  pending: p.pending + 1,
                  shifts: [...p.shifts, {
                    id: crypto.randomUUID(), churchId: d.plan.churchId,
                    eventId: null, planId: d.plan.id, positionId: p.id,
                    assignedUserId: profileId, title: assignTarget.roleName,
                    startsAt, endsAt, status: "assigned", confirmationStatus: "pending",
                    declineReason: null, respondedAt: null, volunteerNotes: null,
                    volunteerName: fullName, volunteerEmail: null, volunteerPhone: null,
                  }],
                }
              : p,
          ),
          pendingCount: d.pendingCount + 1,
        }));
        setMsg({ type: "success", text: `${fullName} assigned as ${assignTarget.roleName}.` });
      } else {
        setMsg({ type: "error", text: res.error ?? "Assignment failed." });
      }
    });
  }

  function handleRemove(shiftId: string, positionId: string) {
    startTransition(async () => {
      const res = await removeAssignmentAction(shiftId, detail.plan.id);
      if (res.ok) {
        setDetail((d) => ({
          ...d,
          positions: d.positions.map((p) =>
            p.id === positionId
              ? { ...p, shifts: p.shifts.filter((s) => s.id !== shiftId), filled: Math.max(0, p.filled - 1) }
              : p,
          ),
        }));
      } else {
        setMsg({ type: "error", text: res.error ?? "Failed to remove." });
      }
    });
  }

  const totalNeeded = detail.positions.reduce((s, p) => s + p.quantityNeeded, 0);
  const fillPct = totalNeeded > 0 ? Math.round((detail.confirmedCount / totalNeeded) * 100) : 0;

  return (
    <Stack gap="lg">
      {/* Header */}
      <Paper withBorder p="lg" radius="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Group gap="sm">
              <Title order={3}>{detail.plan.name}</Title>
              <Badge color={STATUS_COLOR[detail.plan.status]} variant="light" tt="capitalize">
                {detail.plan.status}
              </Badge>
            </Group>
            <Group gap="md">
              <Group gap="xs"><CalendarCheck size={14} /><Text size="sm">{formatDate(detail.plan.serviceDate)}</Text></Group>
              {detail.plan.serviceTime && (
                <Group gap="xs"><Clock size={14} /><Text size="sm">{detail.plan.serviceTime}</Text></Group>
              )}
            </Group>
          </Stack>
          <Group gap="xs">
            {detail.plan.status === "draft" && (
              <Button size="xs" color="blue" onClick={() => handlePublish("published")} loading={isPending}>
                Publish
              </Button>
            )}
            {detail.plan.status === "published" && (
              <Button size="xs" color="green" leftSection={<Check size={13} />}
                onClick={() => handlePublish("complete")} loading={isPending}>
                Mark Complete
              </Button>
            )}
          </Group>
        </Group>

        {/* Fill progress */}
        <Stack gap="xs" mt="md">
          <Group justify="space-between">
            <Text size="xs" c="dimmed">Positions filled & confirmed</Text>
            <Text size="xs" fw={600}>{detail.confirmedCount} / {totalNeeded} confirmed</Text>
          </Group>
          <Progress value={fillPct} color={fillPct === 100 ? "green" : fillPct > 60 ? "blue" : "orange"} size="sm" radius="xl" />
        </Stack>

        <SimpleGrid cols={3} spacing="sm" mt="md">
          <Paper withBorder p="xs" radius="sm">
            <Text fz="xs" c="dimmed">Unfilled</Text>
            <Text fz="lg" fw={700} c={detail.unfilledCount > 0 ? "orange" : "green"}>{detail.unfilledCount}</Text>
          </Paper>
          <Paper withBorder p="xs" radius="sm">
            <Text fz="xs" c="dimmed">Pending response</Text>
            <Text fz="lg" fw={700} c={detail.pendingCount > 0 ? "yellow" : "green"}>{detail.pendingCount}</Text>
          </Paper>
          <Paper withBorder p="xs" radius="sm">
            <Text fz="xs" c="dimmed">Confirmed</Text>
            <Text fz="lg" fw={700} c="teal">{detail.confirmedCount}</Text>
          </Paper>
        </SimpleGrid>
      </Paper>

      {msg && (
        <Alert color={msg.type === "success" ? "green" : "red"} withCloseButton onClose={() => setMsg(null)}>
          {msg.text}
        </Alert>
      )}

      {/* Positions */}
      <Group justify="space-between">
        <Title order={4} size="h5">Positions</Title>
        <Button size="xs" leftSection={<Plus size={13} />} variant="default"
          onClick={() => setShowAddPosition(true)}>
          Add Position
        </Button>
      </Group>

      {detail.positions.length === 0 ? (
        <Text size="sm" c="dimmed">No positions yet. Add positions to start scheduling volunteers.</Text>
      ) : (
        detail.positions.map((pos) => (
          <Paper key={pos.id} withBorder radius="md" p="md">
            <Group justify="space-between" mb="sm">
              <Group gap="sm">
                <Text fw={600}>{pos.roleName}</Text>
                <Badge variant="light" color="gray" size="sm">{pos.quantityNeeded} needed</Badge>
                <Badge variant="light"
                  color={pos.filled >= pos.quantityNeeded ? "green" : pos.filled > 0 ? "blue" : "gray"}
                  size="sm">
                  {pos.filled} / {pos.quantityNeeded} filled
                </Badge>
              </Group>
              <Button size="xs" leftSection={<UserPlus size={13} />}
                onClick={() => setAssignTarget({ positionId: pos.id, roleName: pos.roleName })}
                disabled={pos.filled >= pos.quantityNeeded}>
                Assign
              </Button>
            </Group>

            {pos.shifts.length > 0 ? (
              <Stack gap="xs">
                {pos.shifts.map((shift) => (
                  <Group key={shift.id} justify="space-between" px="xs" py={4}
                    style={{ background: "var(--mantine-color-default-border)", borderRadius: 6, opacity: 1 }}>
                    <Group gap="sm">
                      <Text size="sm" fw={500}>{shift.volunteerName ?? "Unknown"}</Text>
                      {shift.volunteerEmail && <Text size="xs" c="dimmed">{shift.volunteerEmail}</Text>}
                    </Group>
                    <Group gap="xs">
                      <Badge size="xs" color={CONFIRM_COLOR[shift.confirmationStatus]} variant="dot">
                        {shift.confirmationStatus}
                      </Badge>
                      <Button size="xs" variant="subtle" color="red"
                        leftSection={<UserMinus size={12} />}
                        onClick={() => handleRemove(shift.id, pos.id)}
                        loading={isPending}>
                        Remove
                      </Button>
                    </Group>
                  </Group>
                ))}
              </Stack>
            ) : (
              <Text size="xs" c="dimmed">No one assigned yet.</Text>
            )}
          </Paper>
        ))
      )}

      {/* Add position modal */}
      <Modal opened={showAddPosition} onClose={() => setShowAddPosition(false)} title="Add Position" centered>
        <Stack gap="sm">
          <TextInput label="Role name" placeholder="Worship Leader, Sound Tech, Greeter…" required
            value={posForm.roleName} onChange={(e) => setPosForm((f) => ({ ...f, roleName: e.target.value }))} />
          <NumberInput label="Quantity needed" min={1} max={50}
            value={posForm.quantityNeeded} onChange={(v) => setPosForm((f) => ({ ...f, quantityNeeded: Number(v) }))} />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setShowAddPosition(false)}>Cancel</Button>
            <Button onClick={handleAddPosition} loading={isPending}>Add</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Assign volunteer modal */}
      <Modal
        opened={!!assignTarget}
        onClose={() => { setAssignTarget(null); setVolunteerSearch(""); }}
        title={`Assign volunteer — ${assignTarget?.roleName}`}
        size="lg" centered
      >
        <Stack gap="sm">
          <TextInput
            placeholder="Search by name or email"
            value={volunteerSearch}
            onChange={(e) => setVolunteerSearch(e.target.value)}
            leftSection={<UserCheck size={15} />}
          />
          <Stack gap="xs" style={{ maxHeight: 360, overflowY: "auto" }}>
            {filteredPool.slice(0, 20).map((v) => (
              <Paper key={v.profileId} withBorder p="sm" radius="sm">
                <Group justify="space-between">
                  <Stack gap={2}>
                    <Group gap="xs">
                      <Text size="sm" fw={600}>{v.fullName}</Text>
                      {v.isBlocked && <Badge size="xs" color="red">Blocked date</Badge>}
                      {v.recentShiftCount >= 3 && (
                        <Badge size="xs" color="yellow">{v.recentShiftCount} shifts (30d)</Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">{v.email ?? "No email"}</Text>
                    {v.skills.length > 0 && (
                      <Group gap={4}>
                        {v.skills.slice(0, 4).map((s) => (
                          <Badge key={s} size="xs" variant="outline">{s}</Badge>
                        ))}
                      </Group>
                    )}
                  </Stack>
                  <Button size="xs" onClick={() => handleAssign(v.profileId, v.fullName)}
                    loading={isPending} disabled={v.isBlocked}>
                    Assign
                  </Button>
                </Group>
              </Paper>
            ))}
            {filteredPool.length === 0 && (
              <Text size="sm" c="dimmed" ta="center" py="md">
                <Link2Off size={16} /> No volunteers found.
              </Text>
            )}
          </Stack>
        </Stack>
      </Modal>
    </Stack>
  );
}
