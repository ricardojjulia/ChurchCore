import { notFound, redirect } from "next/navigation";

import { ChurchAdminImportReport } from "@/components/application/church-admin-import-report";
import { requireChurchSession } from "@/lib/auth";
import { IMPORT_PAGE_SIZE } from "@/lib/import-report-csv";
import { computeImportReconciliation } from "@/lib/import-reconciliation";

// Reconciling a 5,000-row import re-reads every written record (about 0.75 s measured).
export const maxDuration = 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pageParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function slice<T>(items: T[], page: number): T[] {
  const pageCount = Math.max(1, Math.ceil(items.length / IMPORT_PAGE_SIZE));
  const safe = Math.min(page, pageCount);
  return items.slice((safe - 1) * IMPORT_PAGE_SIZE, safe * IMPORT_PAGE_SIZE);
}

export default async function ChurchAdminImportReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { batchId } = await params;
  const query = await searchParams;
  const session = await requireChurchSession(`/app/church-admin/imports/${batchId}`);

  if (session.appContext.roleId !== "church-admin") {
    redirect(session.homePath);
  }
  if (!UUID_PATTERN.test(batchId)) {
    notFound();
  }

  const result = await computeImportReconciliation(session.appContext.church.id, batchId);
  if (!result) {
    notFound();
  }

  const lastPage = (total: number) => Math.max(1, Math.ceil(total / IMPORT_PAGE_SIZE));

  if (result.state !== "ready") {
    return (
      <ChurchAdminImportReport
        session={session}
        report={result}
        paging={{ mp: 1, cp: 1, sp: 1, mismatchTotal: 0, changedTotal: 0, skippedTotal: 0 }}
        skippedRejected={[]}
      />
    );
  }

  const skippedRejected = [...result.skipped, ...result.rejected].sort((a, b) => a.rowNumber - b.rowNumber);
  const paging = {
    mp: Math.min(pageParam(query.mp), lastPage(result.mismatches.length)),
    cp: Math.min(pageParam(query.cp), lastPage(result.changedSinceImport.length)),
    sp: Math.min(pageParam(query.sp), lastPage(skippedRejected.length)),
    mismatchTotal: result.mismatches.length,
    changedTotal: result.changedSinceImport.length,
    skippedTotal: skippedRejected.length,
  };

  return (
    <ChurchAdminImportReport
      session={session}
      report={{
        ...result,
        // Only the current page crosses to the browser.
        skipped: [],
        rejected: [],
        mismatches: slice(result.mismatches, paging.mp),
        changedSinceImport: slice(result.changedSinceImport, paging.cp),
      }}
      paging={paging}
      skippedRejected={slice(skippedRejected, paging.sp)}
    />
  );
}
