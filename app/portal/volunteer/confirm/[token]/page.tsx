import type { Metadata } from "next";
import { Paper, Stack, Text, Title } from "@mantine/core";

import { getPublicVolunteerShiftByToken } from "@/app/app/volunteer-actions";
import { VolunteerConfirmClient } from "@/components/portal/volunteer-confirm-client";

export const metadata: Metadata = {
  title: "Volunteer Confirm | ChurchCore",
  description: "Confirm or decline your volunteer service shift.",
};

export default async function VolunteerConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const shift = await getPublicVolunteerShiftByToken(token);

  return (
    <main className="portal-register-bg min-h-screen px-4 py-8 flex items-center justify-center">
      <div className="max-w-[600px] w-full mx-auto">
        <Paper withBorder radius="xl" p="xl" shadow="md">
          {shift ? (
            <VolunteerConfirmClient shift={shift} token={token} />
          ) : (
            <Stack align="center" gap="md" py="xl">
              <Title order={3} c="red">Invalid or Expired Link</Title>
              <Text c="dimmed" ta="center">
                This volunteer confirmation link is invalid or has expired. Sessional confirmation links expire after 14 days. Please contact your ministry leader.
              </Text>
            </Stack>
          )}
        </Paper>
      </div>
    </main>
  );
}
