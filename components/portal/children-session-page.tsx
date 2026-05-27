import { Alert, Badge, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";

import type {
  PublicCcmSessionAvailability,
  PublicCcmSessionMode,
  PublicCcmSessionRecord,
} from "@/lib/ccm-public-data";

function stateColor(state: PublicCcmSessionAvailability["state"]) {
  if (state === "available") return "teal";
  if (state === "not-found") return "red";
  if (state === "no-backend") return "gray";
  return "orange";
}

function modeLabel(mode: PublicCcmSessionMode) {
  return mode === "checkin" ? "Check-In" : "Checkout";
}

export function ChildrenSessionPage({
  mode,
  record,
  availability,
}: {
  mode: PublicCcmSessionMode;
  record: PublicCcmSessionRecord | null;
  availability: PublicCcmSessionAvailability;
}) {
  return (
    <main className="portal-page-bg min-h-screen grid place-items-center px-4 py-8">
      <Paper withBorder radius="xl" p={{ base: "lg", sm: "xl" }} maw={760} w="100%">
        <Stack gap="lg">
          <div>
            <Text size="sm" fw={700} c="dimmed" tt="uppercase">
              Children Session {modeLabel(mode)}
            </Text>
            <Title order={1} mt="sm">
              {availability.title}
            </Title>
            <Text c="dimmed" mt="sm">
              {availability.detail}
            </Text>
          </div>

          {record ? (
            <Paper withBorder radius="lg" p="md">
              <Group justify="space-between" align="flex-start" gap="md">
                <Stack gap={4}>
                  <Text fw={700}>{record.churchName}</Text>
                  <Text size="sm">{record.serviceName}</Text>
                  <Text size="xs" c="dimmed">
                    Service date: {record.serviceDate}
                  </Text>
                </Stack>
                <Group gap="xs">
                  <Badge color={stateColor(availability.state)} variant="light">
                    {availability.state.replaceAll("-", " ")}
                  </Badge>
                  <Badge color="blue" variant="light">
                    session {record.sessionStatus}
                  </Badge>
                </Group>
              </Group>
            </Paper>
          ) : null}

          {availability.state === "available" ? (
            <Alert color="teal" radius="lg">
              Parent {modeLabel(mode).toLowerCase()} is enabled for this service session. Continue with on-site staff instructions.
            </Alert>
          ) : (
            <Alert color={stateColor(availability.state)} radius="lg">
              This link is intentionally safe-by-default and will not expose children workflows when the service session is unavailable.
            </Alert>
          )}

          <Group>
            <Button component="a" href="/portal" variant="default">
              Return to Portal
            </Button>
          </Group>
        </Stack>
      </Paper>
    </main>
  );
}
