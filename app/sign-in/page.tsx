import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, KeyRound } from "lucide-react";
import { redirect } from "next/navigation";
import {
  Alert,
  Badge,
  Box,
  Button,
  Container,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";

import { signInAction } from "@/app/sign-in/actions";
import {
  demoProfiles,
  getSession,
  sanitizeRedirectTarget,
} from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { toFriendlySupabaseErrorMessage } from "@/lib/supabase/postgrest";

export const metadata: Metadata = {
  title: "Sign In | ChurchForge",
  description:
    "Sign in to ChurchForge through the approved Supabase SSR auth foundation.",
};

type SignInPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
    redirectTo?: string;
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const redirectTo = sanitizeRedirectTarget(params.redirectTo);
  const session = await getSession();
  const supabaseConfigured = hasSupabaseEnv();
  const errorMessage = !params.error
    ? null
    : params.error === "profile"
      ? "The selected preview profile was not recognized. Try again."
      : params.error === "confirm"
        ? "The email confirmation link could not be verified."
        : params.error === "supabase-not-configured"
          ? "Supabase environment variables are not configured for email confirmation."
          : toFriendlySupabaseErrorMessage(decodeURIComponent(params.error));

  if (session) {
    redirect(redirectTo);
  }

  return (
    <Box
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top right, rgba(43, 156, 144, 0.14), transparent 26%), linear-gradient(180deg, #f7f9fc 0%, #eef3f8 100%)",
      }}
    >
      <Container size="sm" py={64}>
        <Group justify="space-between" mb={32}>
          <Box>
            <Badge color="gray" variant="light" mb="sm">
              ChurchForge
            </Badge>
            <Title order={1}>Sign in</Title>
            <Text c="dimmed" mt="sm">
              {supabaseConfigured
                ? "Use your account."
                : "Choose a preview account."}
            </Text>
          </Box>

          <Group gap="sm">
            <Link href="/">
              <Button component="span" variant="default" radius="xl">
                Back home
              </Button>
            </Link>
          </Group>
        </Group>

        <Paper withBorder radius="xl" p="xl">
          <Stack gap="lg">
            {errorMessage ? <Alert color="red">{errorMessage}</Alert> : null}
            {params.message ? (
              <Alert color="teal">{decodeURIComponent(params.message)}</Alert>
            ) : null}

            {supabaseConfigured ? (
              <>
                <Group gap="sm" align="center">
                  <Box
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 999,
                      display: "grid",
                      placeItems: "center",
                      background: "var(--mantine-color-gray-0)",
                    }}
                  >
                    <KeyRound size={16} />
                  </Box>
                  <Text fw={700}>Account</Text>
                </Group>

                <form action={signInAction}>
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <Stack gap="md">
                    <TextInput
                      label="Email"
                      name="email"
                      type="email"
                      required
                      radius="lg"
                      size="md"
                    />
                    <PasswordInput
                      label="Password"
                      name="password"
                      required
                      radius="lg"
                      size="md"
                    />
                    <Group gap="sm" mt="sm">
                      <Button
                        type="submit"
                        name="intent"
                        value="sign-in"
                        radius="xl"
                        rightSection={<ArrowRight size={16} />}
                      >
                        Sign in
                      </Button>
                      <Button
                        type="submit"
                        name="intent"
                        value="sign-up"
                        variant="default"
                        radius="xl"
                      >
                        Create account
                      </Button>
                    </Group>
                  </Stack>
                </form>
              </>
            ) : (
              <Stack gap="sm">
                {demoProfiles.map((profile) => (
                  <Paper key={profile.id} withBorder radius="xl" p="lg">
                    <form action={signInAction}>
                      <input type="hidden" name="profileId" value={profile.id} />
                      <input type="hidden" name="redirectTo" value={redirectTo} />
                      <Group justify="space-between" align="flex-start" gap="md">
                        <Box maw={540}>
                          <Text fw={700}>{profile.name}</Text>
                          <Text c="dimmed" size="sm" mt={4}>
                            {profile.title}
                          </Text>
                          <Text c="dimmed" size="sm" mt={4}>
                            {profile.email}
                          </Text>
                        </Box>
                        <Button
                          type="submit"
                          radius="xl"
                          rightSection={<ArrowRight size={16} />}
                        >
                          Continue
                        </Button>
                      </Group>
                    </form>
                  </Paper>
                ))}
              </Stack>
            )}
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
