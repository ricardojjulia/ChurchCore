"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { AlertCircle, CheckCircle } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import {
  closeOnboardingInstanceAction,
  completeOnboardingStepAction,
} from "@/app/app/church-admin/operations/actions";
import type { AuthSession } from "@/lib/auth";
import type { OnboardingInstanceDetail, OnboardingInstanceStep } from "@/lib/operations-types";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

function StatusBadge({ status }: { status: "open" | "closed" }) {
  return (
    <Badge color={status === "open" ? "green" : "gray"}>
      {status === "open" ? "Open" : "Closed"}
    </Badge>
  );
}

function StepRow({
  step,
  onComplete,
  isPending,
}: {
  step: OnboardingInstanceStep;
  onComplete: (stepId: string) => void;
  isPending: boolean;
}) {
  return (
    <Paper
      radius="md"
      p="md"
      withBorder
      style={{
        background: step.isComplete ? "rgba(20, 184, 166, 0.04)" : undefined,
        borderColor: step.isComplete ? "rgba(20, 184, 166, 0.25)" : undefined,
      }}
    >
      <Group align="flex-start" wrap="nowrap" gap="md">
        <Checkbox
          checked={step.isComplete}
          onChange={() => {
            if (!step.isComplete) onComplete(step.id);
          }}
          disabled={step.isComplete || isPending}
          size="md"
          color="teal"
          mt={2}
          aria-label={`Complete step: ${step.title}`}
        />
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group gap="sm" align="center" wrap="nowrap">
            <Text
              fw={600}
              size="sm"
              c={step.isComplete ? "#617184" : "#101827"}
              style={{ textDecoration: step.isComplete ? "line-through" : "none" }}
            >
              {step.title}
            </Text>
            <Badge
              color={step.assigneeType === "staff" ? "blue" : "teal"}
              size="xs"
              variant="light"
            >
              {step.assigneeType === "staff" ? "Staff" : "New Member"}
            </Badge>
          </Group>
          {step.description ? (
            <Text size="sm" c="#617184">
              {step.description}
            </Text>
          ) : null}
          {step.isComplete && step.completedAt ? (
            <Text size="xs" c="#9ca3af">
              Completed {formatDate(step.completedAt)}
            </Text>
          ) : null}
        </Stack>
        {step.isComplete ? <CheckCircle size={16} color="#14b8a6" style={{ flexShrink: 0 }} /> : null}
      </Group>
    </Paper>
  );
}

