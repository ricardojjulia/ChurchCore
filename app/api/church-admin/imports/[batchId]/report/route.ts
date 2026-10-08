import { NextResponse } from "next/server";

import { logAuditEvent } from "@/lib/actions/audit";
import { requireChurchSession } from "@/lib/auth";
import { buildImportReportCsv } from "@/lib/import-report-csv";
import { computeImportReconciliation } from "@/lib/import-reconciliation";

// G4.2: CSV download of an import's reconciliation report. Church admins only,
// scoped to the session's church; another church's batch id is "not found".
// Minimal columns by design: no names, emails or phones.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, ctx: { params: Promise<{ batchId: string }> }) {
  // Outside any try: requireChurchSession redirects a signed-out caller by throwing.
  const session = await requireChurchSession("/app/church-admin");

  if (session.appContext.roleId !== "church-admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { batchId } = await ctx.params;
  if (!UUID_PATTERN.test(batchId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const churchId = session.appContext.church.id;

  try {
    const report = await computeImportReconciliation(churchId, batchId, { includeRows: true });
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (report.state === "not_available") {
      return NextResponse.json({ error: "The report is not available yet." }, { status: 409 });
    }
    if (report.state === "legacy") {
      return NextResponse.json({ error: "Row-level outcomes were not recorded for this import." }, { status: 409 });
    }

    const csv = buildImportReportCsv(report);

    // Fail closed: a download that cannot be audited is not served.
    await logAuditEvent({
      tableName: "import_batches",
      recordId: batchId,
      operation: "UPDATE",
      actorId: session.userId,
      churchId,
      actorRole: session.appContext.roleId,
      newValues: { event: "import_report_download", import_type: report.batch.importType, rowCount: report.rows?.length ?? 0 },
    });

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=import-${batchId}-reconciliation.csv`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[import-report] could not produce the report", {
      churchId,
      batchId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
