"use client";

import { useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  RingProgress,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { AlertCircle, CheckCircle2, Sparkles, User, XCircle } from "lucide-react";

import {
  acknowledgeBurnoutAlertAction,
  reviewVolunteerMatchAction,
} from "@/app/app/actions";
import type { BurnoutAlert, VolunteerMatchSuggestion } from "@/lib/ministry-forge-types";
import { AI_ASSISTIVE_DISCLAIMER, burnoutSeverity } from "@/lib/ministry-forge-types";

// ── MatchSuggestionCard ──────────────────────────────────────
// Displays a single AI-generated volunteer match suggestion.
// Shows match score, reason, gifts, and Approve / Reject actions.
// Requires human action before any assignment is made.
// ─────────────────────────────────────────────────────────────

const SCORE_COLOR = (score: number) => {
  if (score >= 70) return "teal";
  if (score >= 40) return "yellow";
  return "gray";
};

export function MatchSuggestionCard({
  suggestion,
  onReviewed,
}: {
  suggestion: VolunteerMatchSuggestion;
  onReviewed?: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDecision(decision: "approved" | "rejected") {
    startTransition(async () => {
      try {
        await reviewVolunteerMatchAction({
          suggestionId: suggestion.id,
          decision,
          ministryRole: "member",
        });
        notifications.show({
          title: decision === "approved" ? "Volunteer assigned" : "Suggestion dismissed",
          message:
            decision === "approved"
              ? `${suggestion.profileName} has been added to the ministry roster.`
              : `${suggestion.profileName} has been removed from suggestions.`,
          color: decision === "approved" ? "teal" : "gray",
        });
        onReviewed?.();
      } catch (err) {
        notifications.show({
          title: "Error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          color: "red",
        });
      }
    });
  }

  const severityColor = burnoutSeverity(suggestion.currentLoad);

  return (
    <Paper withBorder p="md" radius="md">
      <Group align="flex-start" wrap="nowrap">
        {/* Score ring */}
        <RingProgress
          size={64}
          thickness={6}
          sections={[{ value: suggestion.matchScore, color: SCORE_COLOR(suggestion.matchScore) }]}
          label={
            <Text ta="center" fz={11} fw={700} c="dimmed">
              {Math.round(suggestion.matchScore)}
            </Text>
          }
        />

        <Stack gap={6} style={{ flex: 1 }}>
          {/* Name row */}
          <Group gap="xs" align="center">
            <ThemeIcon variant="light" color="gray" size="sm" radius="xl">
              <User size={12} />
            </ThemeIcon>
            <Text fw={600} fz="sm">
              {suggestion.profileName}
            </Text>
            {severityColor && (
              <Badge color={severityColor === "high" ? "red" : "orange"} size="xs" variant="light">
                {suggestion.currentLoad} ministries
              </Badge>
            )}
            {suggestion.aiGenerated && (
              <Badge
                leftSection={<Sparkles size={9} />}
                color="violet"
                size="xs"
                variant="light"
              >
                AI suggested
              </Badge>
            )}
          </Group>

          {/* Reason */}
          {suggestion.reasonText && (
            <Text fz="xs" c="dimmed" style={{ fontStyle: "italic" }}>
              {suggestion.reasonText}
            </Text>
          )}

          {/* Spiritual gifts */}
          {suggestion.spiritualGifts && suggestion.spiritualGifts.length > 0 && (
            <Group gap={4} wrap="wrap">
              {suggestion.spiritualGifts.map((gift) => (
                <Badge key={gift} size="xs" variant="dot" color="churchBlue">
                  {gift}
                </Badge>
              ))}
            </Group>
          )}

          {/* Actions */}
          <Group gap="xs" mt={4}>
            <Button
              size="xs"
              color="teal"
              variant="light"
              leftSection={<CheckCircle2 size={13} />}
              loading={isPending}
              onClick={() => handleDecision("approved")}
            >
              Approve & Assign
            </Button>
            <Button
              size="xs"
              color="red"
              variant="subtle"
              leftSection={<XCircle size={13} />}
              loading={isPending}
              onClick={() => handleDecision("rejected")}
            >
              Dismiss
            </Button>
          </Group>
        </Stack>
      </Group>
    </Paper>
  );
}

// ── BurnoutAlertCard ─────────────────────────────────────────
// Inline alert card for a single burnout alert, with
// acknowledge button.
// ─────────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<string, string> = {
  high: "red",
  medium: "orange",
  low: "yellow",
};

export function BurnoutAlertCard({
  alert,
  onAcknowledged,
}: {
  alert: BurnoutAlert;
  onAcknowledged?: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleAcknowledge() {
    startTransition(async () => {
      try {
        await acknowledgeBurnoutAlertAction({ alertId: alert.id });
        notifications.show({
          title: "Alert acknowledged",
          message: `The burnout alert for ${alert.profileName} has been noted.`,
          color: "gray",
        });
        onAcknowledged?.();
      } catch (err) {
        notifications.show({
          title: "Error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          color: "red",
        });
      }
    });
  }

  return (
    <Alert
      color={SEVERITY_COLOR[alert.severity] ?? "orange"}
      icon={<AlertCircle size={16} />}
      radius="md"
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={2} style={{ flex: 1 }}>
          <Text fz="sm" fw={600}>
            {alert.profileName}
          </Text>
          <Text fz="xs">{alert.message}</Text>
        </Stack>
        <Button
          size="xs"
          variant="subtle"
          color="gray"
          loading={isPending}
          onClick={handleAcknowledge}
        >
          Acknowledge
        </Button>
      </Group>
    </Alert>
  );
}

// ── AI disclaimer banner ─────────────────────────────────────
export function AiDisclaimer() {
  return (
    <Alert
      color="violet"
      icon={<Sparkles size={14} />}
      radius="md"
      variant="light"
      fz="xs"
    >
      <Text fz="xs" c="dimmed">
        {AI_ASSISTIVE_DISCLAIMER}
      </Text>
    </Alert>
  );
}
