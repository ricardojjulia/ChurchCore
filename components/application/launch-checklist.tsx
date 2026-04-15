"use client";

import { useState } from "react";
import {
  Accordion,
  Badge,
  Checkbox,
  Group,
  Paper,
  Progress,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import {
  CheckCircle,
  Circle,
  Database,
  Heart,
  Lock,
  MessageSquare,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react";

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
}

interface ChecklistSection {
  id: string;
  title: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  color: string;
  items: ChecklistItem[];
}

const CHECKLIST: ChecklistSection[] = [
  {
    id: "rls",
    title: "Database & RLS",
    icon: Database,
    color: "blue",
    items: [
      { id: "rls-profiles", label: "profiles RLS verified", description: "Only owner and management can read/update sensitive fields." },
      { id: "rls-donations", label: "donations RLS verified", description: "Members see own non-anonymous gifts; management sees all." },
      { id: "rls-elder-notes", label: "elder_notes RLS verified", description: "Pastor/elder only — church admins explicitly excluded." },
      { id: "rls-discernment", label: "discernment_sessions RLS verified", description: "Pastor/elder only." },
      { id: "rls-pastoral-notes", label: "pastoral_notes RLS verified", description: "Pastor-only reads and writes." },
      { id: "rls-audit-log", label: "audit_log read-only for platform admins", description: "No direct app writes; trigger-only inserts." },
      { id: "rls-comm-logs", label: "communication_logs append-only", description: "No update/delete policies set." },
      { id: "rls-ai-interactions", label: "ai_interactions management-only", description: "Members cannot read raw AI interaction logs." },
    ],
  },
  {
    id: "donations",
    title: "Voluntary Donations",
    icon: Heart,
    color: "teal",
    items: [
      { id: "donations-voluntary-language", label: "All giving UI uses voluntary language", description: "No 'required', 'subscription', or 'tier' language anywhere." },
      { id: "donations-no-platform-fee", label: "Platform fee is zero", description: "100% of each donation goes to the church — confirmed in Stripe dashboard." },
      { id: "donations-receipt-email", label: "Receipt emails tested", description: "Successful payment triggers thank-you email with reference number." },
      { id: "donations-anonymous-works", label: "Anonymous giving tested", description: "Anonymous donations omit donor identity from all records." },
      { id: "donations-cancel-recurring", label: "Cancel recurring flow tested", description: "Member can cancel a Stripe subscription from their giving portal." },
      { id: "donations-stripe-webhook", label: "Stripe webhook configured", description: "Webhook endpoint validates signature and updates donation status." },
    ],
  },
  {
    id: "ai",
    title: "AI Guardrails",
    icon: Sparkles,
    color: "violet",
    items: [
      { id: "ai-disclaimer-wisdom", label: "AI disclaimer shown on Wisdom Prompt", description: "Shown before and after every AI output per §6 of advanced_ministry_elder_pastor.md." },
      { id: "ai-disclaimer-volunteer", label: "AI disclaimer shown on Volunteer Matcher", description: "AiDisclaimer component present on every AI surface." },
      { id: "ai-no-auto-assign", label: "No AI auto-assignment", description: "Volunteer suggestions require human approve/reject before any ministry assignment." },
      { id: "ai-no-pii-in-prompts", label: "No PII sent to AI", description: "Only topic text sent to LLM — no member names, notes, or pastoral data." },
      { id: "ai-interactions-logged", label: "ai_interactions table logging enabled", description: "Every AI call writes a row for compliance review." },
    ],
  },
  {
    id: "comms",
    title: "Communications",
    icon: MessageSquare,
    color: "blue",
    items: [
      { id: "comms-consent-check", label: "Consent check before every send", description: "queueCommunicationAction verifies notification_preferences before dispatching." },
      { id: "comms-sendgrid-tested", label: "SendGrid email delivery tested", description: "SENDGRID_API_KEY and SENDGRID_FROM_EMAIL verified in production environment." },
      { id: "comms-twilio-tested", label: "Twilio SMS tested (if used)", description: "TWILIO_* vars set; test SMS delivered successfully." },
      { id: "comms-audit-log", label: "Communication audit log working", description: "Every sent/failed message appears in communication_logs." },
    ],
  },
  {
    id: "data-rights",
    title: "Data Rights",
    icon: ShieldCheck,
    color: "orange",
    items: [
      { id: "dr-export-works", label: "Data export download tested", description: "Member can download JSON export of all personal records." },
      { id: "dr-delete-request", label: "Deletion request flow tested", description: "Member can request deletion; church admin sees the request." },
      { id: "dr-cancel-delete", label: "Deletion cancellation tested", description: "Member can cancel within 30-day grace period." },
      { id: "dr-erasure-procedure", label: "erase_profile_pii() procedure reviewed", description: "Erasure function restricted to service_role; tested in staging." },
    ],
  },
  {
    id: "security",
    title: "Security",
    icon: Lock,
    color: "red",
    items: [
      { id: "sec-env-vars", label: "No secrets in git history", description: "All keys in environment variables; .env.local in .gitignore." },
      { id: "sec-vault-credentials", label: "Tenant DB credentials in Vault (or noted for migration)", description: "vault_secret_name path documented in credential hardening migration." },
      { id: "sec-consent-immutable", label: "consent_logs insert-only enforced", description: "No update/delete policies on consent_logs per security_consent_immutable migration." },
      { id: "sec-stripe-webhook-sig", label: "Stripe webhook signature verified", description: "STRIPE_WEBHOOK_SECRET used to validate all incoming webhook events." },
      { id: "sec-owasp-xss", label: "XSS: no dangerouslySetInnerHTML", description: "Search codebase confirmed no unguarded HTML injection." },
      { id: "sec-owasp-sqli", label: "SQL injection: parameterized queries only", description: "All queryTenantLocalDb calls use $1/$2 params, never string interpolation." },
    ],
  },
  {
    id: "mobile",
    title: "Mobile & PWA",
    icon: Smartphone,
    color: "teal",
    items: [
      { id: "pwa-manifest", label: "Web manifest verified", description: "manifest.ts returns valid name, icons, start_url, display:standalone." },
      { id: "pwa-sw", label: "Service worker registered in production", description: "ServiceWorkerRegistration component mounted in layout; sw.js served from /." },
      { id: "pwa-offline", label: "Offline mode tested", description: "Member portal loads from cache when network is offline." },
      { id: "mobile-bottom-nav", label: "Bottom nav tested on real device", description: "Home, Calendar, Directory, Ministries, Family tabs all functional on iOS/Android." },
      { id: "mobile-responsive", label: "All new routes mobile-responsive", description: "Communications Hub, Giving, Data Rights, Discernment Room tested at 375px." },
    ],
  },
  {
    id: "roles",
    title: "Role Access",
    icon: Users,
    color: "gray",
    items: [
      { id: "role-member-giving", label: "Member can access /app/member/giving", description: "Other roles redirected to their home path." },
      { id: "role-member-data-rights", label: "Member can access /app/member/data-rights", description: "Pastor/admin cannot delete their own account via self-service." },
      { id: "role-pastor-giving", label: "Pastor can access /app/giving dashboard", description: "Members and ministry leaders redirected." },
      { id: "role-pastor-communications", label: "Pastor can access /app/communications", description: "Member role redirected." },
      { id: "role-elder-discernment", label: "Elder/Pastor can access /app/elders/discernment", description: "Church admin explicitly excluded per §9." },
      { id: "role-admin-council", label: "Church admin can access /app/council/forge", description: "Members and ministry leaders excluded." },
    ],
  },
];

export function LaunchChecklist() {
  const allItems = CHECKLIST.flatMap((s) => s.items);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const total = allItems.length;
  const done = checked.size;
  const pct = Math.round((done / total) * 100);

  return (
    <Stack gap="lg">
      {/* Progress */}
      <Paper withBorder p="lg" radius="md">
        <Group justify="space-between" mb="sm">
          <Text fw={600} fz="sm">
            Launch Readiness
          </Text>
          <Badge
            color={pct === 100 ? "green" : pct >= 80 ? "teal" : pct >= 50 ? "yellow" : "red"}
            variant="light"
            size="sm"
          >
            {done} / {total} complete
          </Badge>
        </Group>
        <Progress value={pct} color={pct === 100 ? "green" : "blue"} radius="xl" size="md" />
        {pct === 100 ? (
          <Text fz="xs" c="teal" mt="sm" fw={600}>
            All checks complete — ready to launch!
          </Text>
        ) : (
          <Text fz="xs" c="dimmed" mt="sm">
            {total - done} item{total - done !== 1 ? "s" : ""} remaining
          </Text>
        )}
      </Paper>

      {/* Sections */}
      <Accordion multiple variant="separated" radius="md">
        {CHECKLIST.map((section) => {
          const sectionDone = section.items.filter((i) => checked.has(i.id)).length;
          const SectionIcon = section.icon;
          return (
            <Accordion.Item key={section.id} value={section.id}>
              <Accordion.Control>
                <Group gap="sm">
                  <ThemeIcon color={section.color} variant="light" size="sm" radius="md">
                    <SectionIcon size={12} />
                  </ThemeIcon>
                  <Text fz="sm" fw={600}>
                    {section.title}
                  </Text>
                  <Badge
                    size="xs"
                    color={sectionDone === section.items.length ? "green" : section.color}
                    variant="light"
                    ml="xs"
                  >
                    {sectionDone}/{section.items.length}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  {section.items.map((item) => {
                    const isDone = checked.has(item.id);
                    return (
                      <Group
                        key={item.id}
                        gap="sm"
                        align="flex-start"
                        style={{ cursor: "pointer" }}
                        onClick={() => toggle(item.id)}
                      >
                        <ThemeIcon
                          color={isDone ? "green" : "gray"}
                          variant="transparent"
                          size="xs"
                          mt={2}
                        >
                          {isDone ? <CheckCircle size={16} /> : <Circle size={16} />}
                        </ThemeIcon>
                        <Stack gap={2} style={{ flex: 1 }}>
                          <Text
                            fz="sm"
                            fw={500}
                            style={{
                              textDecoration: isDone ? "line-through" : "none",
                              color: isDone ? "var(--mantine-color-dimmed)" : undefined,
                            }}
                          >
                            {item.label}
                          </Text>
                          <Text fz="xs" c="dimmed">
                            {item.description}
                          </Text>
                        </Stack>
                        <Checkbox
                          checked={isDone}
                          onChange={() => toggle(item.id)}
                          onClick={(e) => e.stopPropagation()}
                          size="xs"
                          radius="sm"
                        />
                      </Group>
                    );
                  })}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>
    </Stack>
  );
}
