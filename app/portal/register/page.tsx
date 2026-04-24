import type { Metadata } from "next";
import Link from "next/link";
import { Button, Group, Stack, Text } from "@mantine/core";

import { PortalRegisterForm } from "@/components/portal/portal-register-form";
import { getPublicPortalChurches, getRequestedPublicChurch } from "@/lib/public-portal-data";

export const metadata: Metadata = {
  title: "Portal Registration | ChurchCore Ops",
  description: "Request member portal access for your church.",
};

export default async function PortalRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ church?: string }>;
}) {
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
              ChurchCore Ops Portal
            </Text>
            <Button component={Link} href="/portal" variant="subtle">
              Back
            </Button>
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
