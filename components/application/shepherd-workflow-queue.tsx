"use client";

import { useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { HeartHandshake, RefreshCw, Sparkles, Users } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { ReadinessTargetState } from "@/components/application/readiness-target-state";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  ShepherdAssignee,
  ShepherdWorkflowQueueRow,
} from "@/lib/shepherd-ai/ops-data";
import {
  assignWorkflowAction,
  completeWorkflowAction,
  deferWorkflowAction,
  dismissWorkflowAction,
  promoteSuggestionToWorkflowAction,
  recordWorkflowFeedbackAction,
  runShepherdAiEvaluationAction,
} from "@/app/app/shepherd-ai-actions";

function urgencyColor(urgency: string) {
  if (urgency === "high") return "red";
  if (urgency === "medium") return "yellow";
  return "gray";
}

export function ShepherdWorkflowQueue({
  session,
  source,
  queue,
  assignees,
}: {
  session: ChurchAppSession;
  source: "preview" | "live";
  queue: ShepherdWorkflowQueueRow[];
  assignees: ShepherdAssignee[];
}) {
  const searchParams = useSearchParams();
  const isManager = session.appContext.roleId === "church-admin";
  const initialStatus = searchParams.get("status");

  const [urgency, setUrgency] = useState<"all" | "low" | "medium" | "high">("all");
  const [status, setStatus] = useState<
    "all" | "suggested" | "open" | "assigned" | "deferred" | "dismissed" | "completed"
  >(
    initialStatus &&
      ["suggested", "open", "assigned", "deferred", "dismissed", "completed"].includes(initialStatus)
      ? (initialStatus as "suggested" | "open" | "assigned" | "deferred" | "dismissed" | "completed")
      : "all",
  );
  const [workflowCode, setWorkflowCode] = useState<
    | "all"
    | "reconnect_inactive_member"
    | "volunteer_fatigue"
    | "first_time_visitor_follow_up"
    | "member_disengagement_trend"
  >("all");
  const [assigneeId, setAssigneeId] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  const visibleQueue = useMemo(() => {
    return queue.filter((item) => {
      if (urgency !== "all" && item.urgency !== urgency) return false;
      const effectiveStatus = item.workflowStatus ?? item.suggestionStatus;
      if (status !== "all" && effectiveStatus !== status) return false;
      if (workflowCode !== "all" && item.workflowCode !== workflowCode) return false;
      if (assigneeId !== "all" && item.assignedToUserId !== assigneeId) return false;
      return true;
    });
  }, [assigneeId, queue, status, urgency, workflowCode]);

  const pendingCount = visibleQueue.filter((item) =>
    ["suggested", "open", "assigned", "deferred"].includes(
      item.workflowStatus ?? item.suggestionStatus,
    ),
  ).length;

  const highCount = visibleQueue.filter((item) => item.urgency === "high").length;
  const readinessState =
    initialStatus === "open"
      ? source === "preview"
        ? {
            state: "no-backend" as const,
            title: "Readiness target unavailable",
            description:
              "Workflow readiness can be previewed, but live ShepherdAI queue checks need tenant data.",
            detail: "Configure the tenant backend before using this target to clear readiness.",
          }
        : visibleQueue.length === 0
          ? {
              state: "completed" as const,
              title: "Suggested workflow readiness is clear",
              description: "No open ministry workflow items currently need review.",
            }
          : {
              state: "validation-error" as const,
              title: "Open ministry workflows need review",
              description:
                "Assign, defer, dismiss, or complete the matching workflow items below before handoff.",
              detail: `${visibleQueue.length} workflow item${
                visibleQueue.length === 1 ? "" : "s"
              } still need review.`,
            }
      : source === "live" && queue.length === 0
        ? {
            state: "empty" as const,
            title: "No workflow suggestions yet",
            description:
              "Run a scheduled evaluation after tenant data is available to populate ministry workflow suggestions.",
          }
        : null;

  function runEvaluation() {
    startTransition(async () => {
      try {
        const result = await runShepherdAiEvaluationAction();
        notifications.show({
          title: "ShepherdAI evaluation completed",
          message: `${result.generatedSuggestions} suggestions generated from ${result.evaluatedEntities} entities.`,
          color: "teal",
        });
      } catch (error) {
        notifications.show({
          title: "Unable to run evaluation",
          message: error instanceof Error ? error.message : "An unexpected error occurred.",
          color: "red",
        });
      }
    });
  }

  function promoteSuggestion(suggestionId: string) {
    startTransition(async () => {
      try {
        await promoteSuggestionToWorkflowAction({ suggestionId });
        notifications.show({
          title: "Workflow created",
          message: "Suggestion was promoted to an active ministry workflow.",
          color: "teal",
        });
      } catch (error) {
        notifications.show({
          title: "Unable to create workflow",
          message: error instanceof Error ? error.message : "An unexpected error occurred.",
          color: "red",
        });
      }
    });
  }

  function assignWorkflow(workflowId: string, userId: string | null) {
    startTransition(async () => {
      try {
        await assignWorkflowAction({ workflowId, assignedToUserId: userId });
        notifications.show({
          title: "Workflow assignment updated",
          message: userId ? "Workflow has been assigned." : "Workflow assignment cleared.",
          color: "teal",
        });
      } catch (error) {
        notifications.show({
          title: "Unable to assign workflow",
          message: error instanceof Error ? error.message : "An unexpected error occurred.",
          color: "red",
        });
      }
    });
  }

  function deferWorkflow(workflowId: string) {
    startTransition(async () => {
      try {
        await deferWorkflowAction({
          workflowId,
          reason: "Deferred after review",
        });
        notifications.show({
          title: "Workflow deferred",
          message: "Workflow was deferred for later review.",
          color: "yellow",
        });
      } catch (error) {
        notifications.show({
          title: "Unable to defer workflow",
          message: error instanceof Error ? error.message : "An unexpected error occurred.",
          color: "red",
        });
      }
    });
  }

  function dismissWorkflow(item: ShepherdWorkflowQueueRow) {
    const workflowId = item.workflowId;
    if (!workflowId) return;

    startTransition(async () => {
      try {
        await dismissWorkflowAction({
          workflowId,
          suggestionId: item.id,
          reason: "Dismissed after human review",
        });
        notifications.show({
          title: "Workflow dismissed",
          message: "Workflow was dismissed and logged.",
          color: "gray",
        });
      } catch (error) {
        notifications.show({
          title: "Unable to dismiss workflow",
          message: error instanceof Error ? error.message : "An unexpected error occurred.",
          color: "red",
        });
      }
    });
  }

  function completeWorkflow(item: ShepherdWorkflowQueueRow) {
    const workflowId = item.workflowId;
    if (!workflowId) return;

    startTransition(async () => {
      try {
        await completeWorkflowAction({
          workflowId,
          suggestionId: item.id,
          notes: "Marked complete in workflow queue.",
        });
        await recordWorkflowFeedbackAction({
          workflowId,
          feedbackType: "helpful",
        });
        notifications.show({
          title: "Workflow completed",
          message: "Completion and feedback were recorded.",
          color: "teal",
        });
      } catch (error) {
        notifications.show({
          title: "Unable to complete workflow",
          message: error instanceof Error ? error.message : "An unexpected error occurred.",
          color: "red",
        });
      }
    });
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref={isManager ? "/app/church-admin" : "/app/pastor"}
      calendarHref="/app/calendar"
      sectionLabel="ShepherdAI"
      title="Suggested Ministry Workflows"
      description={session.appContext.church.name}
      sidebarTitle="ShepherdAI Ops"
      sidebarDescription="Explainable Ops-only workflow suggestions for human review."
      navLabel="Navigation"
      navItems={[
        {
          href: isManager ? "/app/church-admin" : "/app/pastor",
          label: "Home",
          description: "Workspace",
          icon: HeartHandshake,
        },
        {
          href: "/app/church-admin/ministry",
          label: "Ministry Forge",
          description: "Ministry dashboards",
          icon: Sparkles,
        },
        {
          href: "/app/church-admin/workflows",
          label: "Workflow Queue",
          description: "Suggested and active workflows",
          icon: Users,
          active: true,
        },
      ]}
      topActions={
        <Button
          leftSection={<RefreshCw size={16} />}
          variant="light"
          loading={isPending}
          onClick={runEvaluation}
        >
          Run scheduled evaluation
        </Button>
      }
    >
      <Stack gap="lg">
        <Alert color="blue" variant="light" title="ShepherdAI for ChurchCore Ops">
          This queue shows suggested ministry workflows from structured Ops signals. Suggestions are
          not diagnoses and require human review before action.
        </Alert>

        {initialStatus === "open" ? (
          <Paper withBorder radius="lg" p="md" bg="#f8fbff">
            <Group justify="space-between" gap="md">
              <div>
                <Text fw={700} size="sm">Readiness view: open ministry workflows.</Text>
                <Text size="sm" c="dimmed" mt={4}>
                  Assign, defer, dismiss, or complete open workflow items before handoff.
                </Text>
              </div>
              <Text component="a" href="/app/church-admin/readiness" size="sm" fw={700} c="churchBlue">
                Back to readiness
              </Text>
            </Group>
          </Paper>
        ) : null}

        {readinessState ? (
          <ReadinessTargetState
            {...readinessState}
            primaryAction={{ label: "Back to readiness", href: "/app/church-admin/readiness" }}
            secondaryAction={{ label: "All workflows", href: "/app/church-admin/workflows" }}
          />
        ) : null}

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          <Paper withBorder radius="xl" p="md">
            <Text size="xs" fw={700} tt="uppercase" c="dimmed">
              Visible items
            </Text>
            <Title order={3} mt={4}>
              {visibleQueue.length}
            </Title>
          </Paper>
          <Paper withBorder radius="xl" p="md">
            <Text size="xs" fw={700} tt="uppercase" c="dimmed">
              Pending
            </Text>
            <Title order={3} mt={4}>
              {pendingCount}
            </Title>
          </Paper>
          <Paper withBorder radius="xl" p="md">
            <Text size="xs" fw={700} tt="uppercase" c="dimmed">
              High urgency
            </Text>
            <Title order={3} mt={4}>
              {highCount}
            </Title>
          </Paper>
          <Paper withBorder radius="xl" p="md">
            <Text size="xs" fw={700} tt="uppercase" c="dimmed">
              Assignees
            </Text>
            <Title order={3} mt={4}>
              {assignees.length}
            </Title>
          </Paper>
        </SimpleGrid>

        <Paper withBorder radius="xl" p="lg">
          <Group grow>
            <Select
              label="Urgency"
              value={urgency}
              onChange={(value) =>
                setUrgency((value as "all" | "low" | "medium" | "high") ?? "all")
              }
              data={[
                { value: "all", label: "All urgencies" },
                { value: "high", label: "High" },
                { value: "medium", label: "Medium" },
                { value: "low", label: "Low" },
              ]}
            />
            <Select
              label="Status"
              value={status}
              onChange={(value) =>
                setStatus(
                  (value as
                    | "all"
                    | "suggested"
                    | "open"
                    | "assigned"
                    | "deferred"
                    | "dismissed"
                    | "completed") ?? "all",
                )
              }
              data={[
                { value: "all", label: "All statuses" },
                { value: "suggested", label: "Suggested" },
                { value: "open", label: "Open" },
                { value: "assigned", label: "Assigned" },
                { value: "deferred", label: "Deferred" },
                { value: "dismissed", label: "Dismissed" },
                { value: "completed", label: "Completed" },
              ]}
            />
            <Select
              label="Workflow type"
              value={workflowCode}
              onChange={(value) =>
                setWorkflowCode(
                  (value as
                    | "all"
                    | "reconnect_inactive_member"
                    | "volunteer_fatigue"
                    | "first_time_visitor_follow_up"
                    | "member_disengagement_trend") ?? "all",
                )
              }
              data={[
                { value: "all", label: "All workflows" },
                { value: "reconnect_inactive_member", label: "Reconnect inactive member" },
                { value: "volunteer_fatigue", label: "Volunteer fatigue" },
                { value: "first_time_visitor_follow_up", label: "First-time visitor follow-up" },
                { value: "member_disengagement_trend", label: "Member disengagement trend" },
              ]}
            />
            <Select
              label="Assignee"
              value={assigneeId}
              onChange={(value) => setAssigneeId(value ?? "all")}
              data={[
                { value: "all", label: "All assignees" },
                ...assignees.map((assignee) => ({
                  value: assignee.id,
                  label: assignee.fullName,
                })),
              ]}
            />
          </Group>
        </Paper>

        <Stack gap="md">
          {visibleQueue.length === 0 ? (
            <Paper withBorder radius="xl" p="xl">
              <Text c="dimmed" size="sm">
                No workflow suggestions match the current filters.
              </Text>
            </Paper>
          ) : (
            visibleQueue.map((item) => {
              const effectiveStatus = item.workflowStatus ?? item.suggestionStatus;
              return (
                <Paper key={item.id} withBorder radius="xl" p="lg">
                  <Stack gap="sm">
                    <Group justify="space-between" align="flex-start">
                      <div>
                        <Title order={4}>{item.title}</Title>
                        <Text size="sm" c="dimmed" mt={4}>
                          {item.summary}
                        </Text>
                      </div>
                      <Group gap="xs">
                        <Badge color={urgencyColor(item.urgency)} variant="light">
                          {item.urgency}
                        </Badge>
                        <Badge variant="outline">{effectiveStatus}</Badge>
                        <Badge variant="outline">{item.workflowCode}</Badge>
                      </Group>
                    </Group>

                    <Text size="sm" fw={600}>
                      Why this surfaced
                    </Text>
                    <Text size="sm" c="dimmed">
                      {Array.isArray(item.explanation.whySurfaced)
                        ? (item.explanation.whySurfaced as string[]).join(" ")
                        : "Structured Ops signals crossed configured thresholds."}
                    </Text>

                    <Text size="xs" c="dimmed" fs="italic">
                      {item.boundaryNote}
                    </Text>

                    <Group gap="xs" justify="space-between">
                      <Group gap="xs">
                        <Badge variant="outline">
                          Confidence {(item.confidenceScore * 100).toFixed(0)}%
                        </Badge>
                        {item.assigneeName ? (
                          <Badge variant="light">Assigned to {item.assigneeName}</Badge>
                        ) : null}
                      </Group>

                      <Group gap="xs">
                        {!item.workflowId ? (
                          <Button
                            size="xs"
                            onClick={() => promoteSuggestion(item.id)}
                            loading={isPending}
                          >
                            Promote to workflow
                          </Button>
                        ) : (
                          <>
                            <Select
                              size="xs"
                              placeholder="Assign follow-up"
                              w={180}
                              value={item.assignedToUserId ?? ""}
                              onChange={(value) => assignWorkflow(item.workflowId!, value || null)}
                              data={[
                                { value: "", label: "Unassigned" },
                                ...assignees.map((assignee) => ({
                                  value: assignee.id,
                                  label: assignee.fullName,
                                })),
                              ]}
                            />
                            <Button
                              size="xs"
                              variant="light"
                              color="yellow"
                              onClick={() => deferWorkflow(item.workflowId!)}
                              loading={isPending}
                            >
                              Defer
                            </Button>
                            <Button
                              size="xs"
                              variant="light"
                              color="gray"
                              onClick={() => dismissWorkflow(item)}
                              loading={isPending}
                            >
                              Dismiss
                            </Button>
                            <Button
                              size="xs"
                              color="teal"
                              onClick={() => completeWorkflow(item)}
                              loading={isPending}
                            >
                              Mark complete
                            </Button>
                          </>
                        )}
                      </Group>
                    </Group>

                    {item.workflowId ? (
                      <Textarea
                        size="xs"
                        label="Feedback note (optional)"
                        placeholder="Record quick context, outcomes, or tuning notes"
                        autosize
                        minRows={2}
                        onBlur={(event) => {
                          const notes = event.currentTarget.value.trim();
                          if (!notes || !item.workflowId) return;
                          startTransition(async () => {
                            try {
                              await recordWorkflowFeedbackAction({
                                workflowId: item.workflowId!,
                                feedbackType: "completed_with_adjustment",
                                notes,
                              });
                            } catch {
                              // Preserve lightweight UX; full errors surface on main actions.
                            }
                          });
                        }}
                      />
                    ) : null}
                  </Stack>
                </Paper>
              );
            })
          )}
        </Stack>
      </Stack>
    </ApplicationShell>
  );
}
