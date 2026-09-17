import { redirect } from "next/navigation";

import { createTenantServerClient } from "@/lib/supabase/tenant";

/**
 * Server-side gate for /app/hq. The page itself is a client component that
 * fetches hq_tasks/hq_risks/hq_decisions/hq_sessions under RLS scoped to
 * current_user_role() — RLS already blocks "member" reads, but unauthenticated
 * or member-role requests should never reach the dashboard shell at all.
 */
export default async function HqLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createTenantServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/sign-in");
  }

  const { data: role, error } = await supabase.rpc("current_user_role");

  if (error || !role || role === "member") {
    redirect("/app");
  }

  return <>{children}</>;
}
