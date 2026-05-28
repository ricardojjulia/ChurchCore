import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Alert, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";

import { LanguageSelect } from "@/components/language-select";
import { getSession } from "@/lib/auth";
import { getRequestedPublicChurch } from "@/lib/public-portal-data";
import { localeCookieName, messages, normalizeLocale } from "@/lib/i18n";

export default async function PortalPage() {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(localeCookieName)?.value);
  const translate = (
    key: keyof typeof messages.en.portal,
    values?: Record<string, string | number>,
  ) => {
    const template = String(messages[locale].portal[key] ?? messages.en.portal[key]);
    if (!values) return template;
    return Object.entries(values).reduce(
      (next, [valueKey, replacement]) =>
        next.replaceAll(`{${valueKey}}`, String(replacement)),
      template,
    );
  };
  const [session, requestedChurch] = await Promise.all([
    getSession("/portal"),
    getRequestedPublicChurch(),
  ]);

  if (session?.appContext.kind === "church") {
    if (session.appContext.roleId === "member") {
      redirect("/app/member");
    }

    redirect(session.homePath);
  }

  return (
    <main className="portal-page-bg min-h-screen grid place-items-center px-4 py-8">
      <Paper withBorder radius="xl" p={{ base: "lg", sm: "xl" }} maw={720} w="100%">
        <Stack gap="lg">
          <div>
            <Text size="sm" fw={700} c="dimmed" tt="uppercase">
              {translate("portal")}
            </Text>
            <Title order={1} mt="sm">
              {translate("secureMemberAccess")}
            </Title>
            <Text c="dimmed" mt="md">
              {translate("signInOrRequest")}
            </Text>
          </div>

          {requestedChurch ? (
            <Alert color="teal" radius="xl" variant="light">
              {translate("detectedChurch", { church: requestedChurch.name })}
            </Alert>
          ) : null}

          <Group>
            <LanguageSelect />
            <Button component="a" href="/sign-in?redirectTo=%2Fportal">
              {translate("signIn")}
            </Button>
            <Button
              component="a"
              href={
                requestedChurch
                  ? `/portal/register?church=${encodeURIComponent(requestedChurch.slug)}`
                  : "/portal/register"
              }
              variant="default"
            >
              {translate("requestAccess")}
            </Button>
            <Button
              component="a"
              href={
                requestedChurch
                  ? `/portal/events/register?church=${encodeURIComponent(requestedChurch.slug)}`
                  : "/portal/events/register"
              }
              variant="light"
            >
              Register for events
            </Button>
          </Group>
        </Stack>
      </Paper>
    </main>
  );
}
