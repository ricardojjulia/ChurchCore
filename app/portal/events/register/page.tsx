import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Alert, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";

import { LanguageSelect } from "@/components/language-select";
import { PublicEventRegistrationPanel } from "@/components/portal/public-event-registration-panel";
import { localeCookieName, messages, normalizeLocale } from "@/lib/i18n";
import {
  getPublicPortalChurches,
  getRequestedPublicChurch,
} from "@/lib/public-portal-data";
import { getPublicEventRegistrationOptions } from "@/lib/public-event-registration-data";

export const metadata: Metadata = {
  title: "Event Registration | ChurchCore",
  description: "Register for public church events.",
};

export default async function PublicEventRegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ church?: string }>;
}) {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(localeCookieName)?.value);
  const translate = (key: keyof typeof messages.en.portal) =>
    messages[locale].portal[key] ?? messages.en.portal[key];

  const [churches, requestedChurch, params] = await Promise.all([
    getPublicPortalChurches(),
    getRequestedPublicChurch(),
    searchParams,
  ]);

  const selectedChurch =
    requestedChurch ??
    churches.find((entry) => entry.id === params.church || entry.slug === params.church) ??
    null;

  const options = selectedChurch
    ? await getPublicEventRegistrationOptions(selectedChurch.id)
    : [];

  return (
    <main className="portal-register-bg min-h-screen px-4 py-8">
      <div className="max-w-[960px] mx-auto">
        <Stack gap="lg">
          <Group justify="space-between">
            <Text size="sm" fw={700} c="dimmed" tt="uppercase">
              {translate("portal")}
            </Text>
            <Group gap="sm">
              <LanguageSelect />
              <Button component="a" href="/portal" variant="subtle">
                {translate("back")}
              </Button>
            </Group>
          </Group>

          <Paper withBorder radius="xl" p="xl">
            <Stack gap="md">
              <Title order={1} size="h2">Public event registration</Title>
              <Text c="dimmed">
                Register for open public events. Events with approval enabled will enter a pending
                review state before confirmation.
              </Text>
            </Stack>
          </Paper>

          {!selectedChurch ? (
            <Paper withBorder radius="xl" p="xl">
              <Stack gap="sm">
                <Alert color="blue" variant="light">
                  Select a church to view open public event registrations.
                </Alert>
                {churches.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No churches are currently available for public registration.
                  </Text>
                ) : (
                  <Group>
                    {churches.map((church) => (
                      <Button
                        key={church.id}
                        component="a"
                        href={`/portal/events/register?church=${encodeURIComponent(church.slug)}`}
                        variant="default"
                      >
                        {church.name}
                      </Button>
                    ))}
                  </Group>
                )}
              </Stack>
            </Paper>
          ) : (
            <PublicEventRegistrationPanel
              churchId={selectedChurch.id}
              churchName={selectedChurch.name}
              options={options}
            />
          )}
        </Stack>
      </div>
    </main>
  );
}
