import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ControlPlaneDashboard } from "@/components/application/control-plane-dashboard";
import { requireControlPlaneSession } from "@/lib/auth";
import { getControlPlaneDashboardData } from "@/lib/control-plane-data";
import {
  controlPlaneSections,
  getControlPlaneSection,
} from "@/lib/control-plane";

type ControlPlaneSectionPageProps = {
  params: Promise<{
    section: string;
  }>;
};

export async function generateMetadata({
  params,
}: ControlPlaneSectionPageProps): Promise<Metadata> {
  const { section } = await params;
  const activeSection = getControlPlaneSection(section);

  return {
    title: activeSection
      ? `${activeSection.label} | ChurchCore Control`
      : "Control Plane | ChurchCore",
  };
}

export function generateStaticParams() {
  return controlPlaneSections
    .filter((section) => section.id !== "overview")
    .map((section) => ({
      section: section.id,
    }));
}

export default async function ControlPlaneSectionPage({
  params,
}: ControlPlaneSectionPageProps) {
  const { section } = await params;
  const activeSection = getControlPlaneSection(section);

  if (!activeSection || activeSection.id === "overview") {
    notFound();
  }

  const session = await requireControlPlaneSession(`/control/${section}`);
  const dashboardData = await getControlPlaneDashboardData(session);

  return (
    <ControlPlaneDashboard
      session={session}
      sectionId={activeSection.id}
      dashboardData={dashboardData}
    />
  );
}
