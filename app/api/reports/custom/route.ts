import { NextResponse } from "next/server";

import { requireChurchSession } from "@/lib/auth";
import { logAuditEvent } from "@/lib/actions/audit";
import { queryTenantLocalDb } from "@/lib/supabase/tenant";

// Prefix cells that start with =, +, -, @, tab, or CR with a single quote so
// spreadsheet apps (Excel/Sheets/LibreOffice) treat them as text rather than
// live formulas -- a standard CSV-export mitigation for formula injection.
// User-controlled fields (names, emails, descriptions) are exported here
// unsanitized otherwise.
const FORMULA_INJECTION_PREFIX = /^[=+\-@\t\r]/;

export function neutralizeFormulaInjection(value: string): string {
  return FORMULA_INJECTION_PREFIX.test(value) ? `'${value}` : value;
}

export function jsonToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const headerLine = headers.join(",");
  const rowLines = rows.map((row) =>
    headers
      .map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return "";
        const strVal = neutralizeFormulaInjection(String(val));
        if (
          strVal.includes(",") ||
          strVal.includes('"') ||
          strVal.includes("\n") ||
          strVal.includes("\r")
        ) {
          return `"${strVal.replace(/"/g, '""')}"`;
        }
        return strVal;
      })
      .join(","),
  );
  return [headerLine, ...rowLines].join("\n");
}

export async function GET(request: Request) {
  try {
    const session = await requireChurchSession("/api/reports/custom");

    // Only admins or pastors/elders can access report data
    if (
      session.appContext.roleId !== "church-admin" &&
      session.appContext.roleId !== "pastor"
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const entity = searchParams.get("entity") ?? "people";
    const churchId = session.appContext.church.id;

    let rows: Record<string, unknown>[] = [];
    let query = "";

    if (entity === "people") {
      query = `select id, full_name, email, phone, role, membership_status, created_at 
               from public.profiles 
               where church_id = $1 
               order by full_name asc`;
    } else if (entity === "giving") {
      query = `select id, donor_name, donor_email, amount_cents, currency, fund_designation, status, created_at 
               from public.donations 
               where church_id = $1 
               order by created_at desc`;
    } else if (entity === "events") {
      query = `select id, title, description, start as starts_at, "end" as ends_at, category, created_at 
               from public.events 
               where church_id = $1 
               order by start desc`;
    } else {
      return NextResponse.json({ error: "Invalid entity type" }, { status: 400 });
    }

    const result = await queryTenantLocalDb<Record<string, unknown>>(query, [churchId]);
    rows = result.rows;

    const csvData = jsonToCsv(rows);

    // Audit log the export action
    try {
      await logAuditEvent({
        tableName: "reports",
        recordId: churchId,
        operation: "UPDATE",
        actorId: session.profile.id,
        churchId,
        actorRole: session.appContext.roleId,
        newValues: { entity, rowCount: rows.length },
      });
    } catch (auditError) {
      console.error("Failed to log custom report export audit event:", auditError);
    }

    return new Response(csvData, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=custom-${entity}-report.csv`,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[custom-reports] Failed to execute custom query report:", msg);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
