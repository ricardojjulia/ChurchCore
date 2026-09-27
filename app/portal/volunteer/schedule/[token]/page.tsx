import type { Metadata } from "next";
import { Paper, Stack, Text, Title, Badge, Button, Card, Group } from "@mantine/core";
import { Calendar, MapPin, CheckCircle, XCircle, HelpCircle } from "lucide-react";

import { getPublicVolunteerScheduleByToken, listBlockoutDatesByTokenAction } from "@/app/app/volunteer-actions";
import { BlockoutDatesPanel } from "@/components/application/blockout-dates-panel";
import { describePublicShift, type PublicShift } from "@/lib/volunteer-portal";

export const metadata: Metadata = {
  title: "Volunteer Schedule | ChurchCore",
  description: "View your upcoming volunteer schedules across ministries.",
};

export default async function VolunteerSchedulePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [shifts, blockoutDates] = await Promise.all([
    getPublicVolunteerScheduleByToken(token),
    listBlockoutDatesByTokenAction(token),
  ]);

  const statusIcons: Record<string, React.ReactNode> = {
    confirmed: <CheckCircle className="text-green-500" size={20} />,
    declined: <XCircle className="text-red-500" size={20} />,
    pending: <HelpCircle className="text-yellow-500" size={20} />,
  };

  const statusColors: Record<string, string> = {
    confirmed: "green",
    declined: "red",
    pending: "yellow",
  };

  return (
    <main className="portal-register-bg min-h-screen px-4 py-8">
      <div className="max-w-[720px] mx-auto">
        <Stack gap="lg">
          <div>
            <Text size="sm" fw={700} c="dimmed" tt="uppercase">
              Secure Public Portal
            </Text>
            <Title order={1} mt="xs">My Upcoming Volunteer Schedule</Title>
            <Text c="dimmed" mt="xs">
              Below is a consolidated list of your upcoming volunteer tasks. You can click on any pending shift to confirm or decline it.
            </Text>
          </div>

          {shifts.length === 0 ? (
            <Paper withBorder radius="xl" p="xl" ta="center" shadow="sm">
              <Text size="md" fw={600}>No Upcoming Assignments</Text>
              <Text size="sm" c="dimmed" mt="xs">
                You do not have any upcoming volunteer shifts scheduled, or the link has expired.
              </Text>
            </Paper>
          ) : (
            <Stack gap="md">
              {(shifts as PublicShift[]).map((shift) => {
                const { place: eventTitle, dateLabel: dateStr, timeLabel: timeString } = describePublicShift(shift);
                // Respond only with this shift's own, unexpired token: only reminders create
                // tokens today, and falling back to the page's token opened the wrong shift.
                const respondToken =
                  shift.confirmation_status !== "declined" &&
                  shift.confirmation_token &&
                  shift.confirmation_token_expires_at &&
                  new Date(shift.confirmation_token_expires_at) > new Date()
                    ? shift.confirmation_token
                    : null;

                return (
                  <Card key={shift.id} withBorder radius="md" padding="md" shadow="sm">
                    <Group justify="space-between" align="start" wrap="nowrap">
                      <Stack gap={4} style={{ flex: 1 }}>
                        <Group gap="xs">
                          <Text fw={700} size="md">
                            {shift.title}
                          </Text>
                          <Badge color={statusColors[shift.confirmation_status] ?? "gray"} variant="light" size="sm">
                            {shift.confirmation_status}
                          </Badge>
                        </Group>

                        <Group gap="sm" wrap="nowrap">
                          <MapPin size={15} className="text-gray-400" />
                          <Text size="sm" c="dimmed">
                            {eventTitle}
                          </Text>
                        </Group>

                        <Group gap="sm" wrap="nowrap">
                          <Calendar size={15} className="text-gray-400" />
                          <Text size="sm" c="dimmed">
                            {dateStr} ({timeString})
                          </Text>
                        </Group>
                      </Stack>

                      <Group gap="sm">
                        {statusIcons[shift.confirmation_status]}
                        {respondToken ? (
                          // component="a", not Link: this is a server component, and a
                          // function can't be passed to Mantine's client Button.
                          <Button
                            component="a"
                            href={`/portal/volunteer/confirm/${respondToken}`}
                            size="sm"
                            variant={shift.confirmation_status === "pending" ? "filled" : "light"}
                          >
                            {shift.confirmation_status === "pending" ? "Respond" : "Can't make it?"}
                          </Button>
                        ) : shift.confirmation_status !== "declined" ? (
                          <Text size="xs" c="dimmed" maw={140}>
                            To change this, contact your team leader.
                          </Text>
                        ) : null}
                      </Group>
                    </Group>
                  </Card>
                );
              })}
            </Stack>
          )}

          {/* Only for a valid, unexpired link (null otherwise). */}
          {blockoutDates ? (
            <BlockoutDatesPanel target={{ kind: "token", token }} initialDates={blockoutDates} />
          ) : (
            <Text size="sm" c="dimmed" ta="center">
              This link has expired or isn&apos;t valid. Ask your team leader to send you a new one.
            </Text>
          )}
        </Stack>
      </div>
    </main>
  );
}
