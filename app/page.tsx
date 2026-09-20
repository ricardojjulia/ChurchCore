"use client";

import Link from "next/link";
import {
  Anchor,
  Badge,
  Box,
  Button,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  ArrowRight,
  BookOpen,
  Building2,
  Calendar,
  GraduationCap,
  HandCoins,
  HeartHandshake,
  MessageSquare,
  Play,
  Plus,
  TrendingUp,
  UserPlus,
  Users,
  Users2,
  Workflow,
} from "lucide-react";
import { LanguageSelect } from "@/components/language-select";
import { useI18n } from "@/components/i18n-provider";

const GROUND = "#0D1B2A";
const GOLD = "#C9A227";
const GOLD_HOVER = "#E2B730";
const TEXT_PRIMARY = "#F0EBE0";
const TEXT_BODY = "rgba(232,224,208,0.68)";
const TEXT_MUTED = "rgba(232,224,208,0.45)";
const TEXT_DIM = "rgba(232,224,208,0.35)";
const CARD_SURFACE = "rgba(255,255,255,0.04)";
const CARD_BORDER = "rgba(232,224,208,0.09)";
const GOLD_BORDER = "rgba(201,162,39,0.18)";
const GOLD_BADGE_BG = "rgba(201,162,39,0.18)";
const CTA_SECTION_BG = "rgba(201,162,39,0.07)";

const FONT_SERIF = "var(--font-fraunces)";
const FONT_SANS = "var(--font-manrope)";

const NAV_LINKS = [
  { key: "navPlatform", href: "#platform" },
  { key: "navMinistry", href: "#platform" },
  { key: "navAcademy", href: "#ecosystem" },
  { key: "navCare", href: "#ecosystem" },
  { key: "navPricing", href: "#" },
] as const;

const BOTTOM_STRIP = [
  { key: "stripPeople", icon: Users },
  { key: "stripGroups", icon: Users2 },
  { key: "stripEvents", icon: Calendar },
  { key: "stripGiving", icon: HandCoins },
  { key: "stripWorkflows", icon: Workflow },
  { key: "stripAcademy", icon: GraduationCap },
] as const;

const FEATURE_CARDS = [
  { titleKey: "featurePeopleTitle", bodyKey: "featurePeopleBody", icon: Users },
  { titleKey: "featureGroupsTitle", bodyKey: "featureGroupsBody", icon: Users2 },
  { titleKey: "featureVolunteersTitle", bodyKey: "featureVolunteersBody", icon: UserPlus },
  { titleKey: "featureEventsTitle", bodyKey: "featureEventsBody", icon: Calendar },
  { titleKey: "featureCommunicateTitle", bodyKey: "featureCommunicateBody", icon: MessageSquare },
  { titleKey: "featureWorkflowsTitle", bodyKey: "featureWorkflowsBody", icon: Workflow },
] as const;

const ECOSYSTEM_CARDS = [
  {
    eyebrowKey: "ecosystemCoreEyebrow",
    nameKey: "ecosystemCoreName",
    bodyKey: "ecosystemCoreBody",
    icon: Building2,
    featured: true,
  },
  {
    eyebrowKey: "ecosystemAcademyEyebrow",
    nameKey: "ecosystemAcademyName",
    bodyKey: "ecosystemAcademyBody",
    icon: GraduationCap,
    featured: false,
  },
  {
    eyebrowKey: "ecosystemLmsEyebrow",
    nameKey: "ecosystemLmsName",
    bodyKey: "ecosystemLmsBody",
    icon: BookOpen,
    featured: false,
  },
  {
    eyebrowKey: "ecosystemCareEyebrow",
    nameKey: "ecosystemCareName",
    bodyKey: "ecosystemCareBody",
    icon: HeartHandshake,
    featured: false,
  },
] as const;

const SOCIAL_PROOF_KEYS = ["churchName1", "churchName2", "churchName3", "churchName4"] as const;

const GOLD_BUTTON_STYLES = {
  root: {
    background: GOLD,
    color: GROUND,
    fontWeight: 700,
    "&:hover": {
      background: GOLD_HOVER,
    },
  },
} as const;

