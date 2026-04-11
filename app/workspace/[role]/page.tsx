import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { getPortalRole, getRoleHomePath, portalRoles } from "@/lib/portal";
import { siteConfig } from "@/lib/site";

type WorkspacePageProps = {
  params: Promise<{
    role: string;
  }>;
};

export async function generateMetadata({
  params,
}: WorkspacePageProps): Promise<Metadata> {
  const { role } = await params;
  const portalRole = getPortalRole(role);

  if (!portalRole) {
    return {
      title: siteConfig.name,
    };
  }

  return {
    title: `${portalRole.label} Workspace | ${siteConfig.name}`,
    description: portalRole.description,
  };
}

export function generateStaticParams() {
  return portalRoles.map((role) => ({
    role: role.id,
  }));
}

export default async function WorkspaceRolePage({
  params,
}: WorkspacePageProps) {
  const { role } = await params;
  const portalRole = getPortalRole(role);

  if (!portalRole) {
    notFound();
  }

  await requireSession(`/workspace/${role}`);

  redirect(getRoleHomePath(portalRole.id));
}
