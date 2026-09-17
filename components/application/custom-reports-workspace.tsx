"use client";

import { useState } from "react";
import {
  Button,
  Card,
  SimpleGrid,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Alert,
} from "@mantine/core";
import {
  CalendarRange,
  Coins,
  Download,
  FileSpreadsheet,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { ChurchAppSession } from "@/lib/auth";

type EntityType = "people" | "giving" | "events";

interface EntityConfig {
  id: EntityType;
  title: string;
  description: string;
  icon: typeof UsersRound;
  tone: string;
  bg: string;
  fields: string[];
  sampleData: string;
}

const ENTITIES: EntityConfig[] = [
  {
    id: "people",
    title: "People Directory",
    description: "Profiles, roles, membership status, and registration details.",
    icon: UsersRound,
    tone: "churchBlue",
    bg: "linear-gradient(180deg, rgba(239,246,255,1) 0%, rgba(255,255,255,1) 100%)",
    fields: [
      "Profile ID",
      "Full Name",
      "Email Address",
      "Phone Number",
      "System Role",
      "Membership Status",
      "Created Timestamp",
    ],
    sampleData: "John Doe, john@example.com, +15550199, member_volunteer, Active",
  },
  {
    id: "giving",
    title: "Giving & Generosity",
    description: "Donations history, currencies, status, and fund designations.",
    icon: Coins,
    tone: "grape",
    bg: "linear-gradient(180deg, rgba(250,245,255,1) 0%, rgba(255,255,255,1) 100%)",
    fields: [
      "Donation ID",
      "Donor Name",
      "Donor Email",
      "Amount Cents",
      "Currency",
      "Fund Designation",
      "Status",
      "Created Timestamp",
    ],
    sampleData: "Jane Smith, jane.s@example.com, 5000, USD, General Fund, completed",
  },
  {
    id: "events",
    title: "Events & Attendance",
    description: "Historical church events, timing, categories, and setup data.",
    icon: CalendarRange,
    tone: "teal",
    bg: "linear-gradient(180deg, rgba(240,253,250,1) 0%, rgba(255,255,255,1) 100%)",
    fields: [
      "Event ID",
      "Title",
      "Description",
      "Starts At",
      "Ends At",
      "Category",
      "Created Timestamp",
    ],
    sampleData: "Youth Fellowship, Weekly gathering, 2026-06-25, 2026-06-25, youth",
  },
];

export function CustomReportsWorkspace({ session }: { session: ChurchAppSession }) {
  const [selectedEntity, setSelectedEntity] = useState<EntityType>("people");
  const [isExporting, setIsExporting] = useState(false);

  const activeConfig = ENTITIES.find((e) => e.id === selectedEntity)!;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Create a native link download invocation
      const url = `/api/reports/custom?entity=${selectedEntity}`;
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `custom-${selectedEntity}-report.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Export download failed:", error);
    } finally {
      // Briefly show loading/success micro-animation state
      setTimeout(() => {
        setIsExporting(false);
      }, 1500);
    }
  };

  return (
    <Stack gap="xl">
      <div>
        <Title order={3} size="h3" mb="xs">
          Select Data Source
        </Title>
        <Text size="sm" c="dimmed">
          Choose a database category to export. Exports are generated on demand in high-integrity CSV formats, matching current active tenant boundaries.
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        {ENTITIES.map((entity) => {
          const isSelected = selectedEntity === entity.id;
          return (
            <Card
              key={entity.id}
              padding="lg"
              radius="xl"
              withBorder
              onClick={() => setSelectedEntity(entity.id)}
              style={{
                cursor: "pointer",
                transition: "all 0.2s ease-in-out",
                border: isSelected
                  ? `2px solid var(--mantine-color-${entity.tone}-filled)`
                  : "1px solid var(--mantine-color-gray-3)",
                boxShadow: isSelected
                  ? "0 8px 24px rgba(0,0,0,0.06)"
                  : "none",
                transform: isSelected ? "translateY(-4px)" : "none",
                background: entity.bg,
              }}
            >
              <Stack gap="md" justify="space-between" style={{ height: "100%" }}>
                <Group justify="space-between">
                  <ThemeIcon
                    color={entity.tone}
                    variant={isSelected ? "filled" : "light"}
                    radius="xl"
                    size="xl"
                  >
                    <entity.icon size={18} />
                  </ThemeIcon>
                  {isSelected && (
                    <Text size="xs" fw={700} c={entity.tone} tt="uppercase">
                      Selected
                    </Text>
                  )}
                </Group>

                <div>
                  <Text size="lg" fw={700} mt="xs">
                    {entity.title}
                  </Text>
                  <Text size="sm" c="dimmed" mt={4}>
                    {entity.description}
                  </Text>
                </div>
              </Stack>
            </Card>
          );
        })}
      </SimpleGrid>

      <Paper withBorder radius="xl" p="xl" style={{ position: "relative", overflow: "hidden" }}>
        <Stack gap="lg">
          <Group justify="space-between" align="center">
            <div>
              <Title order={4} size="h4" mb={4}>
                Export Summary: {activeConfig.title}
              </Title>
              <Text size="xs" c="dimmed" ff="monospace">
                Sample structure: {activeConfig.sampleData}...
              </Text>
            </div>
            <ThemeIcon color={activeConfig.tone} variant="light" size="xl" radius="xl">
              <FileSpreadsheet size={20} />
            </ThemeIcon>
          </Group>

          <Paper bg="var(--mantine-color-gray-0)" p="md" radius="lg" withBorder>
            <Text size="sm" fw={600} mb="xs">
              Columns included in this CSV:
            </Text>
            <Group gap="xs" wrap="wrap">
              {activeConfig.fields.map((field) => (
                <Paper
                  key={field}
                  p="xs"
                  radius="md"
                  withBorder
                  style={{
                    backgroundColor: "white",
                    display: "flex",
                    alignItems: "center",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.01)",
                  }}
                >
                  <Text size="xs" fw={600}>
                    {field}
                  </Text>
                </Paper>
              ))}
            </Group>
          </Paper>

          <Alert
            icon={<ShieldCheck size={16} />}
            title="GDPR & Security Isolation Safeguards"
            color="churchBlue"
            radius="lg"
            variant="light"
          >
            <Stack gap="xs">
              <Text size="xs">
                This custom query export is strictly isolated to the active tenant{" "}
                <strong>{session.appContext.church.name}</strong>. Cross-tenant boundaries are hardened and queries are parametrized to prevent leakages.
              </Text>
              <Text size="xs">
                <strong>Data Minimization Compliance:</strong> This export will be audit logged, recording only the row count and data scope. Raw donor financial amounts and sensitive attributes are excluded from audit logging.
              </Text>
            </Stack>
          </Alert>

          <Group justify="flex-end" mt="md">
            <Button
              size="md"
              radius="xl"
              color={activeConfig.tone}
              leftSection={<Download size={16} />}
              loading={isExporting}
              onClick={handleExport}
              styles={{
                root: {
                  transition: "transform 0.15s ease",
                  "&:active": {
                    transform: "scale(0.97)",
                  },
                },
              }}
            >
              Export CSV SpreadSheet
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
