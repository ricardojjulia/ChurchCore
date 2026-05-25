"use client";

import { useState, useTransition } from "react";
import {
  Alert,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  BarChart2,
  Building2,
  CheckCircle2,
  HeartHandshake,
  MailCheck,
  Settings,
  UsersRound,
} from "lucide-react";

import {
  updateChurchSettingsAction,
  type UpdateChurchSettingsInput,
} from "@/app/app/church-admin-actions";
import { ApplicationShell } from "@/components/application/app-shell";
import { ChurchAppContextBanner } from "@/components/application/church-app-context-banner";
import { useI18n } from "@/components/i18n-provider";
import type { ChurchAppSession } from "@/lib/auth";
import type { ChurchSettingsData } from "@/lib/church-settings-data";

const timezones = [
  "America/New_York",
  "America/Detroit",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export function ChurchAdminSettingsWorkspace({
  session,
  settings,
}: {
  session: ChurchAppSession;
  settings: ChurchSettingsData;
}) {
  const [form, setForm] = useState<UpdateChurchSettingsInput>({
    name: settings.name,
    legalName: settings.legalName,
    timezone: settings.timezone,
    websiteUrl: settings.websiteUrl,
    contactEmail: settings.contactEmail,
    contactPhone: settings.contactPhone,
    mailingAddress: settings.mailingAddress,
    publicSummary: settings.publicSummary,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { t } = useI18n();
  const translateSettings = (key: string) => t("churchSettings", key);

  function updateField(field: keyof UpdateChurchSettingsInput, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const result = await updateChurchSettingsAction(form);

      if (!result.ok) {
        setError(result.error ?? translateSettings("updateError"));
        return;
      }

      setMessage(
        result.previewMode
          ? translateSettings("previewAccepted")
          : translateSettings("updated"),
      );
    });
  }

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel={t("portalNav", "churchAdmin")}
      title={translateSettings("title")}
      description={settings.name}
      sidebarTitle={translateSettings("churchSetup")}
      sidebarDescription={translateSettings("sidebarDescription")}
      navLabel={t("portalNav", "churchAdmin")}
      navItems={[
        {
          href: "/app/church-admin",
          label: t("portalNav", "home"),
          description: t("portalNav", "operations"),
          icon: HeartHandshake,
        },
        {
          href: "/app/church-admin/settings",
          label: t("portalNav", "settings"),
          description: t("portalNav", "churchSetup"),
          icon: Settings,
          active: true,
        },
        {
          href: "/app/church-admin/people",
          label: t("portalNav", "people"),
          description: t("portalNav", "peopleDescription"),
          icon: UsersRound,
        },
        {
          href: "/app/church-admin/accounts",
          label: t("accountRequests", "accounts"),
          description: t("portalNav", "accountRequestsDescription"),
          icon: MailCheck,
        },
        {
          href: "/app/reports",
          label: t("portalNav", "reports"),
          description: t("portalNav", "reportsDescription"),
          icon: BarChart2,
        },
      ]}
    >
      <ChurchAppContextBanner session={session} />

      <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="lg">
        <Paper withBorder radius="xl" p="xl">
          <Group gap="sm" mb="md">
            <ThemeIcon color="gray" variant="light" radius="xl" size="lg">
              <Building2 size={18} />
            </ThemeIcon>
            <div>
              <Title order={3} size="h4">
                {translateSettings("tenantProfile")}
              </Title>
              <Text size="sm" c="dimmed">
                {settings.slug}
              </Text>
            </div>
          </Group>

          <Stack gap="xs">
            <Text size="sm">
              <Text span fw={700}>{translateSettings("timezone")}:</Text>{" "}
              {settings.timezone}
            </Text>
            <Text size="sm">
              <Text span fw={700}>{translateSettings("contact")}:</Text>{" "}
              {settings.contactEmail ??
                settings.contactPhone ??
                translateSettings("notSet")}
            </Text>
            <Text size="sm">
              <Text span fw={700}>{translateSettings("website")}:</Text>{" "}
              {settings.websiteUrl ?? translateSettings("notSet")}
            </Text>
          </Stack>
        </Paper>

        <Paper withBorder radius="xl" p="xl">
          <Group gap="sm" mb="lg">
            <ThemeIcon color="gray" variant="light" radius="xl" size="lg">
              <Settings size={18} />
            </ThemeIcon>
            <div>
              <Title order={3} size="h4">
                {translateSettings("setupDetails")}
              </Title>
              <Text size="sm" c="dimmed">
                {translateSettings("setupDescription")}
              </Text>
            </div>
          </Group>

          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              {message ? (
                <Alert color="green" icon={<CheckCircle2 size={16} />}>
                  {message}
                </Alert>
              ) : null}
              {error ? <Alert color="red">{error}</Alert> : null}

              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                <TextInput
                  label={translateSettings("churchName")}
                  value={form.name}
                  onChange={(event) => updateField("name", event.currentTarget.value)}
                  required
                />
                <TextInput
                  label={translateSettings("legalName")}
                  value={form.legalName ?? ""}
                  onChange={(event) => updateField("legalName", event.currentTarget.value)}
                />
                <TextInput
                  label={translateSettings("timezone")}
                  value={form.timezone}
                  onChange={(event) => updateField("timezone", event.currentTarget.value)}
                  list="church-timezones"
                  required
                />
                <TextInput
                  label={translateSettings("website")}
                  value={form.websiteUrl ?? ""}
                  onChange={(event) => updateField("websiteUrl", event.currentTarget.value)}
                  placeholder="https://example.church"
                />
                <TextInput
                  label={translateSettings("contactEmail")}
                  value={form.contactEmail ?? ""}
                  onChange={(event) => updateField("contactEmail", event.currentTarget.value)}
                  type="email"
                />
                <TextInput
                  label={translateSettings("contactPhone")}
                  value={form.contactPhone ?? ""}
                  onChange={(event) => updateField("contactPhone", event.currentTarget.value)}
                />
              </SimpleGrid>

              <datalist id="church-timezones">
                {timezones.map((timezone) => (
                  <option key={timezone} value={timezone} />
                ))}
              </datalist>

              <Textarea
                label={translateSettings("mailingAddress")}
                value={form.mailingAddress ?? ""}
                onChange={(event) => updateField("mailingAddress", event.currentTarget.value)}
                autosize
                minRows={2}
              />
              <Textarea
                label={translateSettings("publicSummary")}
                value={form.publicSummary ?? ""}
                onChange={(event) => updateField("publicSummary", event.currentTarget.value)}
                autosize
                minRows={3}
                maxLength={500}
              />

              <Group justify="flex-end">
                <Button type="submit" loading={pending}>
                  {translateSettings("saveSettings")}
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </SimpleGrid>
    </ApplicationShell>
  );
}
