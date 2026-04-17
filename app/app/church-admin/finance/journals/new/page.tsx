import { redirect } from "next/navigation";

import { FinanceJournalEditor } from "@/components/application/finance-journal-editor";
import { requireChurchSession } from "@/lib/auth";
import { getFinanceAccounts } from "@/lib/finance-data";

export default async function NewJournalPage() {
  const session = await requireChurchSession("/app/church-admin");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  const accounts = await getFinanceAccounts(session);
  return <FinanceJournalEditor session={session} accounts={accounts} journal={null} />;
}
