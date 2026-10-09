"use client";

import { Box, Button, Stack, Text, Title } from "@mantine/core";

import { useI18n } from "@/components/i18n-provider";

// If the kiosk screen fails to render, a family is never left on a bare error
// page: one big button returns to the start screen.
export default function KioskError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return (
    <Box component="main" mih="100dvh" p="lg" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Stack gap="lg" maw={560} align="center">
        <Title order={1} ta="center">
          {t("kiosk", "errorHeading")}
        </Title>
        <Text ta="center" size="lg">
          {t("kiosk", "errorBody")}
        </Text>
        <Button h={64} size="xl" radius="xl" color="indigo" fullWidth onClick={reset} data-primary-action>
          {t("kiosk", "errorBack")}
        </Button>
      </Stack>
    </Box>
  );
}
