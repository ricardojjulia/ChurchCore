"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { BookOpen, BrainCircuit, Info, Lock, ScrollText } from "lucide-react";

import {
  generateBibleStudyAnswerAction,
} from "@/app/app/elders-actions";
import { ApplicationShell } from "@/components/application/app-shell";
import { DisclaimerGate } from "@/components/ai/disclaimer-gate";
import { AI_RESPONSE_FOOTER } from "@/lib/ai-ministry/ui-constants";
import type { BibleStudySections } from "@/app/app/elders-actions";
import type { ChurchAppSession } from "@/lib/auth";

const navItems = [
  {
    href: "/app/pastor",
    label: "Home",
    description: "Pastor overview",
    icon: BrainCircuit,
  },
  {
    href: "/app/elders/discernment",
    label: "Discernment Room",
    description: "Elder sessions",
    icon: Lock,
  },
  {
    href: "/app/council/forge",
    label: "Council Forge",
    description: "Collaborative notes",
    icon: ScrollText,
  },
  {
    href: "/app/pastor/bible-study",
    label: "Bible Study",
    description: "AI-assisted study tools",
    icon: BookOpen,
    active: true,
  },
];

export function BibleStudyClient({
  session,
}: {
  session: ChurchAppSession;
}) {
  const [query, setQuery] = useState("");
  const [sections, setSections] = useState<BibleStudySections | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disclaimerConfirmed, setDisclaimerConfirmed] = useState(false);
  const [showDisclaimerGate, setShowDisclaimerGate] = useState(false);
  const [isPending, startTransition] = useTransition();

  function runQuery() {
    setError(null);
    startTransition(async () => {
      const result = await generateBibleStudyAnswerAction({ query });
      if (result.ok) {
        setSections(result.sections);
      } else {
        setError(result.error);
      }
    });
  }

  function handleSubmit() {
    if (!query.trim() || isPending) return;

    const alreadyShown =
      typeof window !== "undefined" &&
      sessionStorage.getItem("ai_disclaimer_bible_study") === "shown";

    if (!alreadyShown && !disclaimerConfirmed) {
      setShowDisclaimerGate(true);
      return;
    }

    runQuery();
  }

  function handleDisclaimerConfirm() {
    setDisclaimerConfirmed(true);
    setShowDisclaimerGate(false);
    runQuery();
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/pastor"
      calendarHref="/app/calendar"
      sectionLabel="Pastor"
      title="Bible Study Q&A"
      description={session.appContext.church.name}
      sidebarTitle="Pastor Workspace"
      sidebarDescription="AI-assisted ministry tools for pastoral leadership."
      navLabel="Leadership"
      navItems={navItems}
    >
    <Stack gap="lg">
      {/* Header */}
      <Stack gap={4}>
        <Text fw={700} fz="xl" c="#101827">
          Bible Study Q&amp;A
        </Text>
        <Text fz="sm" c="dimmed">
          Enter a passage (e.g. Romans 8:1-11) or topic (e.g. forgiveness) for
          structured study analysis.
        </Text>
      </Stack>

      {/* Input form */}
      <Paper withBorder p="lg" radius="lg">
        <Stack gap="sm">
          <Textarea
            label="Passage or Topic"
            placeholder="e.g. Romans 8:28 or 'The Prodigal Son'"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            maxLength={500}
            autosize
            minRows={2}
            radius="md"
          />
          <Group justify="space-between" align="center">
            <Text fz="xs" c="dimmed">
              {query.length}/500
            </Text>
            <Button
              color="churchBlue"
              radius="xl"
              loading={isPending}
              disabled={query.trim().length === 0 || isPending}
              onClick={handleSubmit}
            >
              Ask
            </Button>
          </Group>
        </Stack>
      </Paper>

      {/* Disclaimer gate — rendered when needed */}
      {showDisclaimerGate ? (
        <DisclaimerGate
          featureKey="bible_study"
          onConfirm={handleDisclaimerConfirm}
        />
      ) : null}

      {/* Error */}
      {error ? (
        <Alert color="red" radius="md">
          {error}
        </Alert>
      ) : null}

      {/* Result area */}
      {sections ? (
        <Stack gap="md">
          {/* Context */}
          <Paper withBorder p="lg" radius="lg">
            <Stack gap="xs">
              <Text fw={600} fz="sm">
                Context
              </Text>
              <Text fz="sm">{sections.context}</Text>
            </Stack>
          </Paper>

          {/* Key Themes */}
          <Paper withBorder p="lg" radius="lg">
            <Stack gap="xs">
              <Text fw={600} fz="sm">
                Key Themes
              </Text>
              <Group gap="xs" wrap="wrap">
                {sections.keyThemes.map((theme) => (
                  <Badge key={theme} variant="light" color="blue" radius="sm">
                    {theme}
                  </Badge>
                ))}
              </Group>
            </Stack>
          </Paper>

          {/* Application Points */}
          <Paper withBorder p="lg" radius="lg">
            <Stack gap="xs">
              <Text fw={600} fz="sm">
                Application Points
              </Text>
              {sections.applicationPoints.map((point, i) => (
                <Text key={i} fz="sm">
                  {i + 1}. {point}
                </Text>
              ))}
            </Stack>
          </Paper>

          {/* Discussion Questions */}
          <Paper withBorder p="lg" radius="lg">
            <Stack gap="xs">
              <Text fw={600} fz="sm">
                Discussion Questions
              </Text>
              {sections.discussionQuestions.map((question, i) => (
                <Text key={i} fz="sm">
                  {i + 1}. {question}
                </Text>
              ))}
            </Stack>
          </Paper>

          {/* Footer */}
          <Alert color="gray" icon={<Info size={14} />} variant="light" radius="md">
            {AI_RESPONSE_FOOTER}
          </Alert>
        </Stack>
      ) : null}

      {/* Empty state — only when no result and not loading */}
      {!sections && !isPending && !error ? (
        <Paper withBorder p="xl" radius="lg">
          <Text fz="sm" c="dimmed" ta="center">
            Enter a passage or topic above to get started.
          </Text>
        </Paper>
      ) : null}
    </Stack>
    </ApplicationShell>
  );
}
