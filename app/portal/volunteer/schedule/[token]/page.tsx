import type { Metadata } from "next";
import { Paper, Stack, Text, Title, Badge, Card, Group } from "@mantine/core";
import { Calendar, MapPin, CheckCircle, XCircle, HelpCircle } from "lucide-react";
import Link from "next/link";

import { getPublicVolunteerScheduleByToken } from "@/app/app/volunteer-actions";

interface ScheduleShift {
  id: string;
  title: string;
  confirmation_status: string;
  starts_at: string;
  ends_at: string;
  events: {
    title: string;
    description: string | null;
    start: string;
    end: string;
    category: string;
  } | {
    title: string;
    description: string | null;
    start: string;
    end: string;
    category: string;
  }[] | null;
  service_plans: {
    name: string;
    service_date: string;
    service_time: string | null;
  } | {
    name: string;
    service_date: string;
    service_time: string | null;
  }[] | null;
}

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
  const shifts = await getPublicVolunteerScheduleByToken(token);

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
              {shifts.map((shift: ScheduleShift) => {
                const rawEvent = Array.isArray(shift.events) ? shift.events[0] : shift.events;
                const rawPlan = Array.isArray(shift.service_plans) ? shift.service_plans[0] : shift.service_plans;

                const eventTitle = rawEvent?.title || rawPlan?.name || "Church Service";
                const dateStr = rawPlan?.service_date
                  ? new Date(rawPlan.service_date + "T00:00:00").toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })
                  : rawEvent?.start
                  ? new Date(rawEvent.start).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })
                  : "TBD";

                const timeString = rawEvent
                  ? `${new Date(rawEvent.start).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })} - ${new Date(rawEvent.end).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : rawPlan?.service_time
                  ? new Date(`2000-01-01T${rawPlan.service_time}`).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "TBD";

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
                        {shift.confirmation_status === "pending" && (
                          <Link href={`/portal/volunteer/confirm/${token}`} passHref>
                            <Badge color="blue" variant="filled" style={{ cursor: "pointer" }}>
                              Respond
                            </Badge>
                          </Link>
                        )}
                      </Group>
                    </Group>
                  </Card>
                );
              })}
            </Stack>
          )}
        </Stack>
      </div>
    </main>
  );
}
