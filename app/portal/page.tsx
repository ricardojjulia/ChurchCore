import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Button, Group, Paper, Stack, Text, Title } from "@mantine/core";

import { getSession } from "@/lib/auth";
import { getRequestedPublicChurch } from "@/lib/public-portal-data";

export default async function PortalPage() {
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
              ChurchCore Ops Portal
            </Text>
            <Title order={1} mt="sm">
              Secure member access for attendance, profile, and serving updates.
            </Title>
            <Text c="dimmed" mt="md">
              Sign in if you already have a portal account, or request access so your church can review and activate one.
            </Text>
          </div>

          {requestedChurch ? (
            <Alert color="teal" radius="xl" variant="light">
              Church detected from this address: <strong>{requestedChurch.name}</strong>.
            </Alert>
          ) : null}

          <Group>
            <Button component={Link} href="/sign-in?redirectTo=%2Fportal">
              Sign in
            </Button>
            <Button
              component={Link}
              href={
                requestedChurch
                  ? `/portal/register?church=${encodeURIComponent(requestedChurch.slug)}`
                  : "/portal/register"
              }
              variant="default"
            >
              Request access
            </Button>
          </Group>
        </Stack>
      </Paper>
    </main>
  );
}
