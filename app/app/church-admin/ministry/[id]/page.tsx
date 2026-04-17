import { notFound, redirect } from "next/navigation";

import { MinistryForgeDashboard } from "@/components/application/ministry-forge-dashboard";
import { requireChurchSession } from "@/lib/auth";
import { getChurchAdminPeopleData } from "@/lib/church-admin-people-data";
import {
  getChildrenTrackData,
  getEducationTrackData,
  getMarriageTrackData,
  getMensTrackData,
  getMinistryForgeDetail,
  getMissionsTrackData,
  getOutreachTrackData,
  getVolunteerMatcherData,
  getWomensTrackData,
  getWorshipTrackData,
  getYoungAdultTrackData,
  getYouthTrackData,
} from "@/lib/ministry-forge-data";
import { hasTrackPanel } from "@/lib/ministry-forge-types";

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

  const matcherData = await getVolunteerMatcherData(session, id);

  // Load the type-specific track data if this ministry has a dedicated panel
  const ministryType = detail.ministry.ministryType;
  const [
    worshipData, mensData, womensData, marriageData, missionsData,
    childrenData, youthData, youngAdultData, educationData, outreachData,
  ] = await Promise.all([
    ministryType === "worship"     ? getWorshipTrackData(session, id)     : Promise.resolve(null),
    ministryType === "men"         ? getMensTrackData(session, id)         : Promise.resolve(null),
    ministryType === "women"       ? getWomensTrackData(session, id)       : Promise.resolve(null),
    ministryType === "marriage"    ? getMarriageTrackData(session, id)     : Promise.resolve(null),
    ministryType === "missions"    ? getMissionsTrackData(session, id)     : Promise.resolve(null),
    ministryType === "children"    ? getChildrenTrackData(session, id)     : Promise.resolve(null),
    ministryType === "youth"       ? getYouthTrackData(session, id)        : Promise.resolve(null),
    ministryType === "young_adult" ? getYoungAdultTrackData(session, id)   : Promise.resolve(null),
    ministryType === "education"   ? getEducationTrackData(session, id)    : Promise.resolve(null),
    ministryType === "outreach"    ? getOutreachTrackData(session, id)     : Promise.resolve(null),
  ]);

  return (
    <MinistryForgeDashboard
      session={session}
      detail={detail}
      allPeople={allPeople}
      matcherData={matcherData}
      hasTrackPanel={hasTrackPanel(ministryType)}
      worshipData={worshipData}
      mensData={mensData}
      womensData={womensData}
      marriageData={marriageData}
      missionsData={missionsData}
      childrenData={childrenData}
      youthData={youthData}
      youngAdultData={youngAdultData}
      educationData={educationData}
      outreachData={outreachData}
    />
  );
}
