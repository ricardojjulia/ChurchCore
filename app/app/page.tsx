import { redirect } from "next/navigation";

import { requireChurchSession } from "@/lib/auth";

export default async function ChurchAppIndexPage() {
  const session = await requireChurchSession("/app");

  redirect(session.homePath);
}
