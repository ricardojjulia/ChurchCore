"use client";

import Link from "next/link";
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
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  AlertTriangle,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { CcmRoomCard } from "@/components/application/ccm-room-card";
import { ccmNavItems } from "@/components/application/ccm-nav";
import { ReadinessTargetState } from "@/components/application/readiness-target-state";
import type { ChurchAppSession } from "@/lib/auth";
import type { CcmDashboardData, CcmService } from "@/lib/ccm-types";

interface Props {
  session: ChurchAppSession;
  dashboard: CcmDashboardData | null;
  services: CcmService[];
  activeServiceId: string | null;
  readinessView?: boolean;
  dataSource?: "preview" | "live";
}

export function CcmDashboardView({
  session,
  dashboard,
  services,
  activeServiceId,
  readinessView = false,
  dataSource = "live",
}: Props) {
  const serviceOptions = services.map((s) => ({
    value: s.id,
    label: `${s.serviceName} — ${s.serviceDate} (${s.status})`,
  }));

  const anyRatioAlert = dashboard?.roomStatuses.some((r) => r.ratioStatus === "alert");
  const anyRatioWarning = dashboard?.roomStatuses.some((r) => r.ratioStatus === "warning");
  const twoAdultViolations = dashboard?.roomStatuses.filter((r) => !r.twoAdultRuleMet) ?? [];
  const expiredChecks = dashboard?.roomStatuses.filter((r) => r.hasExpiredBackgroundChecks) ?? [];
  const readinessIssueCount =
    (dashboard ? 0 : 1) +
    (anyRatioAlert ? 1 : 0) +
    (anyRatioWarning ? 1 : 0) +
    twoAdultViolations.length +
    expiredChecks.length +
    (dashboard?.openIncidents.length ?? 0);
  const readinessState =
    dataSource === "preview"
      ? {
          state: "no-backend" as const,
          title: "Children's readiness target unavailable",
          description:
            "Children's ministry readiness can be previewed, but live service, room, volunteer, incident, and pickup checks need tenant data.",
          detail: "Configure the tenant backend before using this target to clear readiness.",
        }
      : services.length === 0 || !dashboard
        ? {
            state: "empty" as const,
            title: "No children's service is open",
            description:
              "Open a children's ministry service before check-in so room ratios, two-adult coverage, incidents, and volunteer safety can be verified.",
          }
        : readinessIssueCount === 0
          ? {
              state: "completed" as const,
              title: "Children's ministry readiness is clear",
              description:
                "The active service has no open safety, ratio, two-adult, incident, or background-check gaps.",
            }
          : {
              state: "validation-error" as const,
              title: "Children's ministry safety needs attention",
              description:
                "Resolve the service, volunteer, incident, room-ratio, or background-check gaps before marking children readiness complete.",
              detail: `${readinessIssueCount} item${readinessIssueCount === 1 ? "" : "s"} need review.`,
            };

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Children's Ministry"
      title="Live Dashboard"
      description={session.appContext.church?.name ?? ""}
      sidebarTitle="Children's Ministry"
      sidebarDescription="Check-in, safety & roster"
      navLabel="CCM"
      navItems={ccmNavItems("/app/church-admin/children/dashboard")}
    >
      <Stack gap="lg">
        {/* Service selector + actions */}
        <Group justify="space-between" wrap="nowrap">
          <Select
            data={serviceOptions}
            value={activeServiceId}
            placeholder="No active service"
            style={{ flex: 1, maxWidth: 400 }}
            readOnly
          />
          <Group gap="xs">
            <Button
              component={Link}
              href="/app/church-admin/children/services/new"
              leftSection={<Plus size={14} />}
              variant="filled"
              color="churchBlue"
              size="sm"
            >
              Open Service
            </Button>
            <Button
              component={Link}
              href="/app/church-admin/children/checkin"
              leftSection={<Users size={14} />}
              variant="light"
              size="sm"
            >
              Check In
            </Button>
            <Button
              component={Link}
              href="/app/church-admin/children/checkout"
              leftSection={<ShieldCheck size={14} />}
              variant="light"
              size="sm"
            >
              Pick Up
            </Button>
          </Group>
        </Group>

        {readinessView ? (
          <>
            <Paper withBorder radius="lg" p="md" bg="#f8fbff">
              <Group justify="space-between" gap="md" align="flex-start">
                <div>
                  <Text fw={700} size="sm">
                    Readiness view: children&apos;s ministry safety checks.
                  </Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    {readinessIssueCount > 0
                      ? `${readinessIssueCount} item${readinessIssueCount === 1 ? "" : "s"} need review before check-in is ready.`
                      : "Open service, room ratios, two-adult coverage, incidents, and background checks are clear."}
                  </Text>
                </div>
                <Group gap="md">
                  <Text component={Link} href="/app/church-admin/children/services" size="sm" fw={700} c="churchBlue">
                    Services
                  </Text>
                  <Text component={Link} href="/app/church-admin/children/volunteers" size="sm" fw={700} c="churchBlue">
                    Volunteers
                  </Text>
                  <Text component={Link} href="/app/church-admin/children/incidents" size="sm" fw={700} c="churchBlue">
                    Incidents
                  </Text>
                  <Text component={Link} href="/app/church-admin/readiness" size="sm" fw={700} c="churchBlue">
                    Back to readiness
                  </Text>
                </Group>
              </Group>
            </Paper>
            <ReadinessTargetState
              {...readinessState}
              primaryAction={{ label: "Back to readiness", href: "/app/church-admin/readiness" }}
              secondaryAction={{ label: "Open services", href: "/app/church-admin/children/services" }}
            />
          </>
        ) : null}

        {/* Safety alert banners */}
        {anyRatioAlert && (
          <Alert
            color="red"
            icon={<ShieldAlert size={18} />}
            title="Safety Alert — Ratio Exceeded"
          >
            One or more rooms are over the target child-to-leader ratio. Dispatch a volunteer
            immediately.
            <Group mt="sm">
              <Button component={Link} href="/app/church-admin/children/volunteers" size="xs" variant="light" color="red">
                Assign volunteers
              </Button>
              <Button component={Link} href="/app/church-admin/children/rooms" size="xs" variant="default">
                Review rooms
              </Button>
            </Group>
          </Alert>
        )}
        {!anyRatioAlert && anyRatioWarning && (
          <Alert
            color="orange"
            icon={<AlertTriangle size={18} />}
            title="Ratio Warning"
          >
            One or more rooms are approaching the ratio limit. Consider deploying a volunteer
            proactively.
            <Group mt="sm">
              <Button component={Link} href="/app/church-admin/children/volunteers" size="xs" variant="light" color="orange">
                Assign volunteers
              </Button>
              <Button component={Link} href="/app/church-admin/children/rooms" size="xs" variant="default">
                Review rooms
              </Button>
            </Group>
          </Alert>
        )}
        {twoAdultViolations.length > 0 && (
          <Alert
            color="red"
            icon={<ShieldAlert size={18} />}
            title="Two-Adult Rule Violation"
          >
            {twoAdultViolations.map((r) => r.room.name).join(", ")}{" "}
            {twoAdultViolations.length === 1 ? "does" : "do"} not have two confirmed adult
            volunteers. This violates safe-church policy.
            <Group mt="sm">
              <Button component={Link} href="/app/church-admin/children/volunteers" size="xs" variant="light" color="red">
                Confirm volunteers
              </Button>
              <Button component={Link} href="/app/church-admin/children/services" size="xs" variant="default">
                Open services
              </Button>
            </Group>
          </Alert>
        )}
        {readinessView && expiredChecks.length > 0 ? (
          <Alert
            color="orange"
            icon={<AlertTriangle size={18} />}
            title="Background Check Review"
          >
            {expiredChecks.map((r) => r.room.name).join(", ")}{" "}
            {expiredChecks.length === 1 ? "has" : "have"} missing or expired volunteer background-check coverage.
            <Group mt="sm">
              <Button component={Link} href="/app/church-admin/children/volunteers" size="xs" variant="light" color="orange">
                Review volunteers
              </Button>
              <Button component={Link} href="/app/church-admin/children/settings" size="xs" variant="default">
                Safety settings
              </Button>
            </Group>
          </Alert>
        ) : null}

        {!dashboard ? (
          <Paper withBorder p="xl" ta="center" radius="xl">
            <ThemeIcon size="xl" variant="light" color="churchBlue" radius="xl" mx="auto">
              <ShieldCheck size={24} />
            </ThemeIcon>
            <Title order={4} mt="md">No Active Service</Title>
            <Text size="sm" c="dimmed" mt="xs">
              Open a service session to begin tracking children and volunteers.
            </Text>
            <Button
              component={Link}
              href="/app/church-admin/children/services/new"
              mt="md"
              variant="filled"
              color="churchBlue"
              leftSection={<Plus size={14} />}
            >
              Open Service
            </Button>
          </Paper>
        ) : (
          <>
            {/* Summary strip */}
            <Group gap="md">
              <Paper withBorder p="md" radius="lg" ta="center" style={{ minWidth: 100 }}>
                <Text size="xs" tt="uppercase" fw={700} c="dimmed">Checked In</Text>
                <Title order={3} mt={4}>{dashboard.totalCheckedIn}</Title>
              </Paper>
              <Paper withBorder p="md" radius="lg" ta="center" style={{ minWidth: 100 }}>
                <Text size="xs" tt="uppercase" fw={700} c="dimmed">Checked Out</Text>
                <Title order={3} mt={4}>{dashboard.totalCheckedOut}</Title>
              </Paper>
              {dashboard.latePickups.length > 0 && (
                <Paper withBorder p="md" radius="lg" ta="center" style={{ minWidth: 110, borderColor: "#c92a2a" }}>
                  <Text size="xs" tt="uppercase" fw={700} c="red">Late Pickups</Text>
                  <Title order={3} mt={4} c="red">{dashboard.latePickups.length}</Title>
                </Paper>
              )}
              {dashboard.openIncidents.length > 0 && (
                <Paper withBorder p="md" radius="lg" ta="center" style={{ minWidth: 110, borderColor: "#e67700" }}>
                  <Text size="xs" tt="uppercase" fw={700} c="orange">Open Incidents</Text>
                  <Title order={3} mt={4} c="orange">{dashboard.openIncidents.length}</Title>
                  {readinessView ? (
                    <Button component={Link} href="/app/church-admin/children/incidents" size="xs" variant="light" color="orange" mt="xs">
                      Review
                    </Button>
                  ) : null}
                </Paper>
              )}
            </Group>

            {/* Late pickup list */}
            {dashboard.latePickups.length > 0 && (
              <Paper withBorder p="md" radius="md" style={{ borderColor: "#c92a2a" }}>
                <Group mb="sm">
                  <ThemeIcon color="red" variant="light" size="lg" radius="md">
                    <AlertTriangle size={16} />
                  </ThemeIcon>
                  <Text fw={600} c="red">Late Pick-ups</Text>
                </Group>
                <Stack gap="xs">
                  {dashboard.latePickups.map((s) => (
                    <Group key={s.id} justify="space-between">
                      <div>
                        <Text size="sm" fw={500}>{s.childName}</Text>
                        <Text size="xs" c="dimmed">{s.currentRoomName ?? s.roomName}</Text>
                      </div>
                      <Group gap="xs">
                        {s.criticalAllergies.length > 0 && (
                          <Badge color="red" size="xs">
                            {s.criticalAllergies.join(", ")}
                          </Badge>
                        )}
                        <Badge color="red" variant="dot" size="sm">Late</Badge>
                      </Group>
                    </Group>
                  ))}
                </Stack>
              </Paper>
            )}

            {/* Room cards */}
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
              {dashboard.roomStatuses.map((rs) => (
                <CcmRoomCard key={rs.room.id} status={rs} />
              ))}
            </SimpleGrid>
          </>
        )}
      </Stack>
    </ApplicationShell>
  );
}
