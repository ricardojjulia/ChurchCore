"use client";

import { Button, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { Tablet } from "lucide-react";

import { startKioskAction } from "@/app/app/church-admin/children/kiosk/actions";
import { ApplicationShell } from "@/components/application/app-shell";
import { ccmNavItems } from "@/components/application/ccm-nav";
import { useI18n } from "@/components/i18n-provider";
import type { ChurchAppSession } from "@/lib/auth";

export function CcmKioskStart({ session }: { session: ChurchAppSession }) {
  const { t } = useI18n();
  const k = (key: string) => t("kiosk", key);

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel={k("pageSectionLabel")}
      title={k("pageTitle")}
      description={session.appContext.church?.name ?? ""}
      sidebarTitle={k("pageSectionLabel")}
      sidebarDescription={k("pageSidebarDescription")}
      navLabel="CCM"
      navItems={ccmNavItems("/app/church-admin/children/kiosk")}
    >
      <Paper withBorder radius="lg" p="lg" maw={560}>
        <form action={startKioskAction}>
          <Stack gap="md">
            <Title order={3}>{k("pageTitle")}</Title>
            <Text size="sm">{k("pageIntro")}</Text>
            <Text size="sm" c="dimmed">
              {k("pageLockNote")}
            </Text>
            <TextInput
              name="deviceNote"
              label={k("deviceNoteLabel")}
              placeholder={k("deviceNotePlaceholder")}
              maxLength={80}
              size="md"
            />
            <Button
              type="submit"
              color="indigo"
              mih={44}
              leftSection={<Tablet size={18} />}
              data-primary-action
            >
              {k("startKiosk")}
            </Button>
          </Stack>
        </form>
      </Paper>
    </ApplicationShell>
  );
}
