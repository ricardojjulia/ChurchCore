import { redirect } from "next/navigation";

import { listTemplatesAction } from "@/app/app/communications-actions";
import { CommunicationsComposeClient } from "@/components/application/communications-compose-client";
import { requireChurchSession } from "@/lib/auth";
import { createTenantServerClient } from "@/lib/supabase/tenant";

async function listMinistriesForChurch(churchId: string): Promise<Array<{ id: string; name: string }>> {
  try {
    const supabase = await createTenantServerClient();
    const { data, error } = await supabase
      .from("ministries")
      .select("id, name")
      .eq("church_id", churchId)
      .eq("is_active", true)
      .order("name");

    if (error) return [];
    return (data ?? []) as Array<{ id: string; name: string }>;
  } catch {
    return [];
  }
}

export default async function CommunicationsComposeFromTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const session = await requireChurchSession("/app/communications");

  const role = session.appContext.roleId;
  if (role !== "pastor" && role !== "church-admin" && role !== "secretary") {
    redirect(session.homePath);
  }

  const { templateId } = await params;
  const churchId = session.appContext.church.id;

  const [templatesResult, ministries] = await Promise.all([
    listTemplatesAction(),
    listMinistriesForChurch(churchId),
  ]);

  const templates = templatesResult.ok ? templatesResult.templates : [];
  const initialTemplate = templates.find((t) => t.id === templateId);

  return (
    <CommunicationsComposeClient
      session={session}
      ministries={ministries}
      templates={templates}
      initialTemplate={initialTemplate}
    />
  );
}
