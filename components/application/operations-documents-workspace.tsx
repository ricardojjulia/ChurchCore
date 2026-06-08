"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { AlertCircle, FilePlus, FileText } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import type { AuthSession } from "@/lib/auth";
import type { ChurchDocumentListItem, ChurchDocumentType } from "@/lib/operations-types";

const DOC_TYPE_LABELS: Record<ChurchDocumentType, string> = {
  vision_mission: "Vision / Mission",
  faith_stance: "Faith Stance",
  policy: "Policy",
  general: "General",
  elder_council_notes: "Elder Council Notes",
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function OperationsDocumentsWorkspace({
  session,
  documents,
  loadError,
}: {
  session: AuthSession;
  documents: ChurchDocumentListItem[];
  loadError?: string;
}) {
  const router = useRouter();
  return (
    <ApplicationShell
      session={session}
      workspaceHref={session.homePath}
      sectionLabel="Church Admin"
      title="Church Documents"
      description="Manage your church's official documents"
      sidebarTitle="Operations"
      sidebarDescription="Documents & onboarding"
      navItems={[
        {
          href: "/app/church-admin/operations/documents",
          label: "Documents",
          description: "Church documents library",
          icon: "ClipboardList",
          active: true,
        },
        {
          href: "/app/church-admin/operations/onboarding",
          label: "Onboarding",
          description: "Templates & active onboarding",
          icon: "UserPlus",
        },
      ]}
    >
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Title order={2} fw={700} c="#101827">
            Church Documents
          </Title>
          <Button
            component={Link}
            href="/app/church-admin/operations/documents/new"
            leftSection={<FilePlus size={16} />}
            color="teal"
          >
            New document
          </Button>
        </Group>

        {loadError ? (
          <Alert color="red" icon={<AlertCircle size={16} />}>
            {loadError}
          </Alert>
        ) : null}

        {documents.length === 0 && !loadError ? (
          <Paper
            radius="md"
            p="xl"
            style={{
              border: "1px dashed rgba(20, 33, 61, 0.15)",
              textAlign: "center",
            }}
          >
            <FileText size={40} color="#9ca3af" style={{ margin: "0 auto 12px" }} />
            <Text c="#617184" size="sm">
              No documents yet. Create your first document.
            </Text>
          </Paper>
        ) : null}

        {documents.length > 0 ? (
          <Paper radius="md" withBorder style={{ overflow: "hidden" }}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Title</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Last updated</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {documents.map((doc) => (
                  <Table.Tr
                    key={doc.id}
                    style={{ cursor: "pointer" }}
                    onClick={() =>
                      router.push(`/app/church-admin/operations/documents/${doc.id}`)
                    }
                  >
                    <Table.Td>
                      <Group gap="xs">
                        <Text fw={500} size="sm">
                          {doc.title}
                        </Text>
                        {doc.docType === "elder_council_notes" ? (
                          <Badge color="red" size="xs">
                            Restricted
                          </Badge>
                        ) : null}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="#617184">
                        {DOC_TYPE_LABELS[doc.docType]}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="#617184">
                        {formatDate(doc.updatedAt)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        ) : null}
      </Stack>
    </ApplicationShell>
  );
}
