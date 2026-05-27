import { redirect } from "next/navigation";

import { FinanceJournalWorkspace } from "@/components/application/finance-journal-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getFinanceJournals } from "@/lib/finance-data";
import { hasTenantBackendEnv } from "@/lib/supabase/tenant";

export default async function FinanceJournalsPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ view?: string }>;
} = {}) {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);
  const { view } = await searchParams;

  const journals = await getFinanceJournals(session);
  return (
    <FinanceJournalWorkspace
      session={session}
      journals={journals}
      readinessView={view === "drafts"}
      dataSource={hasTenantBackendEnv() && session.source === "supabase" ? "live" : "preview"}
    />
  );
}
