import { NextResponse } from "next/server";

import { requireChurchSession } from "@/lib/auth";
import { logAuditEvent } from "@/lib/actions/audit";
import { createTenantServerClient } from "@/lib/supabase/tenant";

// Prefix cells that start with =, +, -, @, tab, or CR with a single quote so
// spreadsheet apps (Excel/Sheets/LibreOffice) treat them as text rather than
// live formulas -- a standard CSV-export mitigation for formula injection.
// User-controlled fields (names, emails, descriptions) are exported here
// unsanitized otherwise.
const FORMULA_INJECTION_PREFIX = /^[=+\-@\t\r]/;

export function neutralizeFormulaInjection(value: string): string {
  return FORMULA_INJECTION_PREFIX.test(value) ? `'${value}` : value;
}

// `columns` gives the header row when there are no rows, so an empty export
// is still a valid CSV with its headers rather than a 0-byte file.
export function jsonToCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return columns?.length ? columns.join(",") : "";
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

type ExportEntity = "people" | "giving" | "events";

// Each export: the table, its columns, and its sort. Read through the
// caller's own Supabase client, so RLS applies (S3, Council Review 20): the
// old direct Postgres read bypassed it, needed a tenant DB URL production
// doesn't have, and asked for events columns that don't exist.
const EXPORTS: Record<
  ExportEntity,
  {
    table: string;
    columns: string;
    orderBy: string;
    ascending: boolean;
    skipMerged?: boolean;
    mask?: (row: Record<string, unknown>) => Record<string, unknown>;
  }
> = {
  people: {
    table: "profiles",
    columns: "id, full_name, email, phone, role, membership_status, created_at",
    orderBy: "full_name",
    ascending: true,
    // A merged duplicate is a tombstone pointing at the kept profile.
    skipMerged: true,
  },
  giving: {
    table: "donations",
    columns: "id, donor_name, donor_email, is_anonymous, amount_cents, currency, fund_designation, status, created_at",
    orderBy: "created_at",
    ascending: false,
    // Every giving screen shows an anonymous gift's donor as "Anonymous",
    // even to church admins; the export does the same (Council Review 30,
    // owner decision 2026-10-01).
    mask: (row) => (row.is_anonymous ? { ...row, donor_name: "Anonymous", donor_email: null } : row),
  },
  events: {
    table: "events",
    columns: "id, title, description, starts_at, ends_at, category, created_at",
    orderBy: "starts_at",
    ascending: false,
  },
};

// Supabase returns at most 1,000 rows per request; read every page so a large
// church's export isn't silently cut short.
const PAGE_SIZE = 1000;

function isExportEntity(value: string): value is ExportEntity {
  return Object.prototype.hasOwnProperty.call(EXPORTS, value);
}

export async function GET(request: Request) {
  // Outside the try: requireChurchSession redirects a signed-out caller to
  // /sign-in by throwing, and the catch below used to turn that into a 500.
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
  if (!isExportEntity(entity)) {
    return NextResponse.json({ error: "Invalid entity type" }, { status: 400 });
  }

  const churchId = session.appContext.church.id;
  const spec = EXPORTS[entity];

  try {
    const supabase = await createTenantServerClient();
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase.from(spec.table).select(spec.columns).eq("church_id", churchId);
      if (spec.skipMerged) {
        query = query.is("merged_at", null);
      }
      const { data, error } = await query
        .order(spec.orderBy, { ascending: spec.ascending })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        throw new Error(error.message);
      }
      const page = (data ?? []) as unknown as Record<string, unknown>[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    const exported = spec.mask ? rows.map(spec.mask) : rows;
    const csvData = jsonToCsv(exported, spec.columns.split(", "));

    // Audit log the export action
    try {
      await logAuditEvent({
        tableName: "reports",
        recordId: churchId,
        operation: "UPDATE",
        actorId: session.userId,
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
