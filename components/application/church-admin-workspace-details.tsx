"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
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
import { useI18n } from "@/components/i18n-provider";
import type {
  ChurchAdminWorkspaceState,
  WeekendItemState,
} from "@/lib/application-state";
import type { ChurchAdminOperationsData } from "@/lib/church-admin-operations-data";

const sectionMeta = {
  care: {
    labelKey: "careLabel",
    titleKey: "careTitle",
    descriptionKey: "careDescription",
    icon: HeartPulse,
  },
  weekend: {
    labelKey: "weekendLabel",
    titleKey: "weekendTitle",
    descriptionKey: "weekendDescription",
    icon: ClipboardList,
  },
  comms: {
    labelKey: "commsLabel",
    titleKey: "commsTitle",
    descriptionKey: "commsDescription",
    icon: BellRing,
  },
  giving: {
    labelKey: "givingLabel",
    titleKey: "givingTitle",
    descriptionKey: "givingDescription",
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

function formatKnownValue(
  value: string,
  translate: (key: string) => string,
) {
  const key = value.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  const translated = translate(key);
  return translated === key ? value : translated;
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
  const { t } = useI18n();
  const translateOps = useCallback(
    (key: string, values?: Record<string, string | number>) =>
      t("churchAdminOps", key, values),
    [t],
  );
  const translateKnown = useCallback(
    (value: string) => formatKnownValue(value, translateOps),
    [translateOps],
  );

  const { careItems, weekendItems, communicationsItems, givingItems } =
    workspaceState;
  const liveCareItems =
    operationsData?.source === "live" ? operationsData.careItems : null;
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
              {translateOps("reassign")}
            </Button>
            <Button
              radius="xl"
              variant="default"
              onClick={() =>
                persistState({
                  ...workspaceState,
                  careItems: careItems.map((entry) =>
                    entry.id === item.id
                      ? { ...entry, stage: "contacted", age: "updated_just_now" }
                      : entry,
                  ),
                })
              }
            >
              {translateOps("markContacted")}
            </Button>
          </Group>
        ),
        notes: [
          translateOps("ownerNote", { value: item.owner }),
          translateOps("stageNote", { value: translateKnown(item.stage) }),
          translateOps("openAgeNote", { value: translateKnown(item.age) }),
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
            {translateOps("advanceStatus")}
          </Button>
        ),
        notes: [
          translateOps("currentStateNote", {
            value: translateKnown(item.status),
          }),
        ],
      };
    }

    if (drawer.section === "comms") {
      const item = communicationsItems.find((entry) => entry.id === drawer.id);
      if (!item) return null;

      return {
        title: translateOps("communicationTitle", {
          channel: item.channel,
          audience: item.audience,
        }),
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
              {translateOps("readyAction")}
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
              {translateOps("schedule")}
            </Button>
          </Group>
        ),
        notes: [
          translateOps("dueNote", { value: item.due }),
          translateOps("statusNote", { value: translateKnown(item.status) }),
        ],
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
            {translateOps("flag")}
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
            {translateOps("reconcile")}
          </Button>
        </Group>
      ),
      notes: [
        translateOps("amountNote", { value: item.amount }),
        translateOps("statusNote", { value: translateKnown(item.status) }),
      ],
    };
  }, [
    careItems,
    communicationsItems,
    drawer,
    givingItems,
    translateKnown,
    translateOps,
    weekendItems,
    workspaceState,
  ]);

  return (
    <>
      <Paper
        radius="lg"
        p="xl"
        style={{
          background: "#ffffff",
          border: "1px solid rgba(16, 24, 39, 0.1)",
          boxShadow: "0 18px 48px rgba(16, 24, 39, 0.08)",
        }}
      >
        <Group justify="space-between" align="center" mb="xl">
          <div>
            <Badge color="dark" variant="light" radius="sm" mb="sm">
              {translateOps("operations")}
            </Badge>
            <Title order={2} c="#101827">{translateOps("churchAdmin")}</Title>
          </div>
          <SegmentedControl
            value={activeSection}
            onChange={(value) => setActiveSection(value as SectionKey)}
            data={(Object.keys(sectionMeta) as SectionKey[]).map((key) => ({
              label: translateOps(sectionMeta[key].labelKey),
              value: key,
            }))}
          />
        </Group>

        <Paper
          radius="lg"
          p="xl"
          style={{
            background:
              "linear-gradient(180deg, rgba(248, 251, 255, 0.96), rgba(255, 255, 255, 1))",
            border: "1px solid rgba(16, 24, 39, 0.08)",
          }}
        >
          <Group gap="sm" mb="lg">
            <ThemeIcon color="teal" variant="light" radius="md">
              {(() => {
                const Icon = sectionMeta[activeSection].icon;
                return <Icon size={18} />;
              })()}
            </ThemeIcon>
            <div>
              <Title order={3} size="h4">
                {translateOps(sectionMeta[activeSection].titleKey)}
              </Title>
              <Text c="dimmed" size="sm" mt={4}>
                {translateOps(sectionMeta[activeSection].descriptionKey)}
              </Text>
            </div>
          </Group>

          <Stack gap="sm">
            {activeSection === "care" && liveCareItems
              ? liveCareItems.length > 0
                ? liveCareItems.map((item) => (
                    <Paper key={item.id} radius="md" p="md" bg="white" withBorder>
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
                            {translateKnown(item.status)}
                          </Badge>
                          <Button
                            component={Link}
                            href={item.href}
                            radius="xl"
                            variant="subtle"
                          >
                            {translateOps("openPerson")}
                          </Button>
                        </Group>
                      </Group>
                    </Paper>
                  ))
                : (
                    <Paper radius="md" p="md" bg="white" withBorder>
                      <Text fw={600}>{translateOps("noCareActions")}</Text>
                      <Text c="dimmed" size="sm" mt="xs">
                        {translateOps("noCareActionsDescription")}
                      </Text>
                    </Paper>
                  )
              : null}

            {activeSection === "care" && !liveCareItems
              ? careItems.map((item) => (
                  <Paper key={item.id} radius="md" p="md" bg="white" withBorder>
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
                            {translateKnown(item.urgency)}
                          </Badge>
                          <Badge variant="outline">{translateKnown(item.stage)}</Badge>
                        </Group>
                        <Text c="dimmed" size="sm" mt="xs">
                          {item.request}
                        </Text>
                        <Text size="sm" mt="xs">
                          {translateOps("ownerInline", { value: item.owner })}
                        </Text>
                      </div>
                      <Button
                        radius="xl"
                        variant="subtle"
                        onClick={() => setDrawer({ section: "care", id: item.id })}
                      >
                        {translateOps("details")}
                      </Button>
                    </Group>
                  </Paper>
                ))
              : null}

            {activeSection === "weekend" && liveWeekendItems
              ? liveWeekendItems.length > 0
                ? liveWeekendItems.map((item) => (
                    <Paper key={item.id} radius="md" p="md" bg="white" withBorder>
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
                            {translateKnown(item.status)}
                          </Badge>
                          <Button
                            component={Link}
                            href={item.href}
                            radius="xl"
                            variant="subtle"
                          >
                            {translateOps("openEvent")}
                          </Button>
                        </Group>
                      </Group>
                    </Paper>
                  ))
                : (
                    <Paper radius="md" p="md" bg="white" withBorder>
                      <Text fw={600}>{translateOps("noEventActions")}</Text>
                      <Text c="dimmed" size="sm" mt="xs">
                        {translateOps("noEventActionsDescription")}
                      </Text>
                    </Paper>
                  )
              : null}

            {activeSection === "weekend" && !liveWeekendItems
              ? weekendItems.map((item) => (
                  <Paper key={item.id} radius="md" p="md" bg="white" withBorder>
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
                          {translateKnown(item.status)}
                        </Badge>
                        <Button
                          radius="xl"
                          variant="subtle"
                          onClick={() => setDrawer({ section: "weekend", id: item.id })}
                        >
                          {translateOps("details")}
                        </Button>
                      </Group>
                    </Group>
                  </Paper>
                ))
              : null}

            {activeSection === "comms" && liveCommunicationItems
              ? liveCommunicationItems.length > 0
                ? liveCommunicationItems.map((item) => (
                    <Paper key={item.id} radius="md" p="md" bg="white" withBorder>
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
                            {translateKnown(item.status)}
                          </Badge>
                          <Button
                            component={Link}
                            href={item.href}
                            radius="xl"
                            variant="subtle"
                          >
                            {translateOps("open")}
                          </Button>
                        </Group>
                      </Group>
                    </Paper>
                  ))
                : (
                    <Paper radius="md" p="md" bg="white" withBorder>
                      <Text fw={600}>{translateOps("noCommunicationActions")}</Text>
                      <Text c="dimmed" size="sm" mt="xs">
                        {translateOps("noCommunicationActionsDescription")}
                      </Text>
                    </Paper>
                  )
              : null}

            {activeSection === "comms" && !liveCommunicationItems
              ? communicationsItems.map((item) => (
                  <Paper key={item.id} radius="md" p="md" bg="white" withBorder>
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
                          {translateKnown(item.status)}
                        </Badge>
                        <Button
                          radius="xl"
                          variant="subtle"
                          onClick={() => setDrawer({ section: "comms", id: item.id })}
                        >
                          {translateOps("details")}
                        </Button>
                      </Group>
                    </Group>
                  </Paper>
                ))
              : null}

            {activeSection === "giving" && liveGivingItems
              ? liveGivingItems.length > 0
                ? liveGivingItems.map((item) => (
                    <Paper key={item.id} radius="md" p="md" bg="white" withBorder>
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
                            {translateKnown(item.status)}
                          </Badge>
                          <Button
                            component={Link}
                            href={item.href}
                            radius="xl"
                            variant="subtle"
                          >
                            {translateOps("open")}
                          </Button>
                        </Group>
                      </Group>
                    </Paper>
                  ))
                : (
                    <Paper radius="md" p="md" bg="white" withBorder>
                      <Text fw={600}>{translateOps("noGivingActions")}</Text>
                      <Text c="dimmed" size="sm" mt="xs">
                        {translateOps("noGivingActionsDescription")}
                      </Text>
                    </Paper>
                  )
              : null}

            {activeSection === "giving" && !liveGivingItems
              ? givingItems.map((item) => (
                  <Paper key={item.id} radius="md" p="md" bg="white" withBorder>
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
                          {translateKnown(item.status)}
                        </Badge>
                        <Button
                          radius="xl"
                          variant="subtle"
                          onClick={() => setDrawer({ section: "giving", id: item.id })}
                        >
                          {translateOps("details")}
                        </Button>
                      </Group>
                    </Group>
                  </Paper>
                ))
              : null}

            {isPending ? (
              <Text c="dimmed" size="sm">
                {translateOps("savingChanges")}
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
