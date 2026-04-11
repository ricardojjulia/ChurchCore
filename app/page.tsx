"use client";

import Link from "next/link";
import { ArrowRight, HeartHandshake } from "lucide-react";
import {
  Badge,
  Box,
  Button,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";

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
        <Group justify="space-between" align="center" mb={72}>
          <Group gap="sm">
            <ThemeIcon size={42} radius="xl" color="churchBlue" variant="light">
              <HeartHandshake size={18} />
            </ThemeIcon>
            <Text fw={700}>ChurchForge</Text>
          </Group>

          <Group gap="sm">
            <Button component={Link} href="/sign-in" variant="default" radius="xl">
              Sign in
            </Button>
            <Button component={Link} href="/control" variant="default" radius="xl">
              Control
            </Button>
          </Group>
        </Group>

        <Paper withBorder radius="xl" p={{ base: "xl", md: "56px" }}>
          <Stack gap="lg" maw={560}>
            <Badge color="churchBlue" variant="light" w="fit-content">
              ChurchForge
            </Badge>
            <Title order={1} size={60} style={{ lineHeight: 1 }}>
              Church software.
            </Title>
            <Text c="dimmed" size="lg">
              Quiet, direct, and built to work.
            </Text>
            <Group gap="sm" mt="sm">
              <Button
                component={Link}
                href="/sign-in?redirectTo=/app"
                radius="xl"
                size="lg"
                rightSection={<ArrowRight size={16} />}
              >
                Open app
              </Button>
              <Button
                component={Link}
                href="/sign-in?redirectTo=/control"
                radius="xl"
                size="lg"
                variant="default"
              >
                Open control
              </Button>
            </Group>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
