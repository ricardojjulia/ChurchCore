import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
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

import { signInAction, signOutAction } from "@/app/sign-in/actions";
import { LanguageSelect } from "@/components/language-select";
import {
  demoProfiles,
  getSession,
  sanitizeRedirectTarget,
} from "@/lib/auth";
import { getRequestedPublicChurch } from "@/lib/public-portal-data";
import {
  getPreferredSupabaseSurfaceForRedirect,
  hasSupabaseEnvForSurface,
} from "@/lib/supabase/config";
import { toFriendlySupabaseErrorMessage } from "@/lib/supabase/postgrest";
import { localeCookieName, messages, normalizeLocale } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Sign In | ChurchCore Ops",
  description:
    "Sign in to ChurchCore Ops through the approved Supabase SSR auth foundation.",
};

type SignInPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
    redirectTo?: string;
    force?: string;
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(localeCookieName)?.value);
  const translate = (
    key: keyof typeof messages.en.signIn,
    values?: Record<string, string | number>,
  ) => {
    const template = String(messages[locale].signIn[key] ?? messages.en.signIn[key]);
    if (!values) return template;
    return Object.entries(values).reduce(
      (next, [valueKey, replacement]) =>
        next.replaceAll(`{${valueKey}}`, String(replacement)),
      template,
    );
  };
  const redirectTo = sanitizeRedirectTarget(params.redirectTo);
  const preferredSurface = getPreferredSupabaseSurfaceForRedirect(redirectTo);
  const [session, requestedChurch] = await Promise.all([
    getSession(redirectTo),
    getRequestedPublicChurch(),
  ]);
  const supabaseConfigured = hasSupabaseEnvForSurface(preferredSurface);
  const showSelfSignup = preferredSurface === "tenant";
  const forceSignIn = params.force === "1";
  const errorMessage = !params.error
    ? null
    : params.error === "profile"
      ? translate("profileError")
      : params.error === "confirm"
        ? translate("confirmError")
        : params.error === "supabase-not-configured"
          ? translate("supabaseNotConfigured")
          : toFriendlySupabaseErrorMessage(decodeURIComponent(params.error));

  if (session && (!forceSignIn || session.canAccessControl)) {
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
              ChurchCore Ops
            </Badge>
            <Title order={1}>{translate("signIn")}</Title>
            <Text c="dimmed" mt="sm">
              {supabaseConfigured
                ? translate("useAccount")
                : translate("usePreview")}
            </Text>
          </Box>

          <Group gap="sm">
            <LanguageSelect />
            <Link href="/">
              <Button component="span" variant="default" radius="xl">
                {translate("backHome")}
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
            {requestedChurch ? (
              <Alert color="blue">
                {translate("requestedChurch", { church: requestedChurch.name })}
              </Alert>
            ) : null}
            {session && forceSignIn && !session.canAccessControl ? (
              <Alert color="yellow" title={translate("controlAccessRequired")}>
                {translate("controlAccessRequiredDescription", {
                  email: session.profile.email,
                })}
              </Alert>
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
                  <Text fw={700}>{translate("account")}</Text>
                </Group>

                <form action={signInAction}>
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <Stack gap="md">
                    <TextInput
                      label={translate("email")}
                      name="email"
                      type="email"
                      required
                      radius="lg"
                      size="md"
                    />
                    <PasswordInput
                      label={translate("password")}
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
                        {translate("signIn")}
                      </Button>
                      {showSelfSignup ? (
                        <Button
                          type="submit"
                          name="intent"
                          value="sign-up"
                          variant="default"
                          radius="xl"
                        >
                          {translate("createAccount")}
                        </Button>
                      ) : null}
                    </Group>
                  </Stack>
                </form>
                {session && forceSignIn ? (
                  <form action={signOutAction}>
                    <Button type="submit" variant="subtle" radius="xl" mt="md">
                      {translate("signOutCurrent")}
                    </Button>
                  </form>
                ) : null}
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
                          {translate("continue")}
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
