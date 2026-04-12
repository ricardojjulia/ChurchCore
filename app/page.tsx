"use client";

import Link from "next/link";
import {
  Box,
  Button,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { ChurchForgeHeroIcon } from "@/components/marketing/churchforge-hero-icon";

export default function Home() {
  return (
    <Box
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #fbfcfe 0%, #f3f6fa 100%)",
      }}
    >
      <Container size="md" py={32}>
        <Group justify="flex-end" align="center" mb={72}>
          <Group gap="sm">
            <Button component={Link} href="/sign-in" variant="default" radius="xl">
              Sign in
            </Button>
            <Button
              component={Link}
              href="/sign-in?redirectTo=/control&force=1"
              variant="default"
              radius="xl"
            >
              Control
            </Button>
          </Group>
        </Group>

        <Paper withBorder radius="xl" p={{ base: "xl", md: "56px" }}>
          <Stack gap="lg" align="center" maw={560} style={{ margin: "0 auto" }}>
            <div style={{ marginBottom: "24px" }}>
              <ChurchForgeHeroIcon />
            </div>
            
            <Title order={1} size={60} style={{ lineHeight: 1, textAlign: "center" }}>
              Church Forge.
            </Title>
            <Text c="dimmed" size="lg" ta="center">
              Built for your mission, its mission to help you build.
            </Text>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
