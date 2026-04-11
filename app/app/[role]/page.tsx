import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { MemberPortalHome } from "@/components/application/member-portal-home";
import { PortalWorkspace } from "@/components/application/portal-workspace";
import { getChurchAdminWorkspaceState } from "@/lib/application-state-store";
import { requireChurchSession } from "@/lib/auth";
import { getMemberPortalData } from "@/lib/member-portal-data";
import { churchPortalRoles, getPortalRole } from "@/lib/portal";
import { siteConfig } from "@/lib/site";

type ChurchAppRolePageProps = {
  params: Promise<{
    role: string;
  }>;
};

export async function generateMetadata({
  params,
}: ChurchAppRolePageProps): Promise<Metadata> {
  const { role } = await params;
  const portalRole = getPortalRole(role);

  if (!portalRole || portalRole.id === "super-admin") {
    return {
      title: siteConfig.name,
    };
  }

  return {
    title: `${portalRole.label} App | ${siteConfig.name}`,
    description: portalRole.description,
  };
}

export function generateStaticParams() {
  return churchPortalRoles.map((role) => ({
    role: role.id,
  }));
}

export default async function ChurchAppRolePage({
  params,
}: ChurchAppRolePageProps) {
  const { role } = await params;
  const portalRole = getPortalRole(role);
  const session = await requireChurchSession(`/app/${role}`);

  if (!portalRole || portalRole.id === "super-admin") {
    notFound();
  }

  if (portalRole.id !== session.appContext.roleId) {
    redirect(session.homePath);
  }

  const churchAdminState =
    portalRole.id === "church-admin"
      ? await getChurchAdminWorkspaceState(session)
      : null;
  const memberPortalData =
    portalRole.id === "member" ? await getMemberPortalData(session) : null;

  if (portalRole.id === "member" && memberPortalData) {
    return <MemberPortalHome session={session} data={memberPortalData} />;
  }

  return (
    <PortalWorkspace
      role={portalRole}
      session={session}
      churchAdminState={churchAdminState}
    />
  );
}
