"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Alert,
  Button,
  Group,
  NativeSelect,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { AlertCircle, ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import {
  createOnboardingTemplateAction,
  updateOnboardingTemplateAction,
} from "@/app/app/church-admin/operations/actions";
import type { AuthSession } from "@/lib/auth";
import type { OnboardingTemplate, OnboardingTemplateStep } from "@/lib/operations-types";

type StepDraft = {
  id: string; // local draft ID (may be "new-{n}" for new steps)
  title: string;
  description: string;
  assigneeType: "staff" | "new_member";
};

function newStep(index: number): StepDraft {
  return {
    id: `new-${Date.now()}-${index}`,
    title: "",
    description: "",
    assigneeType: "staff",
  };
}

export function OperationsOnboardingTemplateFormClient({
  session,
  initialValues,
}: {
  session: AuthSession;
  initialValues?: { template: OnboardingTemplate; steps: OnboardingTemplateStep[] };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!initialValues;

  const [name, setName] = useState(initialValues?.template.name ?? "");
  const [steps, setSteps] = useState<StepDraft[]>(() => {
    if (initialValues?.steps && initialValues.steps.length > 0) {
      return initialValues.steps.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description ?? "",
        assigneeType: s.assigneeType,
      }));
    }
    return [newStep(0)];
  });

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    steps?: string;
    stepTitles?: Record<string, string>;
  }>({});

  const pageTitle = isEdit ? "Edit onboarding template" : "New onboarding template";

  function validate() {
    const errors: typeof fieldErrors = {};
    if (!name.trim()) errors.name = "Template name is required.";
    if (steps.length < 1) errors.steps = "At least one step is required.";

    const stepTitleErrors: Record<string, string> = {};
    steps.forEach((s) => {
      if (!s.title.trim()) {
        stepTitleErrors[s.id] = "Step title is required.";
      }
    });
    if (Object.keys(stepTitleErrors).length > 0) {
      errors.stepTitles = stepTitleErrors;
    }

    return errors;
  }

  function addStep() {
    setSteps((prev) => [...prev, newStep(prev.length)]);
  }

  function removeStep(id: string) {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }

  function updateStep(id: string, patch: Partial<StepDraft>) {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

  function moveStep(index: number, direction: "up" | "down") {
    const next = [...steps];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= next.length) return;
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    setSteps(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    const stepPayload = steps.map((s, idx) => ({
      title: s.title.trim(),
      description: s.description.trim() || null,
      assigneeType: s.assigneeType,
      sortOrder: idx + 1,
    }));

    startTransition(async () => {
      if (isEdit && initialValues) {
        const result = await updateOnboardingTemplateAction({
          id: initialValues.template.id,
          name: name.trim(),
          steps: stepPayload,
        });
        if (!result.ok) {
          setError(result.error ?? "Unable to update template.");
          return;
        }
      } else {
        const result = await createOnboardingTemplateAction({
          name: name.trim(),
          steps: stepPayload,
        });
        if (!result.ok) {
          setError(result.error ?? "Unable to create template.");
          return;
        }
      }
      router.push("/app/church-admin/operations/onboarding");
    });
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref={session.homePath}
      sectionLabel="Church Admin"
      title={pageTitle}
      description="Configure template name and steps"
      sidebarTitle="Operations"
      sidebarDescription="Documents & onboarding"
      navItems={[
        {
          href: "/app/church-admin/operations/documents",
          label: "Documents",
          description: "Church documents library",
          icon: "ClipboardList",
        },
        {
          href: "/app/church-admin/operations/onboarding",
          label: "Onboarding",
          description: "Templates & active onboarding",
          icon: "UserPlus",
          active: true,
        },
      ]}
    >
      <Stack gap="lg" maw={760}>
        <Title order={2} fw={700} c="#101827">
          {pageTitle}
        </Title>

        {error ? (
          <Alert color="red" icon={<AlertCircle size={16} />}>
            {error}
          </Alert>
        ) : null}

        <form onSubmit={handleSubmit}>
          <Stack gap="lg">
            <Paper radius="md" p="lg" withBorder>
              <TextInput
                label="Template name"
                placeholder="e.g. New Member Onboarding"
                required
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                error={fieldErrors.name}
              />
            </Paper>

            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Text fw={700} size="sm" c="#101827">
                  Steps
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  color="teal"
                  leftSection={<Plus size={14} />}
                  onClick={addStep}
                  type="button"
                >
                  Add step
                </Button>
              </Group>

              {fieldErrors.steps ? (
                <Alert color="red" icon={<AlertCircle size={14} />} p="xs">
                  <Text size="xs">{fieldErrors.steps}</Text>
                </Alert>
              ) : null}

              {steps.map((step, idx) => (
                <Paper key={step.id} radius="md" p="md" withBorder>
                  <Stack gap="sm">
                    <Group justify="space-between" align="center">
                      <Text size="xs" fw={700} c="#617184" tt="uppercase">
                        Step {idx + 1}
                      </Text>
                      <Group gap={4}>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="gray"
                          p={4}
                          disabled={idx === 0}
                          onClick={() => moveStep(idx, "up")}
                          type="button"
                          aria-label="Move step up"
                        >
                          <ArrowUp size={14} />
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="gray"
                          p={4}
                          disabled={idx === steps.length - 1}
                          onClick={() => moveStep(idx, "down")}
                          type="button"
                          aria-label="Move step down"
                        >
                          <ArrowDown size={14} />
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          p={4}
                          onClick={() => removeStep(step.id)}
                          type="button"
                          aria-label="Remove step"
                          disabled={steps.length === 1}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </Group>
                    </Group>

                    <TextInput
                      label="Title"
                      placeholder="Step title"
                      required
                      value={step.title}
                      onChange={(e) =>
                        updateStep(step.id, { title: e.currentTarget.value })
                      }
                      error={fieldErrors.stepTitles?.[step.id]}
                    />

                    <Textarea
                      label="Description"
                      placeholder="Optional description"
                      minRows={2}
                      autosize
                      value={step.description}
                      onChange={(e) =>
                        updateStep(step.id, { description: e.currentTarget.value })
                      }
                    />

                    <NativeSelect
                      label="Assignee type"
                      data={[
                        { value: "staff", label: "Staff" },
                        { value: "new_member", label: "New Member" },
                      ]}
                      value={step.assigneeType}
                      onChange={(e) =>
                        updateStep(step.id, {
                          assigneeType: e.currentTarget.value as "staff" | "new_member",
                        })
                      }
                    />
                  </Stack>
                </Paper>
              ))}
            </Stack>

            <Group justify="flex-end" gap="sm" pt="sm">
              <Button
                variant="default"
                component={Link}
                href="/app/church-admin/operations/onboarding"
                type="button"
              >
                Cancel
              </Button>
              <Button type="submit" color="teal" loading={isPending}>
                {isEdit ? "Save changes" : "Create template"}
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </ApplicationShell>
  );
}
