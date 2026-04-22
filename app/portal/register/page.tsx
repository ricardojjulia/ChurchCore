import type { Metadata } from "next";
import Link from "next/link";
import { Button, Group, Stack, Text } from "@mantine/core";

import { PortalRegisterForm } from "@/components/portal/portal-register-form";
import { getPublicPortalChurches, getRequestedPublicChurch } from "@/lib/public-portal-data";

export const metadata: Metadata = {
  title: "Portal Registration | ChurchForge",
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
    <main
      style={{
        minHeight: "100vh",
        padding: "2rem 1rem",
        background:
          "radial-gradient(circle at top, rgba(37,99,235,0.10), transparent 40%), #f6f7f9",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Stack gap="lg">
          <Group justify="space-between">
            <Text size="sm" fw={700} c="dimmed" tt="uppercase">
              ChurchForge Portal
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
