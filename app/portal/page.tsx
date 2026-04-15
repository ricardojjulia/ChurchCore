import Link from "next/link";
import { redirect } from "next/navigation";
import { Button, Group, Paper, Stack, Text, Title } from "@mantine/core";

import { getSession } from "@/lib/auth";

export default async function PortalPage() {
  const session = await getSession();

  if (session?.appContext.kind === "church") {
    if (session.appContext.roleId === "member") {
      redirect("/app/member");
    }

    redirect(session.homePath);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1rem",
        background:
          "linear-gradient(180deg, rgba(37,99,235,0.06) 0%, rgba(255,255,255,1) 60%)",
      }}
    >
      <Paper withBorder radius="xl" p={{ base: "lg", sm: "xl" }} maw={720} w="100%">
        <Stack gap="lg">
          <div>
            <Text size="sm" fw={700} c="dimmed" tt="uppercase">
              ChurchForge Portal
            </Text>
            <Title order={1} mt="sm">
              Secure member access for attendance, profile, and serving updates.
            </Title>
            <Text c="dimmed" mt="md">
              Sign in if you already have a portal account, or request access so your church can review and activate one.
            </Text>
          </div>

          <Group>
            <Button component={Link} href="/sign-in?redirectTo=%2Fportal">
              Sign in
            </Button>
            <Button component={Link} href="/portal/register" variant="default">
              Request access
            </Button>
          </Group>
        </Stack>
      </Paper>
    </main>
  );
}