function BackgroundTexture() {
  return (
    <Box
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(201,162,39,0.028) 1px, transparent 1px),
          linear-gradient(90deg, rgba(201,162,39,0.028) 1px, transparent 1px),
          radial-gradient(circle at 12% 8%, rgba(201,162,39,0.10), transparent 40%),
          radial-gradient(circle at 88% 82%, rgba(201,162,39,0.08), transparent 42%)
        `,
        backgroundSize: "72px 72px, 72px 72px, 100% 100%, 100% 100%",
      }}
    />
  );
}

function EyebrowLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      fw={600}
      tt="uppercase"
      style={{
        color: GOLD,
        fontFamily: FONT_SANS,
        letterSpacing: "0.14em",
        fontSize: 13,
      }}
    >
      {children}
    </Text>
  );
}

function IconTile({ Icon }: { Icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }) {
  return (
    <Box
      style={{
        display: "grid",
        placeItems: "center",
        width: 50,
        height: 50,
        borderRadius: 14,
        background: GOLD_BADGE_BG,
        border: `1px solid ${GOLD_BORDER}`,
        color: GOLD,
      }}
    >
      <Icon size={22} strokeWidth={2} />
    </Box>
  );
}

export default function Home() {
  const { t } = useI18n();

  return (
    <Box
      className="public-home-shell"
      style={{
        position: "relative",
        minHeight: "100vh",
        background: GROUND,
        fontFamily: FONT_SANS,
        overflowX: "hidden",
      }}
    >
      <BackgroundTexture />

      <Box style={{ position: "relative", zIndex: 1 }}>
        {/* Nav */}
        <Container size="xl" py={{ base: 18, md: 24 }}>
          <Group justify="space-between" align="center" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <Box
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: GOLD,
                  color: GROUND,
                }}
              >
                <Plus size={22} strokeWidth={2.6} />
              </Box>
              <Text
                fw={700}
                size="lg"
                style={{ color: TEXT_PRIMARY, fontFamily: FONT_SERIF }}
              >
                ChurchCore
              </Text>
            </Group>

            <Group gap="xl" visibleFrom="md" wrap="nowrap">
              {NAV_LINKS.map((link) => (
                <Anchor
                  key={link.key}
                  href={link.href}
                  underline="never"
                  style={{ color: TEXT_BODY, fontSize: 14, fontWeight: 500 }}
                >
                  {t("publicHome", link.key)}
                </Anchor>
              ))}
            </Group>

            <Group gap="sm" justify="flex-end" wrap="nowrap">
              <LanguageSelect size="xs" />
              <Anchor
                component={Link}
                href="/sign-in"
                underline="never"
                visibleFrom="sm"
                style={{ color: TEXT_PRIMARY, fontSize: 14, fontWeight: 600 }}
              >
                {t("publicHome", "signIn")}
              </Anchor>
              <Button
                component={Link}
                href="/sign-in?redirectTo=/control&force=1"
                variant="outline"
                radius="md"
                size="xs"
                visibleFrom="sm"
                styles={{
                  root: {
                    borderColor: CARD_BORDER,
                    color: TEXT_BODY,
                  },
                }}
              >
                {t("publicHome", "control")}
              </Button>
              <Button
                component={Link}
                href="/sign-in"
                radius="md"
                size="xs"
                styles={GOLD_BUTTON_STYLES}
              >
                {t("publicHome", "requestDemo")}
              </Button>
            </Group>
          </Group>
        </Container>

        {/* Hero */}
        <Container size="xl" pt={{ base: 24, md: 48 }} pb={{ base: 48, md: 72 }}>
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={{ base: 48, lg: 64 }}>
            <Stack gap="xl" justify="center">
              <EyebrowLabel>{t("publicHome", "heroEyebrow")}</EyebrowLabel>

              <Title
                order={1}
                style={{
                  fontFamily: FONT_SERIF,
                  fontWeight: 700,
                  color: TEXT_PRIMARY,
                  fontSize: "clamp(2.6rem, 5.4vw, 4.4rem)",
                  lineHeight: 1.08,
                  letterSpacing: "-0.02em",
                }}
              >
                <Box component="span" display="block">
                  {t("publicHome", "heroHeadlineLine1")}
                </Box>
                <Box component="span" display="block">
                  {t("publicHome", "heroHeadlineLine2")}
                </Box>
                <Box
                  component="span"
                  display="block"
                  style={{ color: GOLD, fontStyle: "italic" }}
                >
                  {t("publicHome", "heroHeadlineLine3")}
                </Box>
              </Title>

              <Text
                style={{
                  color: TEXT_BODY,
                  fontSize: 18,
                  lineHeight: 1.7,
                  fontWeight: 300,
                  maxWidth: 520,
                }}
              >
                {t("publicHome", "heroSubheadline")}
              </Text>

              <Group gap="lg" wrap="wrap">
                <Button
                  component={Link}
                  href="/sign-in"
                  size="md"
                  radius="md"
                  rightSection={<ArrowRight size={18} />}
                  styles={GOLD_BUTTON_STYLES}
                >
                  {t("publicHome", "heroPrimaryCta")}
                </Button>

                <Anchor
                  href="#"
                  underline="never"
                  aria-label={t("publicHome", "heroSecondaryCta")}
                  style={{ display: "inline-flex", alignItems: "center", gap: 12 }}
                >
                  <Box
                    aria-hidden="true"
                    style={{
                      display: "grid",
                      placeItems: "center",
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      border: `1px solid ${CARD_BORDER}`,
                      color: TEXT_PRIMARY,
                    }}
                  >
                    <Play size={16} strokeWidth={2} />
                  </Box>
                  <Text fw={600} style={{ color: TEXT_PRIMARY, fontSize: 14 }}>
                    {t("publicHome", "heroSecondaryCta")}
                  </Text>
                </Anchor>
              </Group>

              <Stack gap="sm" mt="md">
                <Text
                  fw={600}
                  tt="uppercase"
                  style={{ color: TEXT_DIM, letterSpacing: "0.14em", fontSize: 11 }}
                >
                  {t("publicHome", "socialProofLabel")}
                </Text>
                <Group gap="xl" wrap="wrap">
                  {SOCIAL_PROOF_KEYS.map((key) => (
                    <Text
                      key={key}
                      fw={600}
                      style={{ color: TEXT_MUTED, fontSize: 15 }}
                    >
                      {t("publicHome", key)}
                    </Text>
                  ))}
                </Group>
              </Stack>
            </Stack>

            <Stack gap="md" justify="center">
              <SimpleGrid cols={2} spacing="md">
                <Box
                  style={{
                    borderRadius: 20,
                    background: CARD_SURFACE,
                    border: `1px solid ${CARD_BORDER}`,
                    padding: 20,
                  }}
                >
                  <Text
                    fw={600}
                    tt="uppercase"
                    style={{ color: TEXT_MUTED, letterSpacing: "0.1em", fontSize: 11 }}
                  >
                    {t("publicHome", "statActiveMembersLabel")}
                  </Text>
                  <Text
                    fw={700}
                    style={{ color: TEXT_PRIMARY, fontFamily: FONT_SERIF, fontSize: 32, marginTop: 8 }}
                  >
                    {t("publicHome", "statActiveMembersValue")}
                  </Text>
                  <Group gap={6} mt={8} wrap="nowrap">
                    <TrendingUp size={14} color={GOLD} />
                    <Text style={{ color: GOLD, fontSize: 12, fontWeight: 600 }}>
                      {t("publicHome", "statActiveMembersTrend")}
                    </Text>
                  </Group>
                </Box>

                <Box
                  style={{
                    borderRadius: 20,
                    background: CARD_SURFACE,
                    border: `1px solid ${CARD_BORDER}`,
                    padding: 20,
                  }}
                >
                  <Text
                    fw={600}
                    tt="uppercase"
                    style={{ color: TEXT_MUTED, letterSpacing: "0.1em", fontSize: 11 }}
                  >
                    {t("publicHome", "statVolunteersLabel")}
                  </Text>
                  <Text
                    fw={700}
                    style={{ color: TEXT_PRIMARY, fontFamily: FONT_SERIF, fontSize: 32, marginTop: 8 }}
                  >
                    {t("publicHome", "statVolunteersValue")}
                  </Text>
                  <Group gap={6} mt={8} wrap="nowrap">
                    <TrendingUp size={14} color={GOLD} />
                    <Text style={{ color: GOLD, fontSize: 12, fontWeight: 600 }}>
                      {t("publicHome", "statVolunteersTrend")}
                    </Text>
                  </Group>
                </Box>
              </SimpleGrid>

              <Box
                style={{
                  borderRadius: 20,
                  background: CARD_SURFACE,
                  border: `1px solid ${CARD_BORDER}`,
                  padding: 20,
                }}
              >
                <Group justify="space-between" align="center" mb="md">
                  <Text fw={600} style={{ color: TEXT_PRIMARY, fontSize: 15 }}>
                    {t("publicHome", "visitorQueueTitle")}
                  </Text>
                  <Badge
                    radius="sm"
                    styles={{ root: { background: GOLD_BADGE_BG, color: GOLD, fontWeight: 700 } }}
                  >
                    {t("publicHome", "visitorQueueBadge")}
                  </Badge>
                </Group>

                <Stack gap="sm">
                  {[
                    { nameKey: "visitorRow1Name", detailField: "visitorRow1Detail" },
                    { nameKey: "visitorRow2Name", detailField: "visitorRow2Detail" },
                  ].map((row) => (
                    <Group key={row.nameKey} gap="sm" wrap="nowrap">
                      <Box style={{ position: "relative", flexShrink: 0 }}>
                        <Box
                          aria-hidden="true"
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            background: `linear-gradient(135deg, ${GOLD}, #1E3A5F)`,
                          }}
                        />
                        <Box
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            bottom: -1,
                            right: -1,
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: GOLD,
                            border: `2px solid ${GROUND}`,
                          }}
                        />
                      </Box>
                      <Stack gap={2}>
                        <Text fw={600} style={{ color: TEXT_PRIMARY, fontSize: 14 }}>
                          {t("publicHome", row.nameKey)}
                        </Text>
                        <Text style={{ color: TEXT_MUTED, fontSize: 12 }}>
                          {t("publicHome", row.detailField)}
                        </Text>
                      </Stack>
                    </Group>
                  ))}
                </Stack>
              </Box>

              <Box
                style={{
                  borderRadius: 20,
                  background: `linear-gradient(135deg, rgba(201,162,39,0.16), rgba(201,162,39,0.05))`,
                  border: `1px solid ${GOLD_BORDER}`,
                  padding: 20,
                }}
              >
                <Group justify="space-between" align="center">
                  <Stack gap={4}>
                    <Text fw={600} style={{ color: TEXT_PRIMARY, fontSize: 15 }}>
                      {t("publicHome", "smallGroupsTitle")}
                    </Text>
                    <Text
                      fw={700}
                      style={{ color: GOLD, fontFamily: FONT_SERIF, fontSize: 26 }}
                    >
                      {t("publicHome", "smallGroupsValue")}
                    </Text>
                  </Stack>
                  <Box
                    style={{
                      borderRadius: 14,
                      background: "rgba(13,27,42,0.4)",
                      padding: "10px 16px",
                      textAlign: "center",
                    }}
                  >
                    <Text fw={700} style={{ color: TEXT_PRIMARY, fontSize: 18 }}>
                      {t("publicHome", "smallGroupsCoverageValue")}
                    </Text>
                    <Text style={{ color: TEXT_MUTED, fontSize: 11 }}>
                      {t("publicHome", "smallGroupsCoverageLabel")}
                    </Text>
                  </Box>
                </Group>
              </Box>
            </Stack>
          </SimpleGrid>

          {/* Bottom feature strip */}
          <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="lg" mt={{ base: 56, md: 80 }}>
            {BOTTOM_STRIP.map((item) => (
              <Stack key={item.key} gap="xs" align="center" ta="center">
                <Box style={{ color: GOLD }}>
                  <item.icon size={22} strokeWidth={1.8} />
                </Box>
                <Text style={{ color: TEXT_MUTED, fontSize: 13, fontWeight: 500 }}>
                  {t("publicHome", item.key)}
                </Text>
              </Stack>
            ))}
          </SimpleGrid>
        </Container>

        {/* Platform section */}
        <Container id="platform" size="xl" py={{ base: 56, md: 96 }}>
          <Stack gap="md" maw={680} mb={{ base: 40, md: 64 }}>
            <EyebrowLabel>{t("publicHome", "platformEyebrow")}</EyebrowLabel>
            <Title
              order={2}
              style={{
                fontFamily: FONT_SERIF,
                fontWeight: 700,
                color: TEXT_PRIMARY,
                fontSize: "clamp(2rem, 3.6vw, 2.9rem)",
                lineHeight: 1.15,
                letterSpacing: "-0.02em",
              }}
            >
              {t("publicHome", "platformHeadline")}
            </Title>
            <Text style={{ color: TEXT_BODY, fontSize: 17, lineHeight: 1.7, fontWeight: 300 }}>
              {t("publicHome", "platformBody")}
            </Text>
          </Stack>

          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
            {FEATURE_CARDS.map((card) => (
              <Stack
                key={card.titleKey}
                gap="sm"
                style={{
                  borderRadius: 20,
                  background: CARD_SURFACE,
                  border: `1px solid ${CARD_BORDER}`,
                  padding: 26,
                }}
              >
                <IconTile Icon={card.icon} />
                <Title
                  order={3}
                  style={{
                    fontFamily: FONT_SERIF,
                    fontWeight: 700,
                    color: TEXT_PRIMARY,
                    fontSize: 20,
                    marginTop: 8,
                  }}
                >
                  {t("publicHome", card.titleKey)}
                </Title>
                <Text style={{ color: TEXT_BODY, fontSize: 14.5, lineHeight: 1.65, fontWeight: 300 }}>
                  {t("publicHome", card.bodyKey)}
                </Text>
              </Stack>
            ))}
          </SimpleGrid>
        </Container>

        {/* Ecosystem section */}
        <Container id="ecosystem" size="xl" py={{ base: 56, md: 96 }}>
          <Group justify="space-between" align="flex-end" mb={{ base: 40, md: 64 }} gap="xl">
            <Stack gap="md" maw={560}>
              <EyebrowLabel>{t("publicHome", "ecosystemEyebrow")}</EyebrowLabel>
              <Title
                order={2}
                style={{
                  fontFamily: FONT_SERIF,
                  fontWeight: 700,
                  color: TEXT_PRIMARY,
                  fontSize: "clamp(2rem, 3.6vw, 2.9rem)",
                  lineHeight: 1.15,
                  letterSpacing: "-0.02em",
                }}
              >
                {t("publicHome", "ecosystemHeadline")}
              </Title>
            </Stack>
            <Text
              maw={360}
              ta={{ base: "left", md: "right" }}
              style={{ color: TEXT_BODY, fontSize: 15, lineHeight: 1.7, fontWeight: 300 }}
            >
              {t("publicHome", "ecosystemSupportingLine")}
            </Text>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
            {ECOSYSTEM_CARDS.map((card) => (
              <Stack
                key={card.nameKey}
                gap="sm"
                style={{
                  borderRadius: 20,
                  background: card.featured
                    ? `linear-gradient(160deg, rgba(201,162,39,0.18), rgba(201,162,39,0.04))`
                    : CARD_SURFACE,
                  border: `1px solid ${card.featured ? GOLD_BORDER : CARD_BORDER}`,
                  padding: 24,
                }}
              >
                <IconTile Icon={card.icon} />
                <EyebrowLabel>{t("publicHome", card.eyebrowKey)}</EyebrowLabel>
                <Title
                  order={3}
                  style={{
                    fontFamily: FONT_SERIF,
                    fontWeight: 700,
                    color: TEXT_PRIMARY,
                    fontSize: 19,
                  }}
                >
                  {t("publicHome", card.nameKey)}
                </Title>
                <Text style={{ color: TEXT_BODY, fontSize: 14, lineHeight: 1.6, fontWeight: 300 }}>
                  {t("publicHome", card.bodyKey)}
                </Text>
              </Stack>
            ))}
          </SimpleGrid>
        </Container>

        {/* Closing CTA */}
        <Container size="xl" pb={{ base: 72, md: 112 }}>
          <Stack
            gap="lg"
            align="center"
            ta="center"
            style={{
              borderRadius: 24,
              background: CTA_SECTION_BG,
              border: `1px solid ${GOLD_BORDER}`,
              padding: "64px 32px",
            }}
          >
            <Title
              order={2}
              maw={720}
              style={{
                fontFamily: FONT_SERIF,
                fontWeight: 700,
                color: TEXT_PRIMARY,
                fontSize: "clamp(1.9rem, 3.6vw, 2.7rem)",
                lineHeight: 1.15,
                letterSpacing: "-0.02em",
              }}
            >
              {t("publicHome", "closingHeadline")}
            </Title>
            <Text
              maw={620}
              style={{ color: TEXT_BODY, fontSize: 16.5, lineHeight: 1.7, fontWeight: 300 }}
            >
              {t("publicHome", "closingBody")}
            </Text>
            <Group gap="lg" justify="center" wrap="wrap">
              <Button
                component={Link}
                href="/sign-in"
                size="md"
                radius="md"
                rightSection={<ArrowRight size={18} />}
                styles={GOLD_BUTTON_STYLES}
              >
                {t("publicHome", "closingPrimaryCta")}
              </Button>
              <Anchor
                href="#"
                underline="never"
                style={{ color: TEXT_PRIMARY, fontSize: 14, fontWeight: 600 }}
              >
                {t("publicHome", "closingSecondaryLink")}
              </Anchor>
            </Group>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}
