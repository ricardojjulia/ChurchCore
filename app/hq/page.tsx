"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Paper,
  Tabs,
  Table,
  Badge,
  Button,
  TextInput,
  Select,
  Textarea,
  Group,
  Stack,
  Text,
  Title,
  Modal,
  Grid,
  Loader,
  Skeleton,
  ActionIcon,
  Card,
  SimpleGrid,
  Center,
  ScrollArea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  CheckSquare,
  AlertTriangle,
  Gavel,
  Sparkles,
  Plus,
  Edit,
  Trash2,
  Lock,
  ArrowRight,
  Brain,
  History,
  Send,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ApplicationShell } from "@/components/application/app-shell";
import type { AuthSession, ChurchRoleId } from "@/lib/auth";
import type { User } from "@supabase/supabase-js";

interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  display_title: string | null;
  is_pastoral: boolean;
  church_id: string | null;
  churches: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
  } | null;
}

interface TaskRecord {
  id: string;
  title: string;
  status: string;
  owner: string;
  priority: string;
  source: string;
  created_at: string;
}

interface RiskRecord {
  id: string;
  title: string;
  mitigation: string;
  severity: number;
  probability: number;
  owner: string;
}

interface DecisionRecord {
  id: string;
  title: string;
  owner: string;
  status: string;
  impact: string;
}

interface ChatSessionRecord {
  id: string;
  prompt: string;
  response: string;
  created_at: string;
}

// Map database roles to portal role ids
function mapSupabaseRole(rawRole: string | null): "church-admin" | "pastor" | "secretary" | "ministry-leader" | "member" | "super-admin" {
  switch (rawRole) {
    case "super_admin":
    case "super-admin": return "super-admin";
    case "church_admin": return "church-admin";
    case "pastor_elder": return "pastor";
    case "secretary": return "secretary";
    case "ministry_leader": return "ministry-leader";
    case "member_volunteer": return "member";
    default: return "member";
  }
}

const supabase = createClient("tenant");

