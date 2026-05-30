import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Button, Group, Stack, Text } from "@mantine/core";

import { LanguageSelect } from "@/components/language-select";
import { PortalRegisterForm } from "@/components/portal/portal-register-form";
import { localeCookieName, messages, normalizeLocale } from "@/lib/i18n";
import { getPublicPortalChurches, getRequestedPublicChurch } from "@/lib/public-portal-data";

export const metadata: Metadata = {
  title: "Portal Registration | ChurchCore",
  description: "Request member portal access for your church.",
};

export default async function PortalRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ church?: string }>;
}) {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(localeCookieName)?.value);
  const translate = (key: keyof typeof messages.en.portal) =>
    messages[locale].portal[key] ?? messages.en.portal[key];
  const [churches, requestedChurch] = await Promise.all([
    getPublicPortalChurches(),
    getRequestedPublicChurch(),
  ]);
  const { church } = await searchParams;

  const initialChurchId =
    requestedChurch?.id ??
    churches.find((entry) => entry.id === church || entry.slug === church)?.id ??
    null;

  return (
    <main className="portal-register-bg min-h-screen px-4 py-8">
      <div className="max-w-[760px] mx-auto">
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

          <PortalRegisterForm
            churches={churches}
            initialChurchId={initialChurchId}
            resolvedChurch={requestedChurch}
          />
        </Stack>
      </div>
    </main>
  );
}
