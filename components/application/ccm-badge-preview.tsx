"use client";

import { Badge, Box, Button, Group, Stack, Text, Title } from "@mantine/core";
import { Printer } from "lucide-react";

import type { Allergy, CcmCheckinResult } from "@/lib/ccm-types";

function AllergyBar({ allergies }: { allergies: Allergy[] }) {
  const critical = allergies.filter(
    (a) => a.severity === "anaphylactic" || a.severity === "moderate",
  );
  if (critical.length === 0) return null;
  return (
    <Box
      style={{
        background: "#c92a2a",
        color: "white",
        padding: "4px 8px",
        borderRadius: 4,
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: 0.5,
      }}
    >
      ⚠ ALLERGY: {critical.map((a) => a.name.toUpperCase()).join(" · ")}
    </Box>
  );
}

interface BadgeProps {
  result: CcmCheckinResult;
  serviceLabel: string;
}

export function CcmBadgePreview({ result, serviceLabel }: BadgeProps) {
  const { session, pin } = result;

  const handlePrint = () => window.print();

  return (
    <Stack gap="lg">
      <Button
        leftSection={<Printer size={16} />}
        onClick={handlePrint}
        variant="filled"
        color="churchBlue"
        className="no-print"
      >
        Print Badges
      </Button>

      {/* Child badge */}
      <Box
        className="print-badge"
        style={{
          border: "2px solid #333",
          borderRadius: 8,
          padding: 16,
          maxWidth: 340,
          background: "white",
        }}
      >
        {session.noPhotoFlag && (
          <Box
            style={{
              background: "#e03131",
              color: "white",
              padding: "2px 8px",
              borderRadius: 4,
              fontWeight: 700,
              fontSize: 11,
              marginBottom: 6,
              textAlign: "center",
              letterSpacing: 1,
            }}
          >
            🚫 NO PHOTOS
          </Box>
        )}
        <AllergyBar allergies={session.allAllergies} />
        <Title order={3} mt={6}>{session.childName}</Title>
        <Text size="sm" c="dimmed" mb={4}>{session.roomName}</Text>
        <Text size="xs" c="dimmed">{serviceLabel}</Text>
        <Box
          mt="sm"
          style={{
            border: "1px solid #aaa",
            borderRadius: 4,
            padding: "8px 12px",
            textAlign: "center",
          }}
        >
          <Text size="xs" c="dimmed" mb={2}>Security PIN</Text>
          <Text
            style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 700, letterSpacing: 6 }}
          >
            {pin}
          </Text>
        </Box>
        {session.criticalAllergies.length > 0 && (
          <Group gap="xs" mt="xs">
            {session.criticalAllergies.map((a) => (
              <Badge key={a} color="red" size="xs" variant="filled">{a}</Badge>
            ))}
          </Group>
        )}
      </Box>

      {/* Guardian claim check */}
      <Box
        className="print-badge"
        style={{
          border: "2px dashed #999",
          borderRadius: 8,
          padding: 16,
          maxWidth: 340,
          background: "white",
        }}
      >
        <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={4}>
          Guardian Claim Check
        </Text>
        <Text fw={600}>{session.childName}</Text>
        <Text size="xs" c="dimmed">{serviceLabel}</Text>
        <Box
          mt="sm"
          style={{
            border: "1px solid #aaa",
            borderRadius: 4,
            padding: "8px 12px",
            textAlign: "center",
          }}
        >
          <Text size="xs" c="dimmed" mb={2}>PIN — Present at pick-up</Text>
          <Text
            style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 700, letterSpacing: 4 }}
          >
            {pin}
          </Text>
        </Box>
        <Text size="xs" c="dimmed" mt="xs" ta="center">
          Keep this until you pick up your child.
        </Text>
      </Box>
    </Stack>
  );
}
