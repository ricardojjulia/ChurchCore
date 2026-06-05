export type ControlPlaneSectionId =
  | "overview"
  | "tenants"
  | "billing"
  | "support"
  | "demo-feedback";

export type ControlPlaneMetric = {
  label: string;
  value: string;
  detail: string;
};

export type ControlPlaneTenantItem = {
  church: string;
  stage: string;
  detail: string;
  priority: "healthy" | "warning" | "critical";
};

export type TenantViewAuditItem = {
  id: string;
  church: string;
  detail: string;
  when: string;
  eventType: "enter" | "exit";
};

export type ControlPlaneDashboardData = {
  metrics: ControlPlaneMetric[];
  tenantItems: ControlPlaneTenantItem[];
  auditItems: TenantViewAuditItem[];
};

export const controlPlaneSections = [
  {
    id: "overview",
    label: "Overview",
    description: "Platform health and launch flow",
  },
  {
    id: "tenants",
    label: "Tenants",
    description: "Provisioning, lifecycle, and readiness",
  },
  {
    id: "billing",
    label: "Billing",
    description: "Renewals, payment exceptions, and recovery",
  },
  {
    id: "support",
    label: "Support",
    description: "Escalations, access reviews, and queue health",
  },
  {
    id: "demo-feedback",
    label: "Demo Feedback",
    description: "Bugs, errors, and improvement signals from the hosted demo",
  },
] as const;

export function getControlPlaneSection(sectionId?: string) {
  if (!sectionId) {
    return controlPlaneSections[0];
  }

  return controlPlaneSections.find((section) => section.id === sectionId);
}

export const controlPlaneMetrics: ControlPlaneMetric[] = [
  {
    label: "Active tenants",
    value: "18",
    detail: "2 churches are still moving through onboarding approval.",
  },
  {
    label: "Billing exceptions",
    value: "3",
    detail: "One urgent recovery item and two payment retries need follow-up.",
  },
  {
    label: "Support load",
    value: "11 open",
    detail: "Most active requests are access or provisioning-related.",
  },
];

export const launchPipeline: ControlPlaneTenantItem[] = [
  {
    church: "Grace Harbor Church",
    stage: "Domain verification",
    detail: "Email domain confirmation is blocking launch approval.",
    priority: "warning",
  },
  {
    church: "New City Chapel",
    stage: "Role review",
    detail: "Default admin claims still need final tenant mapping.",
    priority: "critical",
  },
  {
    church: "Renew Community",
    stage: "Ready to launch",
    detail: "Provisioning checks are complete and waiting on release timing.",
    priority: "healthy",
  },
];

export const billingQueue = [
  {
    church: "New City Chapel",
    status: "Card replacement",
    detail: "The third retry failed and outreach should happen today.",
  },
  {
    church: "Redeemer North",
    status: "Renewal window",
    detail: "Renewal lands in 6 days with no current issue flagged.",
  },
  {
    church: "Hope Fellowship",
    status: "Manual review",
    detail: "Usage-based add-on total changed enough to justify review.",
  },
];

export const supportQueue = [
  {
    title: "Pastoral-notes export audit",
    detail: "Access pattern needs manual validation before closure.",
  },
  {
    title: "Grace Harbor invite delivery issue",
    detail: "Provisioning queue should not advance until domain setup is confirmed.",
  },
  {
    title: "Billing access escalation",
    detail: "Church admin permissions need a scoped support response, not a platform-wide role grant.",
  },
];
