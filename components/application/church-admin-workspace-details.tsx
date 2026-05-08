"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  BellRing,
  ClipboardList,
  HeartPulse,
  Wallet,
} from "lucide-react";
import {
  Badge,
  Button,
  Drawer,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";

import { persistChurchAdminWorkspaceStateAction } from "@/app/workspace/actions";
import type {
  ChurchAdminWorkspaceState,
  WeekendItemState,
} from "@/lib/application-state";
import type { ChurchAdminOperationsData } from "@/lib/church-admin-operations-data";

const sectionMeta = {
  care: {
    label: "Care",
    title: "Care",
    description: "Requests and follow-up",
    icon: HeartPulse,
  },
  weekend: {
    label: "Weekend",
    title: "Weekend",
    description: "Open operational items",
    icon: ClipboardList,
  },
  comms: {
    label: "Comms",
    title: "Communications",
    description: "Drafts and sends",
    icon: BellRing,
  },
  giving: {
    label: "Giving",
    title: "Giving",
    description: "Review and reconciliation",
    icon: Wallet,
  },
} as const;

type SectionKey = keyof typeof sectionMeta;

type DrawerState =
  | { section: "care"; id: string }
  | { section: "weekend"; id: string }
  | { section: "comms"; id: string }
  | { section: "giving"; id: string }
  | null;

function nextChecklistStatus(
  status: WeekendItemState["status"],
): WeekendItemState["status"] {
  if (status === "blocked") return "in-progress";
  if (status === "in-progress") return "done";
  return "done";
}

export function ChurchAdminWorkspaceDetails({
  initialState,
  operationsData,
}: {
  initialState: ChurchAdminWorkspaceState;
  operationsData?: ChurchAdminOperationsData | null;
}) {
  const [activeSection, setActiveSection] = useState<SectionKey>("care");
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [isPending, startTransition] = useTransition();
  const [workspaceState, setWorkspaceState] =
    useState<ChurchAdminWorkspaceState>(initialState);

  const { careItems, weekendItems, communicationsItems, givingItems } =
    workspaceState;
  const liveWeekendItems =
    operationsData?.source === "live" ? operationsData.weekendItems : null;
  const liveCommunicationItems =
    operationsData?.source === "live" ? operationsData.communicationItems : null;
  const liveGivingItems =
    operationsData?.source === "live" ? operationsData.givingItems : null;

  function persistState(nextState: ChurchAdminWorkspaceState) {
    setWorkspaceState(nextState);
    startTransition(async () => {
      await persistChurchAdminWorkspaceStateAction(nextState);
    });
  }

  const drawerContent = useMemo(() => {
    if (!drawer) return null;

    if (drawer.section === "care") {
      const item = careItems.find((entry) => entry.id === drawer.id);
      if (!item) return null;

      return {
        title: item.household,
        subtitle: item.request,
        actions: (
          <Group>
            <Button
              radius="xl"
              onClick={() =>
                persistState({
                  ...workspaceState,
                  careItems: careItems.map((entry) =>
                    entry.id === item.id
                      ? {
                          ...entry,
                          owner:
                            entry.owner === "Unassigned"
                              ? "Pastor Miriam"
                              : "Assimilation team",
                          stage: "assigned",
                        }
                      : entry,
                  ),
                })
              }
            >
              Reassign
            </Button>
            <Button
              radius="xl"
              variant="default"
              onClick={() =>
                persistState({
                  ...workspaceState,
                  careItems: careItems.map((entry) =>
                    entry.id === item.id
                      ? { ...entry, stage: "contacted", age: "Updated just now" }
                      : entry,
                  ),
                })
              }
            >
              Mark contacted
            </Button>
          </Group>
        ),
        notes: [
          `Owner: ${item.owner}`,
          `Stage: ${item.stage}`,
          `Open age: ${item.age}`,
        ],
      };
    }

    if (drawer.section === "weekend") {
      const item = weekendItems.find((entry) => entry.id === drawer.id);
      if (!item) return null;

      return {
        title: item.title,
        subtitle: item.detail,
        actions: (
          <Button
            radius="xl"
            onClick={() =>
              persistState({
                ...workspaceState,
                weekendItems: weekendItems.map((entry) =>
                  entry.id === item.id
                    ? { ...entry, status: nextChecklistStatus(entry.status) }
                    : entry,
                ),
              })
            }
          >
            Advance status
          </Button>
        ),
        notes: [`Current state: ${item.status}`],
      };
    }

    if (drawer.section === "comms") {
      const item = communicationsItems.find((entry) => entry.id === drawer.id);
      if (!item) return null;

      return {
        title: `${item.channel} to ${item.audience}`,
        subtitle: item.message,
        actions: (
          <Group>
            <Button
              radius="xl"
              onClick={() =>
                persistState({
                  ...workspaceState,
                  communicationsItems: communicationsItems.map((entry) =>
                    entry.id === item.id ? { ...entry, status: "ready" } : entry,
                  ),
                })
              }
            >
              Ready
            </Button>
            <Button
              radius="xl"
              variant="default"
              onClick={() =>
                persistState({
                  ...workspaceState,
                  communicationsItems: communicationsItems.map((entry) =>
                    entry.id === item.id
                      ? { ...entry, status: "scheduled" }
                      : entry,
                  ),
                })
              }
            >
              Schedule
            </Button>
          </Group>
        ),
        notes: [`Due: ${item.due}`, `Status: ${item.status}`],
      };
    }

    const item = givingItems.find((entry) => entry.id === drawer.id);
    if (!item) return null;

    return {
      title: item.label,
      subtitle: item.detail,
      actions: (
        <Group>
          <Button
            radius="xl"
            onClick={() =>
              persistState({
                ...workspaceState,
                givingItems: givingItems.map((entry) =>
                  entry.id === item.id ? { ...entry, status: "flagged" } : entry,
                ),
              })
            }
          >
            Flag
          </Button>
          <Button
            radius="xl"
            variant="default"
            onClick={() =>
              persistState({
                ...workspaceState,
                givingItems: givingItems.map((entry) =>
                  entry.id === item.id
                    ? { ...entry, status: "reconciled" }
                    : entry,
                ),
              })
            }
          >
            Reconcile
          </Button>
        </Group>
      ),
      notes: [`Amount: ${item.amount}`, `Status: ${item.status}`],
    };
  }, [careItems, communicationsItems, drawer, givingItems, weekendItems, workspaceState]);

  return (
    <>
      <Paper withBorder radius="xl" p="xl">
        <Group justify="space-between" align="center" mb="xl">
          <div>
            <Badge color="gray" variant="light" mb="sm">
              Operations
            </Badge>
            <Title order={2}>Church admin</Title>
          </div>
          <SegmentedControl
            value={activeSection}
            onChange={(value) => setActiveSection(value as SectionKey)}
            data={(Object.keys(sectionMeta) as SectionKey[]).map((key) => ({
              label: sectionMeta[key].label,
              value: key,
            }))}
          />
        </Group>

        <Paper withBorder radius="xl" p="xl">
          <Group gap="sm" mb="lg">
            <ThemeIcon color="gray" variant="light" radius="xl">
              {(() => {
                const Icon = sectionMeta[activeSection].icon;
                return <Icon size={18} />;
              })()}
            </ThemeIcon>
            <div>
              <Title order={3} size="h4">
                {sectionMeta[activeSection].title}
              </Title>
              <Text c="dimmed" size="sm" mt={4}>
                {sectionMeta[activeSection].description}
              </Text>
            </div>
          </Group>

          <Stack gap="sm">
            {activeSection === "care"
              ? careItems.map((item) => (
                  <Paper key={item.id} radius="xl" p="md" bg="gray.0">
                    <Group justify="space-between" align="flex-start" gap="md">
                      <div>
                        <Group gap="sm">
                          <Text fw={600}>{item.household}</Text>
                          <Badge
                            color={
                              item.urgency === "critical"
                                ? "red"
                                : item.urgency === "warning"
                                  ? "yellow"
                                  : "teal"
                            }
                            variant="light"
                          >
                            {item.urgency}
                          </Badge>
                          <Badge variant="outline">{item.stage}</Badge>
                        </Group>
                        <Text c="dimmed" size="sm" mt="xs">
                          {item.request}
                        </Text>
                        <Text size="sm" mt="xs">
                          Owner: {item.owner}
                        </Text>
                      </div>
                      <Button
                        radius="xl"
                        variant="subtle"
                        onClick={() => setDrawer({ section: "care", id: item.id })}
                      >
                        Details
                      </Button>
                    </Group>
                  </Paper>
                ))
              : null}

            {activeSection === "weekend" && liveWeekendItems
              ? liveWeekendItems.length > 0
                ? liveWeekendItems.map((item) => (
                    <Paper key={item.id} radius="xl" p="md" bg="gray.0">
                      <Group justify="space-between" align="flex-start" gap="md">
                        <div>
                          <Text fw={600}>{item.title}</Text>
                          <Text c="dimmed" size="sm" mt="xs">
                            {item.detail}
                          </Text>
                          <Group gap="xs" mt="sm">
                            {item.badges.map((badge) => (
                              <Badge key={badge} variant="outline">
                                {badge}
                              </Badge>
                            ))}
                          </Group>
                        </div>
                        <Group gap="xs">
                          <Badge
                            color={
                              item.status === "done"
                                ? "teal"
                                : item.status === "in-progress"
                                  ? "blue"
                                  : "yellow"
                            }
                            variant="light"
                          >
                            {item.status}
                          </Badge>
                          <Button
                            component={Link}
                            href={item.href}
                            radius="xl"
                            variant="subtle"
                          >
                            Open event
                          </Button>
                        </Group>
                      </Group>
                    </Paper>
                  ))
                : (
                    <Paper radius="xl" p="md" bg="gray.0">
                      <Text fw={600}>No event actions need attention.</Text>
                      <Text c="dimmed" size="sm" mt="xs">
                        Upcoming events have approval, roster, and registration checks in good shape.
                      </Text>
                    </Paper>
                  )
              : null}

            {activeSection === "weekend" && !liveWeekendItems
              ? weekendItems.map((item) => (
                  <Paper key={item.id} radius="xl" p="md" bg="gray.0">
                    <Group justify="space-between" align="flex-start" gap="md">
                      <div>
                        <Text fw={600}>{item.title}</Text>
                        <Text c="dimmed" size="sm" mt="xs">
                          {item.detail}
                        </Text>
                      </div>
                      <Group gap="xs">
                        <Badge
                          color={
                            item.status === "done"
                              ? "teal"
                              : item.status === "in-progress"
                                ? "blue"
                                : "yellow"
                          }
                          variant="light"
                        >
                          {item.status}
                        </Badge>
                        <Button
                          radius="xl"
                          variant="subtle"
                          onClick={() => setDrawer({ section: "weekend", id: item.id })}
                        >
                          Details
                        </Button>
                      </Group>
                    </Group>
                  </Paper>
                ))
              : null}

            {activeSection === "comms" && liveCommunicationItems
              ? liveCommunicationItems.length > 0
                ? liveCommunicationItems.map((item) => (
                    <Paper key={item.id} radius="xl" p="md" bg="gray.0">
                      <Group justify="space-between" align="flex-start" gap="md">
                        <div>
                          <Text fw={600}>{item.title}</Text>
                          <Text c="dimmed" size="sm" mt="xs">
                            {item.detail}
                          </Text>
                          <Group gap="xs" mt="sm">
                            {item.badges.map((badge) => (
                              <Badge key={badge} variant="outline">
                                {badge}
                              </Badge>
                            ))}
                          </Group>
                        </div>
                        <Group gap="xs">
                          <Badge
                            color={
                              item.status === "done"
                                ? "teal"
                                : item.status === "in-progress"
                                  ? "blue"
                                  : "yellow"
                            }
                            variant="light"
                          >
                            {item.status}
                          </Badge>
                          <Button
                            component={Link}
                            href={item.href}
                            radius="xl"
                            variant="subtle"
                          >
                            Open
                          </Button>
                        </Group>
                      </Group>
                    </Paper>
                  ))
                : (
                    <Paper radius="xl" p="md" bg="gray.0">
                      <Text fw={600}>No communication actions need attention.</Text>
                      <Text c="dimmed" size="sm" mt="xs">
                        Queued sends, failures, and consent/contact checks are clear.
                      </Text>
                    </Paper>
                  )
              : null}

            {activeSection === "comms" && !liveCommunicationItems
              ? communicationsItems.map((item) => (
                  <Paper key={item.id} radius="xl" p="md" bg="gray.0">
                    <Group justify="space-between" align="flex-start" gap="md">
                      <div>
                        <Text fw={600}>
                          {item.channel} • {item.audience}
                        </Text>
                        <Text c="dimmed" size="sm" mt="xs">
                          {item.message}
                        </Text>
                      </div>
                      <Group gap="xs">
                        <Badge color="teal" variant="light">
                          {item.status}
                        </Badge>
                        <Button
                          radius="xl"
                          variant="subtle"
                          onClick={() => setDrawer({ section: "comms", id: item.id })}
                        >
                          Details
                        </Button>
                      </Group>
                    </Group>
                  </Paper>
                ))
              : null}

            {activeSection === "giving" && liveGivingItems
              ? liveGivingItems.length > 0
                ? liveGivingItems.map((item) => (
                    <Paper key={item.id} radius="xl" p="md" bg="gray.0">
                      <Group justify="space-between" align="flex-start" gap="md">
                        <div>
                          <Text fw={600}>{item.title}</Text>
                          <Text c="dimmed" size="sm" mt="xs">
                            {item.detail}
                          </Text>
                          <Group gap="xs" mt="sm">
                            {item.badges.map((badge) => (
                              <Badge key={badge} variant="outline">
                                {badge}
                              </Badge>
                            ))}
                          </Group>
                        </div>
                        <Group gap="xs">
                          <Badge
                            color={
                              item.status === "done"
                                ? "teal"
                                : item.status === "in-progress"
                                  ? "blue"
                                  : "yellow"
                            }
                            variant="light"
                          >
                            {item.status}
                          </Badge>
                          <Button
                            component={Link}
                            href={item.href}
                            radius="xl"
                            variant="subtle"
                          >
                            Open
                          </Button>
                        </Group>
                      </Group>
                    </Paper>
                  ))
                : (
                    <Paper radius="xl" p="md" bg="gray.0">
                      <Text fw={600}>No giving actions need attention.</Text>
                      <Text c="dimmed" size="sm" mt="xs">
                        Recent payments, receipts, GL posting, and giving page setup are clear.
                      </Text>
                    </Paper>
                  )
              : null}

            {activeSection === "giving" && !liveGivingItems
              ? givingItems.map((item) => (
                  <Paper key={item.id} radius="xl" p="md" bg="gray.0">
                    <Group justify="space-between" align="flex-start" gap="md">
                      <div>
                        <Text fw={600}>{item.label}</Text>
                        <Title order={3} mt="xs">
                          {item.amount}
                        </Title>
                        <Text c="dimmed" size="sm" mt="xs">
                          {item.detail}
                        </Text>
                      </div>
                      <Group gap="xs">
                        <Badge
                          color={
                            item.status === "reconciled"
                              ? "teal"
                              : item.status === "flagged"
                                ? "yellow"
                                : "gray"
                          }
                          variant="light"
                        >
                          {item.status}
                        </Badge>
                        <Button
                          radius="xl"
                          variant="subtle"
                          onClick={() => setDrawer({ section: "giving", id: item.id })}
                        >
                          Details
                        </Button>
                      </Group>
                    </Group>
                  </Paper>
                ))
              : null}

            {isPending ? (
              <Text c="dimmed" size="sm">
                Saving changes...
              </Text>
            ) : null}
          </Stack>
        </Paper>
      </Paper>

      <Drawer
        opened={Boolean(drawer)}
        onClose={() => setDrawer(null)}
        position="right"
        size="md"
        title={drawerContent?.title}
        overlayProps={{ backgroundOpacity: 0.4, blur: 4 }}
      >
        <Stack gap="md">
          <Text c="dimmed" size="sm">
            {drawerContent?.subtitle}
          </Text>
          {drawerContent?.notes.map((note) => (
            <Paper key={note} withBorder radius="xl" p="md">
              <Text size="sm">{note}</Text>
            </Paper>
          ))}
          {drawerContent?.actions}
        </Stack>
      </Drawer>
    </>
  );
}
