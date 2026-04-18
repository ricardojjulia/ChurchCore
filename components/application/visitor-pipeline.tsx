"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { Plus, UserPlus } from "lucide-react";

import type { FirstTimeVisitor } from "@/lib/groups-types";
import {
  addFirstTimeVisitorAction,
  advanceVisitorWorkflowAction,
} from "@/app/app/groups-actions";

const STAGES: { value: string; label: string; color: string }[] = [
  { value: "new", label: "New", color: "blue" },
  { value: "day1_sent", label: "Day 1 Sent", color: "cyan" },
  { value: "day7_sent", label: "Day 7 Sent", color: "grape" },
  { value: "call_prompted", label: "Call Prompted", color: "orange" },
  { value: "converted", label: "Converted", color: "green" },
  { value: "inactive", label: "Inactive", color: "gray" },
];

function stageLabel(stage: string) {
  return STAGES.find((s) => s.value === stage)?.label ?? stage;
}

export function VisitorPipeline({
  visitors: initialVisitors,
}: {
  visitors: FirstTimeVisitor[];
}) {
  const [visitors, setVisitors] = useState(initialVisitors);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [advanceTarget, setAdvanceTarget] = useState<FirstTimeVisitor | null>(null);
  const [advanceStage, setAdvanceStage] = useState("");
  const [advanceNotes, setAdvanceNotes] = useState("");
  const [addForm, setAddForm] = useState({
    fullName: "", email: "", phone: "", visitDate: new Date().toISOString().slice(0, 10),
    referredBy: "", howDidHear: "",
  });

  const byStage = STAGES.map((s) => ({
    ...s,
    visitors: visitors.filter((v) => v.workflowStage === s.value),
  }));

  const activeCount = visitors.filter((v) => v.workflowStage !== "inactive" && v.workflowStage !== "converted").length;
  const convertedCount = visitors.filter((v) => v.workflowStage === "converted").length;

  function handleAdd() {
    if (!addForm.fullName.trim()) return;
    startTransition(async () => {
      const res = await addFirstTimeVisitorAction({
        fullName: addForm.fullName,
        email: addForm.email || undefined,
        phone: addForm.phone || undefined,
        visitDate: addForm.visitDate,
        referredBy: addForm.referredBy || undefined,
        howDidHear: addForm.howDidHear || undefined,
      });
      if (res.ok) {
        setShowAdd(false);
        setMsg({ type: "success", text: `${addForm.fullName} added to pipeline.` });
        setVisitors((prev) => [
          {
            id: crypto.randomUUID(),
            fullName: addForm.fullName,
            email: addForm.email || null,
            phone: addForm.phone || null,
            visitDate: addForm.visitDate,
            referredBy: addForm.referredBy || null,
            howDidHear: addForm.howDidHear || null,
            workflowStage: "new",
            workflowNotes: null,
            convertedAt: null,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        setAddForm({ fullName: "", email: "", phone: "", visitDate: new Date().toISOString().slice(0, 10), referredBy: "", howDidHear: "" });
      } else {
        setMsg({ type: "error", text: res.error ?? "Failed to add visitor." });
      }
    });
  }

  function handleAdvance() {
    if (!advanceTarget || !advanceStage) return;
    startTransition(async () => {
      const res = await advanceVisitorWorkflowAction(advanceTarget.id, advanceStage, advanceNotes || undefined);
      if (res.ok) {
        setVisitors((prev) =>
          prev.map((v) =>
            v.id === advanceTarget.id
              ? { ...v, workflowStage: advanceStage, workflowNotes: advanceNotes || v.workflowNotes, convertedAt: advanceStage === "converted" ? new Date().toISOString() : v.convertedAt }
              : v,
          ),
        );
        setAdvanceTarget(null);
        setAdvanceStage("");
        setAdvanceNotes("");
        setMsg({ type: "success", text: `${advanceTarget.fullName} moved to ${stageLabel(advanceStage)}.` });
      } else {
        setMsg({ type: "error", text: res.error ?? "Failed to update." });
      }
    });
  }

  return (
    <Stack gap="lg">
      {/* Summary */}
      <Group gap="md">
        <Paper withBorder p="sm" radius="md" style={{ flex: 1 }}>
          <Text fz="xs" c="dimmed">In pipeline</Text>
          <Text fz="xl" fw={700}>{activeCount}</Text>
        </Paper>
        <Paper withBorder p="sm" radius="md" style={{ flex: 1 }}>
          <Text fz="xs" c="dimmed">Converted</Text>
          <Text fz="xl" fw={700} c="green">{convertedCount}</Text>
        </Paper>
        <Paper withBorder p="sm" radius="md" style={{ flex: 1 }}>
          <Text fz="xs" c="dimmed">Total visitors</Text>
          <Text fz="xl" fw={700}>{visitors.length}</Text>
        </Paper>
      </Group>

      <Group justify="space-between">
        <Title order={4} size="h5">Visitor Pipeline</Title>
        <Button size="xs" leftSection={<UserPlus size={14} />} onClick={() => setShowAdd(true)}>
          Add Visitor
        </Button>
      </Group>

      {msg && (
        <Alert color={msg.type === "success" ? "green" : "red"} withCloseButton onClose={() => setMsg(null)}>
          {msg.text}
        </Alert>
      )}

      {/* Pipeline columns */}
      <SimpleGrid cols={{ base: 2, md: 3, lg: 6 }} spacing="sm">
        {byStage.map((stage) => (
          <Stack key={stage.value} gap="sm">
            <Group gap="xs">
              <Badge color={stage.color} variant="light" size="sm">{stage.label}</Badge>
              <Text size="xs" c="dimmed">({stage.visitors.length})</Text>
            </Group>
            {stage.visitors.length === 0 ? (
              <Text size="xs" c="dimmed" ta="center" py="sm">—</Text>
            ) : (
              stage.visitors.map((v) => (
                <Paper key={v.id} withBorder p="xs" radius="sm">
                  <Text size="sm" fw={600} lineClamp={1}>{v.fullName}</Text>
                  <Text size="xs" c="dimmed">{new Date(v.visitDate).toLocaleDateString()}</Text>
                  {v.email && <Text size="xs" c="dimmed" lineClamp={1}>{v.email}</Text>}
                  {v.howDidHear && <Text size="xs" c="dimmed" lineClamp={1}>{v.howDidHear}</Text>}
                  <Button
                    size="xs"
                    variant="subtle"
                    mt={4}
                    fullWidth
                    onClick={() => { setAdvanceTarget(v); setAdvanceStage(v.workflowStage); }}
                  >
                    Move
                  </Button>
                </Paper>
              ))
            )}
          </Stack>
        ))}
      </SimpleGrid>

      {/* Add visitor modal */}
      <Modal opened={showAdd} onClose={() => setShowAdd(false)} title="Add First-Time Visitor" centered>
        <Stack gap="sm">
          <TextInput label="Full name" required value={addForm.fullName} onChange={(e) => setAddForm((f) => ({ ...f, fullName: e.target.value }))} />
          <Group gap="sm">
            <TextInput label="Email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} style={{ flex: 1 }} />
            <TextInput label="Phone" value={addForm.phone} onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))} style={{ flex: 1 }} />
          </Group>
          <TextInput label="Visit date" type="date" value={addForm.visitDate} onChange={(e) => setAddForm((f) => ({ ...f, visitDate: e.target.value }))} />
          <TextInput label="Referred by" value={addForm.referredBy} onChange={(e) => setAddForm((f) => ({ ...f, referredBy: e.target.value }))} />
          <TextInput label="How did they hear?" value={addForm.howDidHear} onChange={(e) => setAddForm((f) => ({ ...f, howDidHear: e.target.value }))} />
          <Group justify="flex-end">
            <Button variant="default" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAdd} loading={isPending} leftSection={<Plus size={14} />}>Add</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Advance stage modal */}
      <Modal
        opened={!!advanceTarget}
        onClose={() => { setAdvanceTarget(null); setAdvanceStage(""); setAdvanceNotes(""); }}
        title={`Update: ${advanceTarget?.fullName}`}
        centered
      >
        <Stack gap="sm">
          <Select
            label="Move to stage"
            data={STAGES.map((s) => ({ value: s.value, label: s.label }))}
            value={advanceStage}
            onChange={(v) => setAdvanceStage(v ?? "")}
          />
          <Textarea
            label="Notes (optional)"
            value={advanceNotes}
            onChange={(e) => setAdvanceNotes(e.target.value)}
            minRows={2}
          />
          <Group justify="flex-end">
            <Button variant="default" size="sm" onClick={() => setAdvanceTarget(null)}>Cancel</Button>
            <Button size="sm" onClick={handleAdvance} loading={isPending}>Save</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
