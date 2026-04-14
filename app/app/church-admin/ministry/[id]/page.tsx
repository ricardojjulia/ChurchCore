import { notFound, redirect } from "next/navigation";

import { MinistryForgeDashboard } from "@/components/application/ministry-forge-dashboard";
import { requireChurchSession } from "@/lib/auth";
import { getChurchAdminPeopleData } from "@/lib/church-admin-people-data";
import { getMinistryForgeDetail } from "@/lib/ministry-forge-data";

export default async function MinistryForgePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireChurchSession("/app/church-admin/ministry");

  if (session.appContext.roleId !== "church-admin" && session.appContext.roleId !== "pastor") {
    redirect(session.homePath);
  }

  const [detail, peopleData] = await Promise.all([
    getMinistryForgeDetail(session, id),
    getChurchAdminPeopleData(session),
  ]);

  if (!detail) {
    notFound();
  }

  const allPeople = peopleData.people.map((p) => ({
    id: p.id,
    fullName: p.fullName,
  }));

  return <MinistryForgeDashboard session={session} detail={detail} allPeople={allPeople} />;
}
