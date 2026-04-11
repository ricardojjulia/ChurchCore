import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";

export default async function WorkspaceIndexPage() {
  const session = await requireSession("/workspace");

  redirect(session.homePath);
}
