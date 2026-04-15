"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { BookOpen, Sparkles } from "lucide-react";

import { generateWisdomPromptAction } from "@/app/app/elders-actions";
import { ELDER_AI_DISCLAIMER } from "@/lib/elders-types";

// ── AI Wisdom Prompt Component ───────────────────────────────
// Surfaces relevant Scripture references and theological
// reflection questions for a discernment session.
//
// Guardrails enforced:
//   - Disclaimer displayed on EVERY AI output (§6)
//   - Output is read-only — no AI content is auto-saved
//   - Human review required before any content is shared
//   - Prompt sends topic only — no member data, notes, or
//     personally identifiable content ever leaves the boundary
// ─────────────────────────────────────────────────────────────

type WisdomResult = {
  disclaimer: string;
  scriptures: Array<{ reference: string; context: string }>;
  reflectionQuestions: string[];
  historicalNote: string | null;
};

export function AiWisdomPrompt({
  sessionId,
  sessionTitle,
}: {
  sessionId: string;
  sessionTitle: string;
}) {
  const [opened, { open, close }] = useDisclosure(false);
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState<WisdomResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    if (!topic.trim()) return;
    startTransition(async () => {
      try {
        const response = await generateWisdomPromptAction({
          sessionId,
          topic: topic.trim(),
        });
        setResult(response);
      } catch (err) {
        notifications.show({
          title: "Error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          color: "red",
        });
      }
    });
  }

  function handleClose() {
    setResult(null);
    setTopic("");
    close();
  }

  return (
    <>
      <Button
        size="xs"
        variant="light"
        color="violet"
        radius="xl"
        leftSection={<Sparkles size={12} />}
        onClick={open}
      >
        Scripture & Reflection Prompts
      </Button>

      <Modal
        opened={opened}
        onClose={handleClose}
        title="AI Wisdom Prompts"
        radius="lg"
        size="lg"
        centered
      >
        <Stack gap="md">
          {/* Permanent disclaimer — must appear before any AI content */}
          <Alert
            color="violet"
            variant="light"
            icon={<Sparkles size={14} />}
            radius="md"
          >
            <Text fz="xs">{ELDER_AI_DISCLAIMER}</Text>
          </Alert>

          {result === null ? (
            /* Input form — shown before generation */
            <>
              <Text fz="sm" c="dimmed">
                Describe the topic or question before your elders. The tool will surface relevant
                Scripture references and reflection questions — nothing more.
              </Text>
              <Text fz="xs" c="dimmed" fw={500}>
                Session: {sessionTitle}
              </Text>

              <Textarea
                label="Topic or question"
                placeholder="e.g. unity in a season of transition, leadership succession, church discipline..."
                value={topic}
                onChange={(e) => setTopic(e.currentTarget.value)}
                minRows={3}
                autosize
                radius="md"
              />

              <Text fz="xs" c="dimmed" fs="italic">
                Only your topic is sent — no member names, notes, or personal data are included.
              </Text>

              <Group justify="flex-end" gap="sm">
                <Button variant="default" radius="xl" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  color="violet"
                  radius="xl"
                  loading={isPending}
                  disabled={!topic.trim()}
                  leftSection={<Sparkles size={13} />}
                  onClick={handleGenerate}
                >
                  Surface resources
                </Button>
              </Group>
            </>
          ) : (
            /* Result display — shown after generation */
            <>
              {/* Disclaimer repeated on result per §6 */}
              <Text fz="xs" c="dimmed" fs="italic" ta="center">
                {result.disclaimer}
              </Text>

              <Divider label="Scripture References" labelPosition="center" />

              <Stack gap="sm">
                {result.scriptures.map((s) => (
                  <Paper key={s.reference} withBorder p="sm" radius="md">
                    <Group gap="sm" align="flex-start" wrap="nowrap">
                      <ThemeIcon variant="light" color="churchBlue" size="sm" radius="xl">
                        <BookOpen size={12} />
                      </ThemeIcon>
                      <Stack gap={2}>
                        <Text fz="sm" fw={600}>
                          {s.reference}
                        </Text>
                        <Text fz="xs" c="dimmed">
                          {s.context}
                        </Text>
                      </Stack>
                    </Group>
                  </Paper>
                ))}
              </Stack>

              <Divider label="Reflection Questions" labelPosition="center" />

              <Stack gap="xs">
                {result.reflectionQuestions.map((q, i) => (
                  <Paper key={i} withBorder p="sm" radius="md">
                    <Group gap="sm" align="flex-start" wrap="nowrap">
                      <Badge
                        size="sm"
                        color="violet"
                        variant="light"
                        radius="xl"
                        style={{ minWidth: 24, flexShrink: 0 }}
                      >
                        {i + 1}
                      </Badge>
                      <Text fz="sm">{q}</Text>
                    </Group>
                  </Paper>
                ))}
              </Stack>

              {result.historicalNote ? (
                <>
                  <Divider label="Historical Note" labelPosition="center" />
                  <Paper withBorder p="sm" radius="md" bg="var(--mantine-color-violet-0)">
                    <Text fz="xs" c="dimmed" fs="italic">
                      {result.historicalNote}
                    </Text>
                  </Paper>
                </>
              ) : null}

              <Text fz="xs" c="dimmed" ta="center">
                These resources are offered for reflection. Please pray, study, and discern together
                as a body — this output carries no spiritual authority.
              </Text>

              <Group justify="center" gap="sm">
                <Button
                  variant="light"
                  color="violet"
                  radius="xl"
                  onClick={() => setResult(null)}
                >
                  Try a different topic
                </Button>
                <Button variant="default" radius="xl" onClick={handleClose}>
                  Close
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>
    </>
  );
}
