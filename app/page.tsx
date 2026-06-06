"use client";

import Link from "next/link";
import {
  Box,
  Button,
  Container,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { Church } from "lucide-react";
import { LanguageSelect } from "@/components/language-select";
import { useI18n } from "@/components/i18n-provider";

export default function Home() {
  const { t } = useI18n();

  return (
    <Box
      className="public-home-shell"
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 18% 18%, rgba(94, 234, 212, 0.16), transparent 26%), radial-gradient(circle at 82% 12%, rgba(244, 201, 93, 0.18), transparent 23%), linear-gradient(135deg, #f8fafc 0%, #eef3f8 48%, #f7f7f0 100%)",
      }}
    >
      <Container size="md" py={{ base: 18, md: 28 }}>
        <Group justify="space-between" align="center" mb={{ base: 48, md: 80 }}>
          <Group gap="sm" wrap="nowrap">
            <Box
              style={{
                display: "grid",
                placeItems: "center",
                width: 42,
                height: 42,
                borderRadius: 14,
                background: "#101827",
                color: "#f4c95d",
                boxShadow: "0 16px 34px rgba(16, 24, 39, 0.18)",
              }}
            >
              <Church size={22} strokeWidth={2.1} />
            </Box>
            <Text fw={800} size="lg" c="#101827">
              Church Core
            </Text>
          </Group>

          <Group gap="sm" justify="flex-end">
            <LanguageSelect />
            <Button component={Link} href="/sign-in" variant="white" radius="xl">
              {t("publicHome", "signIn")}
            </Button>
            <Button
              component={Link}
              href="/sign-in?redirectTo=/control&force=1"
              variant="outline"
              radius="xl"
              color="dark"
            >
              {t("publicHome", "control")}
            </Button>
          </Group>
        </Group>

        <Stack gap="xl" maw={720} mx="auto" ta="center" align="center">
          <Title
            order={1}
            style={{
              color: "#101827",
              fontSize: "clamp(3rem, 7vw, 6.7rem)",
              lineHeight: 0.91,
              letterSpacing: 0,
            }}
          >
            {t("publicHome", "headline")}
          </Title>
          <Text
            size="xl"
            c="#405064"
            maw={560}
            style={{ lineHeight: 1.55 }}
          >
            {t("publicHome", "tagline")}
          </Text>
          <Button
            component={Link}
            href="/sign-in"
            radius="xl"
            size="lg"
            color="dark"
            mt="sm"
          >
            {t("publicHome", "signIn")}
          </Button>
        </Stack>
      </Container>
    </Box>
  );
}
