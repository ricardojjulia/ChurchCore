"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  MultiSelect,
  Paper,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { Plus } from "lucide-react";

import type { ServicePlanRoleType } from "@/lib/volunteer-types";
import {
  createRoleTypeAction,
  deactivateRoleTypeAction,
  updateRoleTypeAction,
} from "@/app/app/volunteer-actions";

type RoleTypeFormState = {
  id: string | null;
  name: string;
  description: string;
  requiredSkills: string[];
};

const EMPTY_FORM: RoleTypeFormState = { id: null, name: "", description: "", requiredSkills: [] };

// Renders read-only (no create/edit/deactivate affordances) when canManage
// is false — the page route already gates non-church-admin/pastor/
// ministry-leader roles away with a redirect (matching the sibling
// volunteers/* routes' established pattern), but this component supports a
// read-only mode independently as defense in depth and so it's directly
// testable without going through the page-level gate.
export function RoleTypeManager({
  roleTypes: initialRoleTypes,
  skillOptions,
  canManage,
}: {
  roleTypes: ServicePlanRoleType[];
  skillOptions: string[];
  canManage: boolean;
}) {
  const [roleTypes, setRoleTypes] = useState(initialRoleTypes);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<RoleTypeFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  function openCreateForm() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(rt: ServicePlanRoleType) {
    setForm({ id: rt.id, name: rt.name, description: rt.description ?? "", requiredSkills: rt.requiredSkills });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setFormError(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit() {
    const name = form.name.trim();
    if (!name) {
      setFormError("Role name is required.");
      return;
    }
    setFormError(null);

    startTransition(async () => {
      if (form.id) {
        const editId = form.id;
        const res = await updateRoleTypeAction({
          roleTypeId: editId,
          name,
          description: form.description.trim() || undefined,
          requiredSkills: form.requiredSkills,
        });
        if (!res.ok) {
          setFormError(res.error ?? "Failed to update role type.");
          return;
        }
        setRoleTypes((rts) =>
          rts.map((rt) =>
            rt.id === editId
              ? { ...rt, name, description: form.description.trim() || null, requiredSkills: form.requiredSkills }
              : rt,
          ),
        );
        setMsg({ type: "success", text: `${name} updated.` });
        closeForm();
      } else {
        const res = await createRoleTypeAction({
          name,
          description: form.description.trim() || undefined,
          requiredSkills: form.requiredSkills,
        });
        if (!res.ok || !res.id) {
          setFormError(res.error ?? "Failed to create role type.");
          return;
        }
        const newId = res.id;
        setRoleTypes((rts) =>
          [
            ...rts,
            {
              id: newId,
              // Not returned by createRoleTypeAction and not rendered
              // anywhere in this UI — safe to leave blank rather than
              // threading the church id through just for this.
              churchId: "",
              name,
              description: form.description.trim() || null,
              requiredSkills: form.requiredSkills,
              isActive: true,
              createdAt: new Date().toISOString(),
            },
          ].sort((a, b) => a.name.localeCompare(b.name)),
        );
        setMsg({ type: "success", text: `${name} created.` });
        closeForm();
      }
    });
  }

  function handleDeactivate(rt: ServicePlanRoleType) {
    setDeactivatingId(rt.id);
    startTransition(async () => {
      const res = await deactivateRoleTypeAction(rt.id);
      setDeactivatingId(null);
      if (!res.ok) {
        setMsg({ type: "error", text: res.error ?? "Failed to deactivate role type." });
        return;
      }
      setRoleTypes((rts) => rts.map((r) => (r.id === rt.id ? { ...r, isActive: false } : r)));
      setMsg({ type: "success", text: `${rt.name} deactivated.` });
    });
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={3}>Role Types</Title>
          <Text c="dimmed" size="sm">
            Reusable service-plan roles, such as Worship Leader, Sound Tech, or Greeter.
          </Text>
        </div>
        {canManage ? (
          <Button leftSection={<Plus size={15} />} onClick={openCreateForm}>
            New Role Type
          </Button>
        ) : null}
      </Group>

      {msg && (
        <Alert color={msg.type === "success" ? "green" : "red"} withCloseButton onClose={() => setMsg(null)}>
          {msg.text}
        </Alert>
      )}

      {roleTypes.length === 0 ? (
        <Text size="sm" c="dimmed">
          No role types yet.{canManage ? " Create one to start building service plan positions." : ""}
        </Text>
      ) : (
        <Paper withBorder radius="md">
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Description</Table.Th>
                <Table.Th>Required skills</Table.Th>
                <Table.Th>Status</Table.Th>
                {canManage ? <Table.Th /> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {roleTypes.map((rt) => (
                <Table.Tr key={rt.id}>
                  <Table.Td><Text fw={500} size="sm">{rt.name}</Text></Table.Td>
                  <Table.Td><Text size="sm" c="dimmed">{rt.description ?? "—"}</Text></Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {rt.requiredSkills.length === 0 ? (
                        <Text size="xs" c="dimmed">None</Text>
                      ) : (
                        rt.requiredSkills.map((s) => (
                          <Badge key={s} size="xs" variant="outline">{s}</Badge>
                        ))
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="sm" color={rt.isActive ? "green" : "gray"} variant="light">
                      {rt.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </Table.Td>
                  {canManage ? (
                    <Table.Td>
                      <Group gap="xs">
                        <Button size="xs" variant="default" onClick={() => openEditForm(rt)}>
                          Edit
                        </Button>
                        {rt.isActive ? (
                          <Button
                            size="xs"
                            variant="subtle"
                            color="red"
                            onClick={() => handleDeactivate(rt)}
                            loading={isPending && deactivatingId === rt.id}
                          >
                            Deactivate
                          </Button>
                        ) : null}
                      </Group>
                    </Table.Td>
                  ) : null}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      <Modal opened={showForm} onClose={closeForm} title={form.id ? "Edit Role Type" : "New Role Type"} centered>
        <Stack gap="sm">
          <TextInput
            label="Name"
            placeholder="Worship Leader, Sound Tech, Greeter…"
            required
            error={formError}
            value={form.name}
            onChange={(e) => {
              setFormError(null);
              setForm((f) => ({ ...f, name: e.target.value }));
            }}
          />
          <Textarea
            label="Description (optional)"
            minRows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <MultiSelect
            label="Required skills (optional)"
            placeholder="Choose from the church's existing volunteer skills"
            data={skillOptions}
            value={form.requiredSkills}
            onChange={(value) => setForm((f) => ({ ...f, requiredSkills: value }))}
            searchable
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeForm}>Cancel</Button>
            <Button onClick={handleSubmit} loading={isPending}>
              {form.id ? "Save" : "Create"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
