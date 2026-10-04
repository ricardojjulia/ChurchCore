import { NextResponse } from "next/server";

import { requireChurchSession } from "@/lib/auth";
import { todayInTimeZone } from "@/lib/church-time";
import { loadChurchHeader, loadStatementRun } from "@/lib/giving-statements/load";
import { renderStatementPdf } from "@/lib/giving-statements/pdf";
import { createTenantAdminClient } from "@/lib/supabase/tenant";

// A member's own statement for a calendar year. There is deliberately no donor
// parameter: the profile is always the session's church profile id, so a member
// can only ever read their own gifts (including their own anonymous ones).
export async function GET(request: Request) {
  // Outside any try: a signed-out caller's redirect must not become a 500.
  const session = await requireChurchSession("/api/member/giving-statement");
  const profileId = session.churchProfileId;
  if (!profileId) {
    return NextResponse.json({ error: "No member profile in this church." }, { status: 403 });
  }

  const churchId = session.appContext.church.id;
  const timeZone = session.appContext.church.timezone;
  const currentYear = Number(todayInTimeZone(timeZone).slice(0, 4));
  const yearParam = new URL(request.url).searchParams.get("year");
  const year = yearParam === null || yearParam.trim() === "" ? currentYear - 1 : /^\d{4}$/.test(yearParam.trim()) ? Number(yearParam.trim()) : NaN;
  if (!Number.isInteger(year) || year < 2000 || year > currentYear) {
    return NextResponse.json({ error: "Choose a valid year." }, { status: 400 });
  }
  const range = { start: `${year}-01-01`, end: `${year}-12-31` };

  try {
    const admin = createTenantAdminClient();
    const run = await loadStatementRun(admin, churchId, timeZone, range, { profileId });
    const statement = run.statements.find((s) => s.profileId === profileId);
    if (!statement) {
      return NextResponse.json({ error: `No gifts recorded for ${year}.` }, { status: 404 });
    }
    const church = await loadChurchHeader(admin, churchId);
    const pdf = await renderStatementPdf({ church, statement, range });
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="giving-statement-${year}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("member giving statement failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not generate your statement." }, { status: 500 });
  }
}
