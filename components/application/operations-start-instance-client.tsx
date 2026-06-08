"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Alert,
  Button,
  Group,
  NativeSelect,
  Paper,
  Stack,
  Title,
} from "@mantine/core";
import { AlertCircle } from "lucide-react";

import { ApplicationShell } from "@/components/application/app-shell";
import { startOnboardingInstanceAction } from "@/app/app/church-admin/operations/actions";
import type { AuthSession } from "@/lib/auth";
import type { OnboardingTemplate } from "@/lib/operations-types";

export function OperationsStartInstanceClient({
  session,
  profiles,
  templates,
}: {
  session: AuthSession;
  profiles: Array<{ id: string; fullName: string }>;
  templates: OnboardingTemplate[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    profileId?: string;
    templateId?: string;
  }>({});

  function validate() {
    const errors: typeof fieldErrors = {};
    if (!profileId) errors.profileId = "Please select a member.";
    if (!templateId) errors.templateId = "Please select a template.";
    return errors;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    startTransition(async () => {
      const result = await startOnboardingInstanceAction({ profileId, templateId });
      if (!result.ok) {
        setError(result.error ?? "Unable to start onboarding.");
        return;
      }
      router.push(
        `/app/church-admin/operations/onboarding/instances/${result.instanceId}`,
      );
    });
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref={session.homePath}
      sectionLabel="Church Admin"
      title="Start Onboarding"
      description="Assign a template to a member"
      sidebarTitle="Operations"
      sidebarDescription="Documents & onboarding"
      navItems={[
        {
          href: "/app/church-admin/operations/documents",
          label: "Documents",
          description: "Church documents library",
          icon: "ClipboardList",
        },
        {
          href: "/app/church-admin/operations/onboarding",
          label: "Onboarding",
          description: "Templates & active onboarding",
          icon: "UserPlus",
          active: true,
        },
      ]}
    >
      <Stack gap="lg" maw={560}>
        <Title order={2} fw={700} c="#101827">
          Start Onboarding
        </Title>

        {error ? (
          <Alert color="red" icon={<AlertCircle size={16} />}>
            {error}
          </Alert>
        ) : null}

        {profiles.length === 0 ? (
          <Alert color="yellow" icon={<AlertCircle size={16} />}>
            No member profiles found for this church.
          </Alert>
        ) : null}

        {templates.length === 0 ? (
          <Alert color="yellow" icon={<AlertCircle size={16} />}>
            No onboarding templates found. Create a template first.
          </Alert>
        ) : null}

        <Paper radius="md" p="lg" withBorder>
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <NativeSelect
                label="Member"
                description="Select the member to onboard"
                data={profiles.map((p) => ({ value: p.id, label: p.fullName }))}
                value={profileId}
                onChange={(e) => setProfileId(e.currentTarget.value)}
                error={fieldErrors.profileId}
                disabled={profiles.length === 0}
              />

              <NativeSelect
                label="Onboarding template"
                description="Select a template to use for this onboarding"
                data={templates.map((t) => ({ value: t.id, label: t.name }))}
                value={templateId}
                onChange={(e) => setTemplateId(e.currentTarget.value)}
                error={fieldErrors.templateId}
                disabled={templates.length === 0}
              />

              <Group justify="flex-end" gap="sm" pt="sm">
                <Button
                  variant="default"
                  component={Link}
                  href="/app/church-admin/operations/onboarding"
                  type="button"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  color="teal"
                  loading={isPending}
                  disabled={profiles.length === 0 || templates.length === 0}
                >
                  Start onboarding
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </ApplicationShell>
  );
}
