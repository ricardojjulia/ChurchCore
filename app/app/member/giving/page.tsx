import { redirect } from "next/navigation";

import { DonorPortal } from "@/components/portal/donor-portal";
import { ApplicationShell } from "@/components/application/app-shell";
import { MemberBottomNav } from "@/components/application/member-bottom-nav";
import { requireChurchSession } from "@/lib/auth";
import { getDonorPortalData } from "@/lib/donations-data";
import { todayInTimeZone } from "@/lib/church-time";
import { listStatementYears } from "@/lib/giving-statements/load";
import { listOwnRecurringGifts } from "@/lib/recurring-gifts";
import { onlineGivingNotice, onlineGivingStatus, stripePublishableKey } from "@/lib/stripe/donations";
import { createTenantAdminClient } from "@/lib/supabase/tenant";

export default async function MemberGivingPage() {
  const session = await requireChurchSession("/app/member/giving");

  if (session.appContext.roleId !== "member") {
    redirect(session.homePath);
  }

  const churchId = session.appContext.church.id;
  const profileId = session.churchProfileId;
  const timeZone = session.appContext.church.timezone ?? null;
  const [data, giving, recurringGifts, statementYears] = await Promise.all([
    getDonorPortalData(session),
    onlineGivingStatus(churchId),
    // The member's own recurring gifts (G3.1), read on the server for this
    // church and profile only.
    profileId ? listOwnRecurringGifts(createTenantAdminClient(), churchId, profileId) : Promise.resolve([]),
    // Years with statement-eligible gifts (G3.3): the church profile id, never
    // the login id, scopes this to the member's own gifts.
    profileId
      ? listStatementYears(createTenantAdminClient(), churchId, profileId, timeZone).catch((error) => {
          // The giving page must still render if the years can't be read.
          console.error("listStatementYears failed:", error instanceof Error ? error.message : error);
          return [] as number[];
        })
      : Promise.resolve([] as number[]),
  ]);

  const navItems = [
    {
      href: "/app/member",
      label: "Home",
      description: "Member overview",
      icon: "Heart",
    },
    {
      href: "/app/member/giving",
      label: "Giving",
      description: "Your giving history",
      icon: "Heart",
      active: true,
    },
  ];

  return (
    <ApplicationShell
      session={session}
      workspaceHref="/app/member"
      calendarHref="/app/calendar"
      sectionLabel="Member"
      title="My Giving"
      description={session.appContext.church.name}
      sidebarTitle="Giving"
      sidebarDescription="Your voluntary giving history and receipts. All giving is 100% your choice."
      navLabel="Member"
      navItems={navItems}
      bottomNav={<MemberBottomNav />}
    >
      <DonorPortal
        data={data}
        givingNotice={onlineGivingNotice(giving.mode)}
        publishableKey={giving.mode === "live" ? stripePublishableKey() : null}
        stripeAccount={giving.stripeAccount}
        recurringGifts={recurringGifts}
        statementYears={statementYears}
        today={todayInTimeZone(session.appContext.church.timezone ?? null)}
        timeZone={session.appContext.church.timezone ?? null}
      />
    </ApplicationShell>
  );
}
