"use client";

import { useState, useTransition } from "react";
import {
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Textarea,
  ThemeIcon,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  BookOpen,
  FlameKindling,
  Heart,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { BurnoutGuardianBanner } from "@/components/application/burnout-guardian-banner";
import { HealthScoreCard } from "@/components/application/health-score-card";
import { KingdomImpactLogModal } from "@/components/application/kingdom-impact-log-modal";
import { VolunteerMatcherPanel } from "@/components/application/volunteer-matcher-panel";
import { VisionBoard } from "@/components/application/vision-board";
import type { ChurchAppSession } from "@/lib/auth";
import type {
  MinistryForgeDetail,
  MinistryType,
  VolunteerMatcherData,
} from "@/lib/ministry-forge-types";
import type {
  AssignMembersToMinistryInput,
  UpdateMinistryHealthScoreInput,
  UpdateMinistryInput,
} from "@/app/app/actions";
import {
  assignMembersToMinistryAction,
  removeMemberFromMinistryAction,
  updateMinistryAction,
  updateMinistryHealthScoreAction,
} from "@/app/app/actions";

const MINISTRY_TYPE_OPTIONS = [
  { value: "outreach", label: "Outreach" },
  { value: "discipleship", label: "Discipleship" },
  { value: "worship", label: "Worship" },
  { value: "care", label: "Care" },
  { value: "administration", label: "Administration" },
  { value: "youth", label: "Youth" },
  { value: "children", label: "Children" },
  { value: "missions", label: "Missions" },
];

const IMPACT_TYPE_LABELS: Record<string, string> = {
  prayer_answered: "Prayer Answered",
  disciple_made: "Disciple Made",
  salvation: "Salvation",
  restored_relationship: "Restored Relationship",
};

const ROLE_COLOR: Record<string, string> = {
  leader: "churchBlue",
  assistant_leader: "blue",
  member: "gray",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function MinistryForgeDashboard({
  session,
  detail,
  allPeople,
  matcherData,
}: {
  session: ChurchAppSession;
  detail: MinistryForgeDetail;
  allPeople: Array<{ id: string; fullName: string }>;
  matcherData?: VolunteerMatcherData;
}) {
  const { ministry, members, healthHistory, recentImpacts, burnoutWarnings } = detail;
  const isManager =
    session.appContext.roleId === "church-admin" || session.appContext.roleId === "pastor";

  const [assignDrawerOpen, assignDrawer] = useDisclosure(false);
  const [healthDrawerOpen, healthDrawer] = useDisclosure(false);
  const [settingsDrawerOpen, settingsDrawer] = useDisclosure(false);
  const [isPending, startTransition] = useTransition();

  // Assign drawer state
  const [assignProfileIds, setAssignProfileIds] = useState<string[]>([]);
  const [assignRole, setAssignRole] = useState<string>("member");

  // Health score drawer state
  const [healthScoreInput, setHealthScoreInput] = useState<number | string>(
    ministry.healthScore,
  );
  const [healthNotes, setHealthNotes] = useState("");

  // Settings drawer state
  const [settingsName] = useState(ministry.name);
  const [settingsType, setSettingsType] = useState<string | null>(ministry.ministryType);

  function handleAssignSubmit() {
    if (!assignProfileIds.length) return;
    const input: AssignMembersToMinistryInput = {
      ministryId: ministry.id,
      profileIds: assignProfileIds,
      role: assignRole as AssignMembersToMinistryInput["role"],
    };
    startTransition(async () => {
      try {
        await assignMembersToMinistryAction(input);
        notifications.show({ title: "Members assigned", message: "Roster updated.", color: "teal" });
        setAssignProfileIds([]);
        assignDrawer.close();
      } catch (err) {
        notifications.show({
          title: "Error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          color: "red",
        });
      }
    });
  }

  function handleRemoveMember(profileId: string, fullName: string) {
    startTransition(async () => {
      try {
        await removeMemberFromMinistryAction({ ministryId: ministry.id, profileId });
        notifications.show({
          title: "Member removed",
          message: `${fullName} has been removed from this ministry.`,
          color: "gray",
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

  function handleHealthScoreSubmit() {
    const score = typeof healthScoreInput === "number" ? healthScoreInput : parseFloat(String(healthScoreInput));
    if (isNaN(score) || score < 0 || score > 10) return;
    const input: UpdateMinistryHealthScoreInput = {
      ministryId: ministry.id,
      healthScore: score,
      notes: healthNotes.trim() || null,
    };
    startTransition(async () => {
      try {
        await updateMinistryHealthScoreAction(input);
        notifications.show({
          title: "Health score updated",
          message: "Assessment has been recorded.",
          color: "teal",
        });
        setHealthNotes("");
        healthDrawer.close();
      } catch (err) {
        notifications.show({
          title: "Error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          color: "red",
        });
      }
    });
  }

  function handleSettingsSubmit() {
    const input: UpdateMinistryInput = {
      ministryId: ministry.id,
      name: settingsName,
      ministryType: settingsType as MinistryType | null,
      visionStatement: ministry.visionStatement,
      scripturalAnchor: ministry.scripturalAnchor,
    };
    startTransition(async () => {
      try {
        await updateMinistryAction(input);
        notifications.show({ title: "Ministry updated", message: "Settings saved.", color: "teal" });
        settingsDrawer.close();
      } catch (err) {
        notifications.show({
          title: "Error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          color: "red",
        });
      }
    });
  }

  const existingProfileIds = new Set(members.map((m) => m.profileId));
  const availablePeople = allPeople
    .filter((p) => !existingProfileIds.has(p.id))
    .map((p) => ({ value: p.id, label: p.fullName }));

  const navItems = isManager
    ? [
        {
          href: "/app/church-admin",
          label: "Home",
          description: "Admin overview",
          icon: Settings,
        },
        {
          href: "/app/church-admin/people",
          label: "People",
          description: "Manage members",
          icon: Users,
        },
      ]
    : [
        {
          href: "/app/pastor",
          label: "Home",
          description: "Pastor overview",
          icon: FlameKindling,
        },
        {
          href: "/app/pastor/people",
          label: "People",
          description: "Follow-up",
          icon: Users,
        },
      ];

  return (
    <ApplicationShell
      session={session}
      workspaceHref={isManager ? "/app/church-admin" : "/app/pastor"}
      calendarHref="/app/calendar"
      sectionLabel="Ministry Forge"
      title={ministry.name}
      description={session.appContext.church.name}
      sidebarTitle="Ministry Forge"
      sidebarDescription="Health, vision, and kingdom impact."
      navLabel="Navigation"
      navItems={navItems}
      topActions={
        isManager ? (
          <Group gap="xs">
            <Button
              size="xs"
              variant="default"
              radius="xl"
              leftSection={<TrendingUp size={13} />}
              onClick={healthDrawer.open}
            >
              Update health score
            </Button>
            <Button
              size="xs"
              variant="default"
              radius="xl"
              leftSection={<Settings size={13} />}
              onClick={settingsDrawer.open}
            >
              Settings
            </Button>
          </Group>
        ) : undefined
      }
    >
      {burnoutWarnings.length > 0 ? <BurnoutGuardianBanner warnings={burnoutWarnings} /> : null}

      <Tabs defaultValue="overview" radius="xl">
        <Tabs.List>
          <Tabs.Tab value="overview" leftSection={<FlameKindling size={14} />}>
            Overview
          </Tabs.Tab>
          <Tabs.Tab value="members" leftSection={<Users size={14} />}>
            Members
          </Tabs.Tab>
          <Tabs.Tab value="impact" leftSection={<Sparkles size={14} />}>
            Impact Log
          </Tabs.Tab>
          <Tabs.Tab value="vision" leftSection={<BookOpen size={14} />}>
            Vision
          </Tabs.Tab>
          {isManager ? (
            <Tabs.Tab value="volunteers" leftSection={<ShieldCheck size={14} />}>
              Volunteer Matcher
            </Tabs.Tab>
          ) : null}
        </Tabs.List>

        {/* === OVERVIEW === */}
        <Tabs.Panel value="overview" pt="lg">
          <Stack gap="lg">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              <HealthScoreCard
                healthScore={ministry.healthScore}
                lastHealthAssessment={ministry.lastHealthAssessment}
                healthHistory={healthHistory}
              />

              <Paper withBorder radius="xl" p="xl">
                <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb="sm">
                  At a glance
                </Text>
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      Members
                    </Text>
                    <Text size="sm" fw={600}>
                      {ministry.memberCount}
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      Impact events (90 d)
                    </Text>
                    <Text size="sm" fw={600}>
                      {recentImpacts.length}
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      Ministry type
                    </Text>
                    <Text size="sm" fw={600}>
                      {ministry.ministryType
                        ? MINISTRY_TYPE_OPTIONS.find((o) => o.value === ministry.ministryType)
                            ?.label ?? ministry.ministryType
                        : "—"}
                    </Text>
                  </Group>
                  {ministry.scripturalAnchor.length > 0 ? (
                    <Group justify="space-between" align="flex-start">
                      <Text size="sm" c="dimmed">
                        Scriptural anchors
                      </Text>
                      <Group gap="xs" justify="flex-end" style={{ flex: 1 }}>
                        {ministry.scripturalAnchor.slice(0, 3).map((a) => (
                          <Badge key={a} variant="light" color="churchBlue" size="xs" radius="sm">
                            {a}
                          </Badge>
                        ))}
                      </Group>
                    </Group>
                  ) : null}
                </Stack>
              </Paper>
            </SimpleGrid>

            {ministry.visionStatement ? (
              <Paper withBorder radius="xl" p="xl">
                <Group gap="sm" mb="sm">
                  <ThemeIcon variant="light" color="churchBlue" radius="xl" size="sm">
                    <Heart size={12} />
                  </ThemeIcon>
                  <Text size="sm" fw={600}>
                    Vision
                  </Text>
                </Group>
                <Text size="sm" c="dimmed" style={{ whiteSpace: "pre-wrap" }}>
                  {ministry.visionStatement}
                </Text>
              </Paper>
            ) : null}
          </Stack>
        </Tabs.Panel>

        {/* === MEMBERS === */}
        <Tabs.Panel value="members" pt="lg">
          <Stack gap="md">
            {isManager ? (
              <Group justify="flex-end">
                <Button
                  size="xs"
                  radius="xl"
                  color="churchBlue"
                  leftSection={<Users size={13} />}
                  onClick={assignDrawer.open}
                >
                  Add members
                </Button>
              </Group>
            ) : null}

            {members.length ? (
              members.map((member) => (
                <Paper key={member.profileId} withBorder radius="xl" p="md">
                  <Group justify="space-between" align="flex-start" gap="md">
                    <div style={{ flex: 1 }}>
                      <Group gap="sm" align="center">
                        <Text fw={600}>{member.fullName}</Text>
                        <Badge
                          color={ROLE_COLOR[member.role] ?? "gray"}
                          variant="light"
                          size="xs"
                          radius="sm"
                        >
                          {member.role.replace("_", " ")}
                        </Badge>
                        {member.ministryCount > 3 ? (
                          <Badge color="yellow" variant="light" size="xs" radius="sm">
                            {member.ministryCount} ministries
                          </Badge>
                        ) : null}
                      </Group>
                      {member.displayTitle ? (
                        <Text size="sm" c="dimmed" mt={2}>
                          {member.displayTitle}
                        </Text>
                      ) : null}
                      {member.spiritualGifts?.length ? (
                        <Group gap="xs" mt="xs">
                          {member.spiritualGifts.slice(0, 3).map((gift) => (
                            <Badge
                              key={gift}
                              variant="dot"
                              color="churchBlue"
                              size="xs"
                              radius="sm"
                            >
                              {gift}
                            </Badge>
                          ))}
                        </Group>
                      ) : null}
                    </div>

                    {isManager ? (
                      <Button
                        variant="subtle"
                        color="red"
                        size="xs"
                        radius="xl"
                        loading={isPending}
                        onClick={() => handleRemoveMember(member.profileId, member.fullName)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </Group>
                </Paper>
              ))
            ) : (
              <Text size="sm" c="dimmed">
                No members have been assigned to this ministry yet.
              </Text>
            )}
          </Stack>
        </Tabs.Panel>

        {/* === IMPACT LOG === */}
        <Tabs.Panel value="impact" pt="lg">
          <Stack gap="md">
            {recentImpacts.length ? (
              recentImpacts.map((impact) => (
                <Paper key={impact.id} withBorder radius="xl" p="md">
                  <Group justify="space-between" align="flex-start" gap="md">
                    <div style={{ flex: 1 }}>
                      <Badge color="churchBlue" variant="light" radius="sm" size="sm" mb={4}>
                        {IMPACT_TYPE_LABELS[impact.impactType] ?? impact.impactType}
                      </Badge>
                      {impact.description ? (
                        <Text size="sm" mt={4}>
                          {impact.description}
                        </Text>
                      ) : null}
                      <Text size="xs" c="dimmed" mt={6}>
                        {formatDate(impact.occurredAt)}
                        {impact.createdByName ? ` · Logged by ${impact.createdByName}` : ""}
                      </Text>
                    </div>
                  </Group>
                </Paper>
              ))
            ) : (
              <Text size="sm" c="dimmed">
                No Kingdom Impacts have been logged for this ministry in the last 90 days.
              </Text>
            )}
          </Stack>
        </Tabs.Panel>

        {/* === VISION === */}
        <Tabs.Panel value="vision" pt="lg">
          <Paper withBorder radius="xl" p="xl">
            <VisionBoard
              ministryId={ministry.id}
              initialVision={ministry.visionStatement}
              initialAnchors={ministry.scripturalAnchor}
              editable={isManager}
            />
          </Paper>
        </Tabs.Panel>

        {/* === VOLUNTEER MATCHER (manager only) === */}
        {isManager ? (
          <Tabs.Panel value="volunteers" pt="lg">
            <VolunteerMatcherPanel
              ministryId={ministry.id}
              initialSuggestions={matcherData?.suggestions ?? []}
              initialBurnoutAlerts={matcherData?.burnoutAlerts ?? []}
              isManager={isManager}
            />
          </Tabs.Panel>
        ) : null}
      </Tabs>

      {/* Kingdom impact FAB — management only */}
      {isManager ? <KingdomImpactLogModal ministryId={ministry.id} /> : null}

      {/* Assign members drawer */}
      <Drawer
        opened={assignDrawerOpen}
        onClose={assignDrawer.close}
        title="Add Members to Ministry"
        position="right"
        size="md"
        radius="lg"
      >
        <Stack gap="md" p="md">
          <MultiSelect
            label="Select members"
            placeholder="Search by name..."
            data={availablePeople}
            value={assignProfileIds}
            onChange={setAssignProfileIds}
            searchable
            radius="md"
          />
          <Select
            label="Role in this ministry"
            data={[
              { value: "member", label: "Member" },
              { value: "leader", label: "Leader" },
              { value: "assistant_leader", label: "Assistant Leader" },
            ]}
            value={assignRole}
            onChange={(v) => setAssignRole(v ?? "member")}
            radius="md"
          />
          <Divider />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" radius="xl" onClick={assignDrawer.close}>
              Cancel
            </Button>
            <Button
              radius="xl"
              color="churchBlue"
              loading={isPending}
              disabled={!assignProfileIds.length}
              onClick={handleAssignSubmit}
            >
              Assign
            </Button>
          </Group>
        </Stack>
      </Drawer>

      {/* Health score drawer */}
      <Drawer
        opened={healthDrawerOpen}
        onClose={healthDrawer.close}
        title="Update Health Score"
        position="right"
        size="sm"
        radius="lg"
      >
        <Stack gap="md" p="md">
          <Text size="sm" c="dimmed">
            Rate the current health of this ministry from 0 (critical) to 10 (thriving). This score
            is recorded and used to track trends over time.
          </Text>

          <NumberInput
            label="Health score (0–10)"
            placeholder="e.g. 7.5"
            value={healthScoreInput}
            onChange={setHealthScoreInput}
            min={0}
            max={10}
            step={0.1}
            decimalScale={2}
            radius="md"
          />

          <Textarea
            label="Assessment notes (optional)"
            placeholder="What's driving this score?"
            value={healthNotes}
            onChange={(e) => setHealthNotes(e.currentTarget.value)}
            minRows={3}
            autosize
            radius="md"
          />

          <Text size="xs" c="dimmed" fs="italic">
            AI-assistive disclaimer: Future phases will offer AI-assisted scoring. For now this is a
            human assessment guided by attendance, engagement, and impact data.
          </Text>

          <Divider />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" radius="xl" onClick={healthDrawer.close}>
              Cancel
            </Button>
            <Button
              radius="xl"
              color="churchBlue"
              loading={isPending}
              onClick={handleHealthScoreSubmit}
            >
              Save assessment
            </Button>
          </Group>
        </Stack>
      </Drawer>

      {/* Settings drawer */}
      <Drawer
        opened={settingsDrawerOpen}
        onClose={settingsDrawer.close}
        title="Ministry Settings"
        position="right"
        size="sm"
        radius="lg"
      >
        <Stack gap="md" p="md">
          <Select
            label="Ministry type"
            placeholder="Select type..."
            data={MINISTRY_TYPE_OPTIONS}
            value={settingsType}
            onChange={setSettingsType}
            clearable
            radius="md"
          />
          <Divider />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" radius="xl" onClick={settingsDrawer.close}>
              Cancel
            </Button>
            <Button
              radius="xl"
              color="churchBlue"
              loading={isPending}
              onClick={handleSettingsSubmit}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Drawer>
    </ApplicationShell>
  );
}
