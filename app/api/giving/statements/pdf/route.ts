import { NextResponse } from "next/server";

import { logAuditEvent } from "@/lib/actions/audit";
import { requireChurchSession } from "@/lib/auth";
import { donorRef, namedView, resolveStatementRange } from "@/lib/giving-statements/build";
import { loadChurchHeader, loadStatementRun } from "@/lib/giving-statements/load";
import { renderStatementPdf } from "@/lib/giving-statements/pdf";
import { createTenantAdminClient } from "@/lib/supabase/tenant";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Admin download of one donor's statement for a range. Church admins only (the
// giving page's own gate). `donor` is a staff-safe reference from the preview
// (`p:<profile uuid>` or `h:<hash>`). The PDF omits the donor's anonymous gifts.
export async function GET(request: Request) {
  // Outside any try: a signed-out caller's redirect must not become a 500.
  const session = await requireChurchSession("/api/giving/statements/pdf");
  if (session.appContext.roleId !== "church-admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const donor = searchParams.get("donor")?.trim() ?? "";
  if (!donor) {
    return NextResponse.json({ error: "A donor is required." }, { status: 400 });
  }
  // Only staff-safe references: a raw `e:<email>` key is never accepted.
  if (!donor.startsWith("p:") && !donor.startsWith("h:")) {
    return NextResponse.json({ error: "Invalid donor reference." }, { status: 400 });
  }
  const churchId = session.appContext.church.id;
  const timeZone = session.appContext.church.timezone;
  const resolved = resolveStatementRange({ start: searchParams.get("start"), end: searchParams.get("end") }, timeZone);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  try {
    const admin = createTenantAdminClient();
    const profileId = donor.startsWith("p:") ? donor.slice(2) : null;
    if (profileId !== null && !UUID.test(profileId)) {
      return NextResponse.json({ error: "Statement not found." }, { status: 404 });
    }
    const run = await loadStatementRun(admin, churchId, timeZone, resolved.range, profileId ? { profileId } : {});
    const full = run.statements.find((s) => donorRef(s.donorKey) === donor);
    // Staff get the donor's NAMED gifts only; a donor with none has no staff statement.
    const statement = full ? namedView(full) : null;
    if (!statement) {
      return NextResponse.json({ error: "Statement not found." }, { status: 404 });
    }

    const church = await loadChurchHeader(admin, churchId);
    const pdf = await renderStatementPdf({ church, statement, range: resolved.range });

    try {
      await logAuditEvent({
        tableName: "giving_statements",
        recordId: churchId,
        operation: "INSERT",
        actorId: session.userId,
        churchId,
        actorRole: session.appContext.roleId,
        newValues: {
          action: "pdf_download",
          donorRef: donorRef(statement.donorKey),
          start: resolved.range.start,
          end: resolved.range.end,
        },
      });
    } catch (error) {
      console.error("giving statement audit failed:", error instanceof Error ? error.message : error);
    }

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="giving-statement-${resolved.range.start}-to-${resolved.range.end}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("giving statement pdf failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not generate the statement." }, { status: 500 });
  }
}
