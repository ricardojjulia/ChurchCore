import { redirect } from "next/navigation";

import { createTenantServerClient } from "@/lib/supabase/tenant";

/**
 * Server-side gate for /hq, ChurchCore's internal project dashboard: platform
 * admins only (S5, owner decision 2026-09-30). The hq_* tables' RLS allows only
 * platform admins too; this keeps everyone else from reaching the shell.
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

  const { data: isPlatformAdmin, error } = await supabase.rpc("is_platform_admin");

  if (error || isPlatformAdmin !== true) {
    redirect("/app");
  }

  return <>{children}</>;
}
