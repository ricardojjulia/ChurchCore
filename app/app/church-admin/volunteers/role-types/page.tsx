import { redirect } from "next/navigation";

import { ApplicationShell } from "@/components/application/app-shell";
import { RoleTypeManager } from "@/components/application/role-type-manager";
import { requireChurchSession } from "@/lib/auth";
import { getChurchSkillOptions, getRoleTypes } from "@/lib/volunteer-data";

const NAV_ITEMS = [
  { href: "/app/church-admin", label: "Home", description: "Church admin", icon: "Users" },
  { href: "/app/church-admin/volunteers", label: "Volunteers", description: "Directory & hours", icon: "Users" },
  { href: "/app/church-admin/volunteers/schedules", label: "Schedules", description: "Service plans", icon: "CalendarCheck" },
  { href: "/app/church-admin/volunteers/role-types", label: "Role Types", description: "Team roster taxonomy", icon: "ShieldCheck", active: true },
];

// Matches canManageServicePlans() in app/app/volunteer-actions.ts — the same
// three-role gate already used by the sibling volunteers/* routes.
function canManageServicePlans(roleId: string) {
  return roleId === "church-admin" || roleId === "pastor" || roleId === "ministry-leader";
}

export default async function RoleTypesPage() {
  const session = await requireChurchSession("/app/church-admin/volunteers/role-types");
  if (!canManageServicePlans(session.appContext.roleId)) {
    redirect(session.homePath);
  }

  const [roleTypes, skillOptions] = await Promise.all([
    getRoleTypes(session),
    getChurchSkillOptions(session),
  ]);

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/church-admin"
      calendarHref="/app/calendar"
      sectionLabel="Volunteers"
      title="Role Types"
      description={session.appContext.church.name}
      sidebarTitle="Role Types"
      sidebarDescription="Define reusable service-plan roles and their required skills."
      navLabel="Church admin"
      navItems={NAV_ITEMS}
    >
      <div style={{ padding: "var(--mantine-spacing-md)" }}>
        <RoleTypeManager
          roleTypes={roleTypes}
          skillOptions={skillOptions}
          canManage={canManageServicePlans(session.appContext.roleId)}
        />
      </div>
    </ApplicationShell>
  );
}
