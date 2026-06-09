import { Stack, SimpleGrid, Text, Title } from "@mantine/core";

import { requireChurchSession } from "@/lib/auth";
import { listLocales, getLocalizationStatus } from "@/app/app/church-admin/localization/actions";
import { LocaleStatusCard } from "@/components/localization/locale-status-card";

export default async function LocalizationPage() {
  const session = await requireChurchSession("/app/sign-in");

  const { roleId } = session.appContext;
  if (roleId !== "church-admin" && roleId !== "pastor") {
    return (
      <Stack p="xl" gap="sm">
        <Title order={3}>Access Denied</Title>
        <Text c="dimmed">
          You do not have permission to view this page. Church admin or pastor role required.
        </Text>
      </Stack>
    );
  }

  const localesResult = await listLocales();

  if (!localesResult.ok) {
    return (
      <Stack p="xl" gap="sm">
        <Title order={2}>Localization</Title>
        <Text c="dimmed">Catalog governance and translation status</Text>
        <Text c="red" size="sm">
          Failed to load locales: {localesResult.error}
        </Text>
      </Stack>
    );
  }

  const locales = localesResult.data;

  if (locales.length === 0) {
    return (
      <Stack p="xl" gap="sm">
        <Title order={2}>Localization</Title>
        <Text c="dimmed">Catalog governance and translation status</Text>
        <Text size="sm" c="dimmed">
          No locales configured. Use the CLI or seed script to initialize.
        </Text>
      </Stack>
    );
  }

  const statusResults = await Promise.all(
    locales.map((locale) => getLocalizationStatus(locale.code)),
  );

  const statuses = statusResults.flatMap((result) =>
    result.ok ? [result.data] : [],
  );

  return (
    <Stack p="xl" gap="lg">
      <div>
        <Title order={2}>Localization</Title>
        <Text c="dimmed" size="sm">
          Catalog governance and translation status
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="md">
        {statuses.map((status) => (
          <LocaleStatusCard key={status.code} status={status} />
        ))}
      </SimpleGrid>
    </Stack>
  );
}
