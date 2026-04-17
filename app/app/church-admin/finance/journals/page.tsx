import { redirect } from "next/navigation";

import { FinanceJournalWorkspace } from "@/components/application/finance-journal-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getFinanceJournals } from "@/lib/finance-data";

export default async function FinanceJournalsPage() {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const journals = await getFinanceJournals(session);
  return <FinanceJournalWorkspace session={session} journals={journals} />;
}
