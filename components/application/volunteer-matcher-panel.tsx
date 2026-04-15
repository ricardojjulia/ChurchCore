"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  AlertTriangle,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";

import {
  calculateBurnoutAlertsAction,
  suggestVolunteersAction,
} from "@/app/app/actions";
import {
  AiDisclaimer,
  BurnoutAlertCard,
  MatchSuggestionCard,
} from "@/components/application/match-suggestion-card";
import type { BurnoutAlert, VolunteerMatchSuggestion } from "@/lib/ministry-forge-types";

// ============================================================
// VolunteerMatcherPanel
// Full Phase 3 UI surface embedded in the Ministry Forge tabs.
//
// Sections:
//   1. Burnout Guardian — active unacknowledged alerts
//   2. Volunteer Matcher — AI suggestions with approve/reject
//
// AI guardrails enforced:
//   - Disclaimer shown above every AI section
//   - No suggestion is auto-applied; all require explicit approve
//   - Approve → reviewVolunteerMatchAction → profile_ministries
// ============================================================

export function VolunteerMatcherPanel({
  ministryId,
  initialSuggestions,
  initialBurnoutAlerts,
  isManager,
}: {
  ministryId: string;
  initialSuggestions: VolunteerMatchSuggestion[];
  initialBurnoutAlerts: BurnoutAlert[];
  isManager: boolean;
}) {
  const [suggestions, setSuggestions] = useState<VolunteerMatchSuggestion[]>(initialSuggestions);
  const [burnoutAlerts, setBurnoutAlerts] = useState<BurnoutAlert[]>(initialBurnoutAlerts);
  const [isMatching, startMatchTransition] = useTransition();
  const [isBurnoutCalc, startBurnoutTransition] = useTransition();

  // Keep state in sync if initial props change (after revalidation)
  useEffect(() => {
    setSuggestions(initialSuggestions);
  }, [initialSuggestions]);

  useEffect(() => {
    setBurnoutAlerts(initialBurnoutAlerts);
  }, [initialBurnoutAlerts]);

  function handleFindVolunteers() {
    startMatchTransition(async () => {
      try {
        await suggestVolunteersAction({ ministryId });
        notifications.show({
          title: "Suggestions generated",
          message:
            "Volunteer candidates have been scored and are ready for your review.",
          color: "teal",
        });
      } catch (err) {
        notifications.show({
          title: "Error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          color: "red",
        });
      }
    });
  }

  function handleRecalculateBurnout() {
    startBurnoutTransition(async () => {
      try {
        await calculateBurnoutAlertsAction({ ministryId });
        notifications.show({
          title: "Burnout check complete",
          message: "Alerts have been updated based on current ministry loads.",
          color: "blue",
        });
      } catch (err) {
        notifications.show({
          title: "Error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          color: "red",
        });
      }
    });
  }

  const pendingSuggestions = suggestions.filter((s) => s.status === "pending");
  const highAlerts = burnoutAlerts.filter((a) => a.severity === "high");
  const otherAlerts = burnoutAlerts.filter((a) => a.severity !== "high");

  return (
    <Stack gap="lg">
      {/* ── Burnout Guardian ──────────────────────────────── */}
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" mb="md">
          <Group gap="xs">
            <ThemeIcon variant="light" color="orange" size="md" radius="xl">
              <ShieldCheck size={16} />
            </ThemeIcon>
            <Text fw={600} fz="sm">
              Burnout Guardian
            </Text>
            {burnoutAlerts.length > 0 && (
              <Badge color="orange" size="sm" variant="filled">
                {burnoutAlerts.length} alert{burnoutAlerts.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </Group>
          {isManager && (
            <Button
              size="xs"
              variant="light"
              color="orange"
              leftSection={isBurnoutCalc ? <Loader size={11} /> : <RefreshCw size={12} />}
              loading={isBurnoutCalc}
              onClick={handleRecalculateBurnout}
            >
              Re-evaluate
            </Button>
          )}
        </Group>

        {burnoutAlerts.length === 0 ? (
          <Text fz="sm" c="dimmed" ta="center" py="sm">
            No active burnout alerts. Ministry load looks healthy.
          </Text>
        ) : (
          <Stack gap="xs">
            {highAlerts.length > 0 && (
              <>
                <Group gap="xs">
                  <AlertTriangle size={13} color="var(--mantine-color-red-6)" />
                  <Text fz="xs" fw={600} c="red">
                    High severity
                  </Text>
                </Group>
                {highAlerts.map((alert) => (
                  <BurnoutAlertCard
                    key={alert.id}
                    alert={alert}
                    onAcknowledged={() =>
                      setBurnoutAlerts((prev) => prev.filter((a) => a.id !== alert.id))
                    }
                  />
                ))}
              </>
            )}
            {otherAlerts.length > 0 && (
              <>
                {highAlerts.length > 0 && <Divider my="xs" />}
                {otherAlerts.map((alert) => (
                  <BurnoutAlertCard
                    key={alert.id}
                    alert={alert}
                    onAcknowledged={() =>
                      setBurnoutAlerts((prev) => prev.filter((a) => a.id !== alert.id))
                    }
                  />
                ))}
              </>
            )}
          </Stack>
        )}

        <Text fz="xs" c="dimmed" mt="md">
          Thresholds: &gt;3 ministries = medium alert, &gt;5 ministries = high alert.
          Alerts clear when acknowledged or when load drops.
        </Text>
      </Paper>

      {/* ── AI Volunteer Matcher ───────────────────────────── */}
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" mb="xs">
          <Group gap="xs">
            <ThemeIcon variant="light" color="violet" size="md" radius="xl">
              <Users size={16} />
            </ThemeIcon>
            <Text fw={600} fz="sm">
              Volunteer Matcher
            </Text>
            {pendingSuggestions.length > 0 && (
              <Badge color="violet" size="sm" variant="light">
                {pendingSuggestions.length} pending
              </Badge>
            )}
          </Group>
          {isManager && (
            <Button
              size="xs"
              variant="light"
              color="violet"
              leftSection={isMatching ? <Loader size={11} /> : <Search size={12} />}
              loading={isMatching}
              onClick={handleFindVolunteers}
            >
              Find Volunteers
            </Button>
          )}
        </Group>

        {/* Persistent AI disclaimer */}
        <AiDisclaimer />

        {pendingSuggestions.length === 0 ? (
          <Alert color="gray" variant="light" mt="md" radius="md">
            <Text fz="sm" c="dimmed" ta="center">
              No suggestions yet — pray and try matching.
            </Text>
          </Alert>
        ) : (
          <Stack gap="sm" mt="md">
            {pendingSuggestions.map((suggestion) => (
              <MatchSuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onReviewed={() =>
                  setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id))
                }
              />
            ))}
          </Stack>
        )}

        <Text fz="xs" c="dimmed" mt="md">
          Candidates are scored by spiritual gift alignment, ministry interests, and
          current serving load. Only members with contact permission are included.
          All suggestions require your approval before any assignment is made.
        </Text>
      </Paper>
    </Stack>
  );
}
