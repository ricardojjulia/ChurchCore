import { Skeleton, Stack, Group, SimpleGrid } from "@mantine/core";

/**
 * Generic loading placeholder shown by Next.js loading.tsx boundaries while
 * a server-rendered page's data fetch is in flight. Not meant to match any
 * specific page's exact layout — it exists so navigation shows visible
 * progress instead of a blank screen, per the repeated Council finding that
 * server-side data fetches gave no loading feedback anywhere in the app.
 */
export function PageLoadingSkeleton() {
  return (
    <Stack gap="lg" p="lg" aria-busy="true" aria-live="polite">
      <Group justify="space-between">
        <Stack gap={6}>
          <Skeleton height={22} width={220} radius="sm" />
          <Skeleton height={14} width={320} radius="sm" />
        </Stack>
        <Skeleton height={36} width={120} radius="sm" />
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
        <Skeleton height={92} radius="md" />
        <Skeleton height={92} radius="md" />
        <Skeleton height={92} radius="md" />
        <Skeleton height={92} radius="md" />
      </SimpleGrid>

      <Stack gap="sm">
        <Skeleton height={220} radius="md" />
        <Skeleton height={160} radius="md" />
      </Stack>
    </Stack>
  );
}
