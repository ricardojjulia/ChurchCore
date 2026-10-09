"use client";

import { useActionState } from "react";
import { Alert, Button, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { AlertTriangle, Tablet } from "lucide-react";

import { startKioskAction, type StartKioskState } from "@/app/app/church-admin/children/kiosk/actions";
import { ApplicationShell } from "@/components/application/app-shell";
import { ccmNavItems } from "@/components/application/ccm-nav";
import { useI18n } from "@/components/i18n-provider";
import type { ChurchAppSession } from "@/lib/auth";

export function CcmKioskStart({ session }: { session: ChurchAppSession }) {
  const { t } = useI18n();
  const k = (key: string) => t("kiosk", key);
  // The action redirects on success; a bad PIN comes back as a status to show.
  const [state, formAction, pending] = useActionState<StartKioskState | null, FormData>(
    async (previous, formData) => (await startKioskAction(previous, formData)) ?? null,
    null,
  );

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
        <form action={formAction}>
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
              size="lg"
            />
            <Text size="sm" c="dimmed">
              {k("exitPinSetupHelp")}
            </Text>
            <PasswordInput
              name="exitPin"
              label={k("exitPinSetupLabel")}
              inputMode="numeric"
              maxLength={6}
              autoComplete="off"
              size="lg"
              required
              visibilityToggleButtonProps={{ style: { width: 44, height: 44 } }}
            />
            <PasswordInput
              name="exitPinConfirm"
              label={k("exitPinConfirmLabel")}
              inputMode="numeric"
              maxLength={6}
              autoComplete="off"
              size="lg"
              required
              visibilityToggleButtonProps={{ style: { width: 44, height: 44 } }}
            />
            {state ? (
              <Alert role="alert" color="red" icon={<AlertTriangle size={18} />}>
                {k(state.status === "invalid_pin" ? "exitPinInvalid" : "exitPinMismatch")}
              </Alert>
            ) : null}
            <Button
              type="submit"
              color="indigo"
              mih={44}
              loading={pending}
              disabled={pending}
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