export function OperationsInstanceDetailClient({
  session,
  instance,
}: {
  session: AuthSession;
  instance: OnboardingInstanceDetail;
}) {
  const [isPending, startTransition] = useTransition();
  const [stepError, setStepError] = useState<string | null>(null);
  const [stepSuccess, setStepSuccess] = useState<string | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeSuccess, setCloseSuccess] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(instance.status);
  const [steps, setSteps] = useState<OnboardingInstanceStep[]>(instance.steps);

  function handleCompleteStep(stepId: string) {
    setStepError(null);
    setStepSuccess(null);
    startTransition(async () => {
      const result = await completeOnboardingStepAction({ instanceStepId: stepId });
      if (!result.ok) {
        setStepError(result.error ?? "Unable to complete step.");
        return;
      }
      setSteps((prev) =>
        prev.map((s) =>
          s.id === stepId
            ? { ...s, isComplete: true, completedAt: new Date().toISOString() }
            : s,
        ),
      );
      setStepSuccess("Step marked as complete.");
    });
  }

  function handleClose(e: React.FormEvent) {
    e.preventDefault();
    setCloseError(null);
    if (closeReason.trim().length < 5) {
      setCloseError("A reason of at least 5 characters is required.");
      return;
    }
    startTransition(async () => {
      const result = await closeOnboardingInstanceAction({
        instanceId: instance.id,
        reason: closeReason,
      });
      if (!result.ok) {
        setCloseError(result.error ?? "Unable to close onboarding.");
        return;
      }
      setCurrentStatus("closed");
      setCloseSuccess(true);
    });
  }

  const completedCount = steps.filter((s) => s.isComplete).length;

  return (
    <ApplicationShell
      session={session}
      workspaceHref={session.homePath}
      sectionLabel="Church Admin"
      title={instance.profileName}
      description={instance.templateName ?? "Onboarding"}
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
        {/* Header */}
        <Paper radius="md" p="lg" withBorder>
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
            <Stack gap={4}>
              <Group gap="sm" align="center">
                <Title order={3} fw={700} c="#101827">
                  {instance.profileName}
                </Title>
                <StatusBadge status={currentStatus} />
              </Group>
              {instance.templateName ? (
                <Text size="sm" c="#617184">
                  Template: {instance.templateName}
                </Text>
              ) : null}
              <Text size="sm" c="#617184">
                Started {formatDate(instance.createdAt)} &middot;{" "}
                {completedCount} of {steps.length} steps complete
              </Text>
            </Stack>
          </Group>
        </Paper>

        {/* Step feedback */}
        {stepError ? (
          <Alert color="red" icon={<AlertCircle size={16} />} withCloseButton onClose={() => setStepError(null)}>
            {stepError}
          </Alert>
        ) : null}
        {stepSuccess ? (
          <Alert color="teal" icon={<CheckCircle size={16} />} withCloseButton onClose={() => setStepSuccess(null)}>
            {stepSuccess}
          </Alert>
        ) : null}

        {/* Steps */}
        <Stack gap="sm">
          <Text fw={700} size="sm" c="#101827">
            Steps
          </Text>
          {steps.length === 0 ? (
            <Paper
              radius="md"
              p="xl"
              style={{ border: "1px dashed rgba(20, 33, 61, 0.15)", textAlign: "center" }}
            >
              <Text c="#617184" size="sm">
                No steps for this onboarding.
              </Text>
            </Paper>
          ) : null}
          {steps.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              onComplete={handleCompleteStep}
              isPending={isPending}
            />
          ))}
        </Stack>

        {/* Close success — rendered outside the open-only block so it survives the status transition */}
        {closeSuccess ? (
          <Alert color="teal" icon={<CheckCircle size={16} />}>
            Onboarding closed successfully.
          </Alert>
        ) : null}

        {/* Close section */}
        {currentStatus === "open" ? (
          <>
            <Divider />
            <Stack gap="sm">
              <Text fw={700} size="sm" c="#101827">
                Close onboarding
              </Text>
              <Text size="sm" c="#617184">
                Closing this onboarding will mark it as complete. Provide a reason below.
              </Text>

              {closeError ? (
                <Alert color="red" icon={<AlertCircle size={16} />}>
                  {closeError}
                </Alert>
              ) : null}

              {!closeSuccess ? (
                <form onSubmit={handleClose}>
                  <Stack gap="sm">
                    <Textarea
                      placeholder="Reason for closing (min. 5 characters)"
                      minRows={3}
                      value={closeReason}
                      onChange={(e) => setCloseReason(e.currentTarget.value)}
                    />
                    <Group>
                      <Button
                        type="submit"
                        color="red"
                        variant="light"
                        loading={isPending}
                        disabled={closeReason.trim().length < 5}
                      >
                        Close onboarding
                      </Button>
                    </Group>
                  </Stack>
                </form>
              ) : null}
            </Stack>
          </>
        ) : null}

        {currentStatus === "closed" && instance.closeReason ? (
          <Paper radius="md" p="md" withBorder style={{ background: "rgba(156, 163, 175, 0.06)" }}>
            <Text size="xs" fw={700} c="#617184" mb={4}>
              Closure reason
            </Text>
            <Text size="sm" c="#374151">
              {instance.closeReason}
            </Text>
            {instance.closedAt ? (
              <Text size="xs" c="#9ca3af" mt={4}>
                Closed {formatDate(instance.closedAt)}
              </Text>
            ) : null}
          </Paper>
        ) : null}
      </Stack>
    </ApplicationShell>
  );
}