export default function ProjectHQPage() {
  const router = useRouter();

  // Authentication & Session state
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userRole, setUserRole] = useState<"admin" | "manager" | "teacher" | "member" | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  // Table records state
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [risks, setRisks] = useState<RiskRecord[]>([]);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSessionRecord[]>([]);

  // Modals state
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<TaskRecord | null>(null);

  const [riskModalOpen, setRiskModalOpen] = useState(false);
  const [activeRisk, setActiveRisk] = useState<RiskRecord | null>(null);

  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [activeDecision, setActiveDecision] = useState<DecisionRecord | null>(null);

  // AI Advisor state
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedHistorySession, setSelectedHistorySession] = useState<ChatSessionRecord | null>(null);

  // Fetch tables data once role is validated
  const fetchRecords = useCallback(async () => {
    setDataLoading(true);
    try {
      const [tasksRes, risksRes, decisionsRes, sessionsRes] = await Promise.all([
        supabase.from("hq_tasks").select("*").order("created_at", { ascending: false }),
        supabase.from("hq_risks").select("*").order("created_at", { ascending: false }),
        supabase.from("hq_decisions").select("*").order("created_at", { ascending: false }),
        supabase.from("hq_sessions").select("*").order("created_at", { ascending: false }),
      ]);

      if (tasksRes.data) setTasks(tasksRes.data as TaskRecord[]);
      if (risksRes.data) setRisks(risksRes.data as RiskRecord[]);
      if (decisionsRes.data) setDecisions(decisionsRes.data as DecisionRecord[]);
      if (sessionsRes.data) setChatSessions(sessionsRes.data as ChatSessionRecord[]);
    } catch (err) {
      console.error("Fetch records error:", err);
      notifications.show({
        title: "Load Error",
        message: "Failed to load governance dashboard records.",
        color: "red",
      });
    } finally {
      setDataLoading(false);
    }
  }, []);

  // Load session & role
  useEffect(() => {
    async function initSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setSessionLoading(false);
          return;
        }
        setUser(session.user);

        // Fetch profile and church details
        const { data: profileData } = await supabase
          .from("profiles")
          .select(`
            id,
            user_id,
            full_name,
            email,
            role,
            display_title,
            is_pastoral,
            church_id,
            churches (
              id,
              name,
              slug,
              timezone
            )
          `)
          .eq("user_id", session.user.id)
          .maybeSingle();

        setProfile(profileData as unknown as Profile);

        // Fetch role via RPC
        const { data: roleData, error: roleError } = await supabase.rpc("current_user_role");
        if (roleError) {
          console.error("Error fetching user role:", roleError);
          setUserRole("member");
        } else {
          setUserRole(roleData as "admin" | "manager" | "teacher" | "member" | null);
        }
      } catch (err) {
        console.error("Auth session load error:", err);
      } finally {
        setSessionLoading(false);
      }
    }
    initSession();
  }, []);

  // Fetch tables data once role is validated
  useEffect(() => {
    if (userRole && userRole !== "member") {
      fetchRecords();
    }
  }, [userRole, fetchRecords]);

  // Permissions helper
  const canDelete = userRole === "admin";
  const canWrite = userRole === "admin" || userRole === "manager";

  // Task Mutations
  async function handleSaveTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    const formData = new FormData(event.currentTarget);
    const taskData = {
      title: String(formData.get("title")),
      status: String(formData.get("status")),
      owner: String(formData.get("owner") || ""),
      priority: String(formData.get("priority")),
      source: String(formData.get("source")),
      updated_at: new Date().toISOString(),
    };

    try {
      if (activeTask?.id) {
        // Update
        const { error } = await supabase
          .from("hq_tasks")
          .update(taskData)
          .eq("id", activeTask.id);
        if (error) throw error;
        notifications.show({ title: "Success", message: "Task updated successfully.", color: "green" });
      } else {
        // Insert
        const { error } = await supabase
          .from("hq_tasks")
          .insert(taskData);
        if (error) throw error;
        notifications.show({ title: "Success", message: "Task created successfully.", color: "green" });
      }
      setTaskModalOpen(false);
      fetchRecords();
    } catch (err) {
      notifications.show({ title: "Save Failed", message: err instanceof Error ? err.message : String(err), color: "red" });
    }
  }

  async function handleDeleteTask(id: string) {
    if (!canDelete) return;
    try {
      const { error } = await supabase.from("hq_tasks").delete().eq("id", id);
      if (error) throw error;
      notifications.show({ title: "Deleted", message: "Task deleted successfully.", color: "yellow" });
      fetchRecords();
    } catch (err) {
      notifications.show({ title: "Delete Failed", message: err instanceof Error ? err.message : String(err), color: "red" });
    }
  }

  // Risk Mutations
  async function handleSaveRisk(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    const formData = new FormData(event.currentTarget);
    const riskData = {
      title: String(formData.get("title")),
      mitigation: String(formData.get("mitigation") || ""),
      severity: Number(formData.get("severity")),
      probability: Number(formData.get("probability")),
      owner: String(formData.get("owner") || ""),
    };

    try {
      if (activeRisk?.id) {
        // Update
        const { error } = await supabase
          .from("hq_risks")
          .update(riskData)
          .eq("id", activeRisk.id);
        if (error) throw error;
        notifications.show({ title: "Success", message: "Risk updated successfully.", color: "green" });
      } else {
        // Insert
        const { error } = await supabase
          .from("hq_risks")
          .insert(riskData);
        if (error) throw error;
        notifications.show({ title: "Success", message: "Risk created successfully.", color: "green" });
      }
      setRiskModalOpen(false);
      fetchRecords();
    } catch (err) {
      notifications.show({ title: "Save Failed", message: err instanceof Error ? err.message : String(err), color: "red" });
    }
  }

  async function handleDeleteRisk(id: string) {
    if (!canDelete) return;
    try {
      const { error } = await supabase.from("hq_risks").delete().eq("id", id);
      if (error) throw error;
      notifications.show({ title: "Deleted", message: "Risk deleted successfully.", color: "yellow" });
      fetchRecords();
    } catch (err) {
      notifications.show({ title: "Delete Failed", message: err instanceof Error ? err.message : String(err), color: "red" });
    }
  }

  // Decision Mutations
  async function handleSaveDecision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    const formData = new FormData(event.currentTarget);
    const decisionData = {
      title: String(formData.get("title")),
      owner: String(formData.get("owner") || ""),
      status: String(formData.get("status")),
      impact: String(formData.get("impact")),
    };

    try {
      if (activeDecision?.id) {
        // Update
        const { error } = await supabase
          .from("hq_decisions")
          .update(decisionData)
          .eq("id", activeDecision.id);
        if (error) throw error;
        notifications.show({ title: "Success", message: "Decision updated successfully.", color: "green" });
      } else {
        // Insert
        const { error } = await supabase
          .from("hq_decisions")
          .insert(decisionData);
        if (error) throw error;
        notifications.show({ title: "Success", message: "Decision logged successfully.", color: "green" });
      }
      setDecisionModalOpen(false);
      fetchRecords();
    } catch (err) {
      notifications.show({ title: "Save Failed", message: err instanceof Error ? err.message : String(err), color: "red" });
    }
  }

  async function handleDeleteDecision(id: string) {
    if (!canDelete) return;
    try {
      const { error } = await supabase.from("hq_decisions").delete().eq("id", id);
      if (error) throw error;
      notifications.show({ title: "Deleted", message: "Decision deleted successfully.", color: "yellow" });
      fetchRecords();
    } catch (err) {
      notifications.show({ title: "Delete Failed", message: err instanceof Error ? err.message : String(err), color: "red" });
    }
  }

  // AI Queries
  async function handleCallAi(promptText?: string) {
    const activePrompt = promptText || aiPrompt;
    if (!activePrompt.trim()) return;

    setAiLoading(true);
    setAiResponse(null);
    setSelectedHistorySession(null);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: activePrompt,
          agentId: "hq-governance",
          agentName: "HQ Governance Advisor",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to contact AI agent.");
      }

      setAiResponse(data.response);
      setAiPrompt("");
      fetchRecords();
    } catch (err) {
      notifications.show({
        title: "AI Response Failed",
        message: err instanceof Error ? err.message : String(err),
        color: "red",
      });
    } finally {
      setAiLoading(false);
    }
  }

  // Pre-configured templates
  const aiTemplates = [
    {
      label: "Analyze Risks",
      prompt: "Based on our current risks table, what are the top 3 items we should prioritize for mitigation immediately, and what actions are recommended?",
    },
    {
      label: "Draft ADR Template",
      prompt: "Draft a new Architectural Decision Record (ADR) detailing why we prioritize database Row Level Security (RLS) over custom server logic for the LMS platform.",
    },
    {
      label: "Risk Task Mitigations",
      prompt: "Create a list of 5 actionable development tasks we can add to our backlog to mitigate the risk of 'AI tutor giving unsupervised incorrect guidance'.",
    },
  ];

  // Visual severity risk color
  function getSeverityColor(score: number) {
    if (score >= 4) return "red";
    if (score >= 3) return "orange";
    return "teal";
  }

  if (sessionLoading) {
    return (
      <Grid gap="xl" p="md" style={{ height: "100vh", overflow: "hidden" }}>
        {/* Mock Sidebar Nav */}
        <Grid.Col span={3} style={{ borderRight: "1px solid var(--mantine-color-gray-3)" }}>
          <Stack gap="md" p="md">
            <Skeleton height={30} width="60%" radius="sm" />
            <Skeleton height={20} width="80%" radius="sm" />
            <Skeleton height={40} radius="md" mt="md" />
            <Skeleton height={40} radius="md" />
            <Skeleton height={40} radius="md" />
            <Skeleton height={40} radius="md" />
          </Stack>
        </Grid.Col>

        {/* Mock Content Area */}
        <Grid.Col span={9}>
          <Stack gap="xl" p="md">
            {/* Header info */}
            <Stack gap="xs">
              <Skeleton height={35} width="30%" radius="md" />
              <Skeleton height={15} width="50%" radius="sm" />
            </Stack>

            {/* Mock Dashboard Cards Header */}
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              <Card withBorder radius="lg" p="md">
                <Stack gap="xs">
                  <Skeleton height={15} width="40%" />
                  <Skeleton height={35} width="20%" />
                  <Skeleton height={10} width="60%" />
                </Stack>
              </Card>
              <Card withBorder radius="lg" p="md">
                <Stack gap="xs">
                  <Skeleton height={15} width="40%" />
                  <Skeleton height={35} width="20%" />
                  <Skeleton height={10} width="60%" />
                </Stack>
              </Card>
              <Card withBorder radius="lg" p="md">
                <Stack gap="xs">
                  <Skeleton height={15} width="40%" />
                  <Skeleton height={35} width="20%" />
                  <Skeleton height={10} width="60%" />
                </Stack>
              </Card>
            </SimpleGrid>

            {/* Mock Main Tabbed Section / Table */}
            <Paper withBorder radius="xl" p="xl">
              <Stack gap="md">
                <Group justify="space-between">
                  <Skeleton height={30} width="20%" />
                  <Skeleton height={30} width="15%" />
                </Group>
                <Skeleton height={40} radius="sm" />
                <Skeleton height={35} radius="sm" />
                <Skeleton height={35} radius="sm" />
                <Skeleton height={35} radius="sm" />
                <Skeleton height={35} radius="sm" />
              </Stack>
            </Paper>
          </Stack>
        </Grid.Col>
      </Grid>
    );
  }

  if (!user) {
    return (
      <Center style={{ minHeight: "100vh" }}>
        <Card withBorder radius="md" p="xl" style={{ maxWidth: 400 }}>
          <Stack align="center" gap="md">
            <Lock size={32} color="red" />
            <Title order={3}>Authentication Required</Title>
            <Text c="dimmed" ta="center" size="sm">
              You must be signed in to access the Project HQ Governance Dashboard.
            </Text>
            <Button color="teal" fullWidth onClick={() => router.push("/sign-in")}>
              Go to Sign In
            </Button>
          </Stack>
        </Card>
      </Center>
    );
  }

  // Access check
  if (userRole === "member") {
    return (
      <Center style={{ minHeight: "100vh" }}>
        <Card withBorder radius="md" p="xl" style={{ maxWidth: 460 }}>
          <Stack align="center" gap="md">
            <Lock size={32} color="red" />
            <Title order={3}>Access Denied</Title>
            <Text c="dimmed" ta="center" size="sm">
              Project HQ is reserved exclusively for LMS administrators, managers, and teachers.
              Your account current role does not have authorization.
            </Text>
            <Button color="gray" fullWidth onClick={() => router.push("/workspace/member")}>
              Return to Member Portal
            </Button>
          </Stack>
        </Card>
      </Center>
    );
  }

  // Build client-side session details for sidebar display
  const portalRole = mapSupabaseRole(profile?.role || null);
  const customSession: AuthSession = {
    userId: user.id,
    source: "supabase",
    profile: {
      id: user.id,
      name: profile?.full_name || user.email?.split("@")[0] || "Staff Admin",
      email: user.email || "",
      title: profile?.display_title || (profile?.is_pastoral ? "Pastor / Elder" : "Governance"),
      roleId: portalRole,
      defaultPath: `/app/${portalRole}`,
      focus: `Project HQ governance.`,
      isPastoral: profile?.is_pastoral || false,
    },
    appContext: portalRole === "super-admin"
      ? {
          kind: "control",
          homePath: "/control",
        }
      : {
          kind: "church",
          source: "membership",
          church: {
            id: profile?.church_id || "00000000-0000-0000-0000-000000000000",
            name: profile?.churches?.name || "ChurchCore LMS",
            slug: profile?.churches?.slug || "churchcore",
            timezone: profile?.churches?.timezone || "America/New_York",
          },
          roleId: portalRole as ChurchRoleId,
          homePath: `/app/${portalRole}`,
        },
    homePath: `/app/${portalRole}`,
    canAccessControl: portalRole === "super-admin",
    memberships: [],
    tenantViews: [],
  };

  const navItems = [
    {
      href: `/app/${portalRole}`,
      label: "Home",
      description: "Return to workspace dashboard",
      icon: "Building2",
    },
    {
      href: "/hq",
      label: "Project HQ",
      description: "AI project governance dashboard",
      icon: "ShieldCheck",
      active: true,
    },
  ];

  return (
    <ApplicationShell
      session={customSession}
      workspaceHref={`/app/${portalRole}`}
      sectionLabel="Project HQ"
      title="Project HQ"
      sidebarTitle="Project Governance"
      sidebarDescription="AI-assisted Institutional Dashboard"
      description="Governance oversight, risk register, ADR log, and AI insights."
      navItems={navItems}
    >
      {/* ── Dashboard Cards Header ── */}
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <Card withBorder radius="lg" p="md" style={{ background: "linear-gradient(135deg, rgba(20, 184, 166, 0.05), rgba(37, 99, 235, 0.05))" }}>
          <Group justify="space-between">
            <Text size="xs" tt="uppercase" fw={800} c="dimmed">Active Backlog Tasks</Text>
            <CheckSquare size={16} color="teal" />
          </Group>
          <Group align="flex-end" gap="xs" mt="xs">
            <Text fw={900} size="xl" lh={1}>{tasks.filter(t => t.status !== "done").length}</Text>
            <Text size="xs" c="dimmed">out of {tasks.length} total</Text>
          </Group>
        </Card>

        <Card withBorder radius="lg" p="md" style={{ background: "linear-gradient(135deg, rgba(239, 68, 68, 0.05), rgba(249, 115, 22, 0.05))" }}>
          <Group justify="space-between">
            <Text size="xs" tt="uppercase" fw={800} c="dimmed">Identified Risks</Text>
            <AlertTriangle size={16} color="red" />
          </Group>
          <Group align="flex-end" gap="xs" mt="xs">
            <Text fw={900} size="xl" lh={1}>{risks.length}</Text>
            <Text size="xs" c="dimmed">with {risks.filter(r => r.severity >= 4).length} high severity</Text>
          </Group>
        </Card>

        <Card withBorder radius="lg" p="md" style={{ background: "linear-gradient(135deg, rgba(168, 85, 247, 0.05), rgba(59, 130, 246, 0.05))" }}>
          <Group justify="space-between">
            <Text size="xs" tt="uppercase" fw={800} c="dimmed">Accepted ADRs</Text>
            <Gavel size={16} color="purple" />
          </Group>
          <Group align="flex-end" gap="xs" mt="xs">
            <Text fw={900} size="xl" lh={1}>{decisions.filter(d => d.status === "Accepted").length}</Text>
            <Text size="xs" c="dimmed">logged decisions</Text>
          </Group>
        </Card>
      </SimpleGrid>

      {/* ── Main Tabbed Section ── */}
      <Paper withBorder radius="xl" p="xl" style={{ minHeight: 400 }}>
        {dataLoading && (
          <Group justify="center" py="md">
            <Loader color="teal" size="sm" />
            <Text size="xs" c="dimmed">Syncing database changes...</Text>
          </Group>
        )}

        <Tabs defaultValue="tasks" color="teal">
          <Tabs.List mb="md">
            <Tabs.Tab value="tasks" leftSection={<CheckSquare size={16} />}>
              Tasks
            </Tabs.Tab>
            <Tabs.Tab value="risks" leftSection={<AlertTriangle size={16} />}>
              Risks
            </Tabs.Tab>
            <Tabs.Tab value="decisions" leftSection={<Gavel size={16} />}>
              Decisions
            </Tabs.Tab>
            <Tabs.Tab value="ai" leftSection={<Sparkles size={16} />}>
              AI Advisor
            </Tabs.Tab>
          </Tabs.List>

          {/* ── Tasks Tab ── */}
          <Tabs.Panel value="tasks">
            <Stack gap="md">
              <Group justify="space-between">
                <div>
                  <Title order={3}>Backlog and Work-items</Title>
                  <Text size="xs" c="dimmed">Define tasks scope, owner assignments, and project origins.</Text>
                </div>
                {canWrite && (
                  <Button
                    size="sm"
                    radius="md"
                    color="teal"
                    leftSection={<Plus size={16} />}
                    onClick={() => {
                      setActiveTask(null);
                      setTaskModalOpen(true);
                    }}
                  >
                    Add Task
                  </Button>
                )}
              </Group>

              <Table striped highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Title</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Priority</Table.Th>
                    <Table.Th>Source</Table.Th>
                    <Table.Th>Owner</Table.Th>
                    {canWrite && <Table.Th>Actions</Table.Th>}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {tasks.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={6} style={{ textAlign: "center", color: "gray" }}>
                        No tasks found.
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    tasks.map((task) => (
                      <Table.Tr key={task.id}>
                        <Table.Td style={{ fontWeight: 600 }}>{task.title}</Table.Td>
                        <Table.Td>
                          <Badge
                            color={
                              task.status === "done" ? "green" :
                              task.status === "in_progress" ? "blue" :
                              task.status === "review" ? "grape" :
                              task.status === "blocked" ? "red" :
                              task.status === "ready" ? "cyan" : "gray"
                            }
                          >
                            {task.status.replace("_", " ")}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Badge color={task.priority === "P0" ? "red" : task.priority === "P1" ? "orange" : "blue"} variant="light">
                            {task.priority}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Badge color="gray" variant="outline">{task.source}</Badge>
                        </Table.Td>
                        <Table.Td>{task.owner || "Unassigned"}</Table.Td>
                        {canWrite && (
                          <Table.Td>
                            <Group gap="xs">
                              <ActionIcon
                                color="blue"
                                variant="light"
                                onClick={() => {
                                  setActiveTask(task);
                                  setTaskModalOpen(true);
                                }}
                              >
                                <Edit size={14} />
                              </ActionIcon>
                              {canDelete && (
                                <ActionIcon
                                  color="red"
                                  variant="light"
                                  onClick={() => handleDeleteTask(task.id)}
                                >
                                  <Trash2 size={14} />
                                </ActionIcon>
                              )}
                            </Group>
                          </Table.Td>
                        )}
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </Stack>
          </Tabs.Panel>

          {/* ── Risks Tab ── */}
          <Tabs.Panel value="risks">
            <Stack gap="md">
              <Group justify="space-between">
                <div>
                  <Title order={3}>Project Risk Register</Title>
                  <Text size="xs" c="dimmed">Track impact levels, mapping severity vs probability to mitigation triggers.</Text>
                </div>
                {canWrite && (
                  <Button
                    size="sm"
                    radius="md"
                    color="teal"
                    leftSection={<Plus size={16} />}
                    onClick={() => {
                      setActiveRisk(null);
                      setRiskModalOpen(true);
                    }}
                  >
                    Add Risk
                  </Button>
                )}
              </Group>

              <Table striped highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Risk Title</Table.Th>
                    <Table.Th>Severity</Table.Th>
                    <Table.Th>Probability</Table.Th>
                    <Table.Th>Owner</Table.Th>
                    <Table.Th>Mitigation Plan</Table.Th>
                    {canWrite && <Table.Th>Actions</Table.Th>}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {risks.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={6} style={{ textAlign: "center", color: "gray" }}>
                        No risks logged.
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    risks.map((risk) => (
                      <Table.Tr key={risk.id}>
                        <Table.Td style={{ fontWeight: 600 }}>{risk.title}</Table.Td>
                        <Table.Td>
                          <Badge color={getSeverityColor(risk.severity)}>
                            Severity {risk.severity}/5
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Badge color={getSeverityColor(risk.probability)}>
                            Probability {risk.probability}/5
                          </Badge>
                        </Table.Td>
                        <Table.Td>{risk.owner || "Unassigned"}</Table.Td>
                        <Table.Td style={{ maxWidth: 280, fontSize: "13px" }}>
                          {risk.mitigation || <Text size="xs" c="dimmed">No mitigation plan logged.</Text>}
                        </Table.Td>
                        {canWrite && (
                          <Table.Td>
                            <Group gap="xs">
                              <ActionIcon
                                color="blue"
                                variant="light"
                                onClick={() => {
                                  setActiveRisk(risk);
                                  setRiskModalOpen(true);
                                }}
                              >
                                <Edit size={14} />
                              </ActionIcon>
                              {canDelete && (
                                <ActionIcon
                                  color="red"
                                  variant="light"
                                  onClick={() => handleDeleteRisk(risk.id)}
                                >
                                  <Trash2 size={14} />
                                </ActionIcon>
                              )}
                            </Group>
                          </Table.Td>
                        )}
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </Stack>
          </Tabs.Panel>

          {/* ── Decisions Tab ── */}
          <Tabs.Panel value="decisions">
            <Stack gap="md">
              <Group justify="space-between">
                <div>
                  <Title order={3}>Decision Register (ADRs)</Title>
                  <Text size="xs" c="dimmed">Browse structural platform decisions and impact levels.</Text>
                </div>
                {canWrite && (
                  <Button
                    size="sm"
                    radius="md"
                    color="teal"
                    leftSection={<Plus size={16} />}
                    onClick={() => {
                      setActiveDecision(null);
                      setDecisionModalOpen(true);
                    }}
                  >
                    Add Decision
                  </Button>
                )}
              </Group>

              <Table striped highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Title</Table.Th>
                    <Table.Th>Impact</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Owner</Table.Th>
                    {canWrite && <Table.Th>Actions</Table.Th>}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {decisions.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={5} style={{ textAlign: "center", color: "gray" }}>
                        No decisions logged.
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    decisions.map((decision) => (
                      <Table.Tr key={decision.id}>
                        <Table.Td style={{ fontWeight: 600 }}>{decision.title}</Table.Td>
                        <Table.Td>
                          <Badge
                            color={
                              decision.impact === "Critical" ? "red" :
                              decision.impact === "High" ? "orange" :
                              decision.impact === "Medium" ? "blue" : "gray"
                            }
                          >
                            {decision.impact} Impact
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            color={
                              decision.status === "Accepted" ? "green" :
                              decision.status === "Proposed" ? "yellow" :
                              decision.status === "Rejected" ? "red" : "gray"
                            }
                            variant="light"
                          >
                            {decision.status}
                          </Badge>
                        </Table.Td>
                        <Table.Td>{decision.owner || "Unassigned"}</Table.Td>
                        {canWrite && (
                          <Table.Td>
                            <Group gap="xs">
                              <ActionIcon
                                color="blue"
                                variant="light"
                                onClick={() => {
                                  setActiveDecision(decision);
                                  setDecisionModalOpen(true);
                                }}
                              >
                                <Edit size={14} />
                              </ActionIcon>
                              {canDelete && (
                                <ActionIcon
                                  color="red"
                                  variant="light"
                                  onClick={() => handleDeleteDecision(decision.id)}
                                >
                                  <Trash2 size={14} />
                                </ActionIcon>
                              )}
                            </Group>
                          </Table.Td>
                        )}
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </Stack>
          </Tabs.Panel>

          {/* ── AI Advisor Tab ── */}
          <Tabs.Panel value="ai">
            <Grid gap="xl">
              {/* Left Column: AI Interface */}
              <Grid.Col span={{ base: 12, md: 8 }}>
                <Stack gap="md">
                  <div>
                    <Title order={3}>AI Governance Advisor</Title>
                    <Text size="xs" c="dimmed">Consult the project intelligence agent. Submits prompts via a secure, PII-scrubbed endpoint.</Text>
                  </div>

                  {/* Template Chips */}
                  <Group gap="xs">
                    {aiTemplates.map((tpl, idx) => (
                      <Button
                        key={idx}
                        size="xs"
                        variant="light"
                        color="teal"
                        onClick={() => handleCallAi(tpl.prompt)}
                        disabled={aiLoading}
                      >
                        {tpl.label}
                      </Button>
                    ))}
                  </Group>

                  <Card withBorder radius="lg" p="md">
                    <Stack gap="sm">
                      <Textarea
                        placeholder="Ask the AI Advisor for suggestions on risks, tasks, or structural log ADR entries..."
                        minRows={4}
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        disabled={aiLoading}
                      />
                      <Group justify="flex-end">
                        <Button
                          color="teal"
                          radius="md"
                          rightSection={aiLoading ? <Loader size="xs" color="white" /> : <Send size={14} />}
                          onClick={() => handleCallAi()}
                          loading={aiLoading}
                          disabled={!aiPrompt.trim()}
                        >
                          Consult Advisor
                        </Button>
                      </Group>
                    </Stack>
                  </Card>

                  {/* AI Response Display */}
                  {(aiResponse || selectedHistorySession) && (
                    <Card withBorder radius="lg" p="xl" style={{ borderLeft: "4px solid var(--mantine-color-teal-filled)" }}>
                      <Stack gap="xs">
                        <Group justify="space-between">
                          <Group gap="xs">
                            <Brain size={16} color="teal" />
                            <Text fw={700} size="sm" c="teal">
                              {selectedHistorySession ? "Institutional Memory Log" : "Advisor Response"}
                            </Text>
                          </Group>
                          {selectedHistorySession && (
                            <Text size="xs" c="dimmed">
                              Logged: {new Date(selectedHistorySession.created_at).toLocaleString()}
                            </Text>
                          )}
                        </Group>
                        
                        {selectedHistorySession && (
                          <Paper p="xs" withBorder style={{ background: "rgba(20, 33, 61, 0.02)" }}>
                            <Text size="xs" fw={700} c="dimmed">Scrubbed Prompt Request:</Text>
                            <Text size="sm" style={{ fontStyle: "italic" }}>
                              {selectedHistorySession.prompt}
                            </Text>
                          </Paper>
                        )}

                        <Text style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: "14px" }}>
                          {selectedHistorySession ? selectedHistorySession.response : aiResponse}
                        </Text>
                        
                        <Text size="xs" c="dimmed" mt="md" style={{ borderTop: "1px solid rgba(20, 33, 61, 0.08)", paddingTop: "8px" }}>
                          Disclaimer: Verify references against standard criteria before implementation. No PII is stored.
                        </Text>
                      </Stack>
                    </Card>
                  )}
                </Stack>
              </Grid.Col>

              {/* Right Column: Sessions History */}
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Stack gap="md">
                  <Group gap="xs">
                    <History size={16} color="teal" />
                    <Title order={4}>Session Logs</Title>
                  </Group>
                  <Text size="xs" c="dimmed">institutional records of AI governance queries.</Text>

                  <ScrollArea style={{ height: 400 }}>
                    <Stack gap="xs">
                      {chatSessions.length === 0 ? (
                        <Text size="xs" c="dimmed" ta="center" py="lg">
                          No previous sessions found.
                        </Text>
                      ) : (
                        chatSessions.map((session) => (
                          <Card
                            key={session.id}
                            withBorder
                            radius="md"
                            p="sm"
                            style={{
                              cursor: "pointer",
                              background: selectedHistorySession?.id === session.id ? "rgba(20, 184, 166, 0.05)" : "inherit",
                              borderColor: selectedHistorySession?.id === session.id ? "var(--mantine-color-teal-filled)" : undefined,
                            }}
                            onClick={() => setSelectedHistorySession(session)}
                          >
                            <Text fw={700} size="xs" truncate>{session.prompt}</Text>
                            <Group justify="space-between" mt={5}>
                              <Text size="10px" c="dimmed">
                                {new Date(session.created_at).toLocaleDateString()}
                              </Text>
                              <ArrowRight size={10} />
                            </Group>
                          </Card>
                        ))
                      )}
                    </Stack>
                  </ScrollArea>
                </Stack>
              </Grid.Col>
            </Grid>
          </Tabs.Panel>
        </Tabs>
      </Paper>

      {/* ── Task Add/Edit Modal ── */}
      <Modal
        opened={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        title={activeTask ? "Edit Governance Task" : "Create Governance Task"}
        radius="lg"
      >
        <form onSubmit={handleSaveTask}>
          <Stack gap="sm">
            <TextInput
              label="Task Title"
              name="title"
              defaultValue={activeTask?.title || ""}
              required
              placeholder="e.g. Draft ADR-001: Canvas Block Model"
            />
            <Select
              label="Status"
              name="status"
              data={[
                { value: "backlog", label: "Backlog" },
                { value: "ready", label: "Ready" },
                { value: "in_progress", label: "In Progress" },
                { value: "review", label: "Review" },
                { value: "blocked", label: "Blocked" },
                { value: "done", label: "Done" },
              ]}
              defaultValue={activeTask?.status || "backlog"}
              required
            />
            <Select
              label="Priority"
              name="priority"
              data={[
                { value: "P0", label: "P0 (Critical)" },
                { value: "P1", label: "P1 (High)" },
                { value: "P2", label: "P2 (Medium)" },
                { value: "P3", label: "P3 (Low)" },
              ]}
              defaultValue={activeTask?.priority || "P2"}
              required
            />
            <Select
              label="Source"
              name="source"
              data={[
                { value: "manual", label: "Manual Input" },
                { value: "risk", label: "Risk Mitigation Trigger" },
                { value: "council", label: "Elders Council Directive" },
              ]}
              defaultValue={activeTask?.source || "manual"}
              required
            />
            <TextInput
              label="Assignee Owner"
              name="owner"
              defaultValue={activeTask?.owner || ""}
              placeholder="e.g. The Engineer"
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setTaskModalOpen(false)}>Cancel</Button>
              <Button type="submit" color="teal">Save Task</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* ── Risk Add/Edit Modal ── */}
      <Modal
        opened={riskModalOpen}
        onClose={() => setRiskModalOpen(false)}
        title={activeRisk ? "Edit Risk Record" : "Create Risk Record"}
        radius="lg"
      >
        <form onSubmit={handleSaveRisk}>
          <Stack gap="sm">
            <TextInput
              label="Risk Title"
              name="title"
              defaultValue={activeRisk?.title || ""}
              required
              placeholder="e.g. Feature bloat delays MVP"
            />
            <Select
              label="Severity (1-5)"
              name="severity"
              data={["1", "2", "3", "4", "5"]}
              defaultValue={String(activeRisk?.severity || "3")}
              required
            />
            <Select
              label="Probability (1-5)"
              name="probability"
              data={["1", "2", "3", "4", "5"]}
              defaultValue={String(activeRisk?.probability || "3")}
              required
            />
            <TextInput
              label="Risk Owner"
              name="owner"
              defaultValue={activeRisk?.owner || ""}
              placeholder="e.g. Security Officer"
            />
            <Textarea
              label="Mitigation Plan"
              name="mitigation"
              defaultValue={activeRisk?.mitigation || ""}
              rows={3}
              placeholder="Detail actions taken to resolve risk trigger..."
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setRiskModalOpen(false)}>Cancel</Button>
              <Button type="submit" color="teal">Save Risk</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* ── Decision Add/Edit Modal ── */}
      <Modal
        opened={decisionModalOpen}
        onClose={() => setDecisionModalOpen(false)}
        title={activeDecision ? "Edit Decision Log (ADR)" : "Create Decision Log (ADR)"}
        radius="lg"
      >
        <form onSubmit={handleSaveDecision}>
          <Stack gap="sm">
            <TextInput
              label="ADR Title"
              name="title"
              defaultValue={activeDecision?.title || ""}
              required
              placeholder="e.g. RLS is the authorization source of truth"
            />
            <Select
              label="Status"
              name="status"
              data={[
                { value: "Proposed", label: "Proposed" },
                { value: "Accepted", label: "Accepted" },
                { value: "Rejected", label: "Rejected" },
                { value: "Superseded", label: "Superseded" },
              ]}
              defaultValue={activeDecision?.status || "Proposed"}
              required
            />
            <Select
              label="Impact"
              name="impact"
              data={[
                { value: "Critical", label: "Critical" },
                { value: "High", label: "High" },
                { value: "Medium", label: "Medium" },
                { value: "Low", label: "Low" },
              ]}
              defaultValue={activeDecision?.impact || "Medium"}
              required
            />
            <TextInput
              label="Decision Owner / Champion"
              name="owner"
              defaultValue={activeDecision?.owner || ""}
              placeholder="e.g. The Architect"
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setDecisionModalOpen(false)}>Cancel</Button>
              <Button type="submit" color="teal">Save Log</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </ApplicationShell>
  );
}
