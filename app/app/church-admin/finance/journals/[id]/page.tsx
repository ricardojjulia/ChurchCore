import { redirect } from "next/navigation";

import { FinanceJournalEditor } from "@/components/application/finance-journal-editor";
import { requireChurchSession } from "@/lib/auth";
import { getFinanceAccounts, getFinanceJournalWithLines } from "@/lib/finance-data";

export default async function JournalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const { id } = await params;
  const [accounts, journal] = await Promise.all([
    getFinanceAccounts(session),
    getFinanceJournalWithLines(session, id),
  ]);

  if (!journal) redirect("/app/church-admin/finance/journals");
  return <FinanceJournalEditor session={session} accounts={accounts} journal={journal} />;
}
