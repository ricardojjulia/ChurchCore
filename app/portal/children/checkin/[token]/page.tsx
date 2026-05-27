import { ChildrenSessionPage } from "@/components/portal/children-session-page";
import {
  evaluatePublicCcmSessionAvailability,
  getPublicCcmSessionByToken,
} from "@/lib/ccm-public-data";
import { hasTenantBackendEnv } from "@/lib/supabase/tenant";
import { hasTenantDbUrl } from "@/lib/supabase/config";

export default async function PortalChildrenCheckinSessionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!hasTenantBackendEnv() && !hasTenantDbUrl()) {
    return (
      <ChildrenSessionPage
        mode="checkin"
        record={null}
        availability={{
          state: "no-backend",
          title: "Children session preview unavailable",
          detail:
            "Children session links require tenant backend data and are not available in preview-only mode.",
        }}
      />
    );
  }

  const record = await getPublicCcmSessionByToken(token);
  const availability = evaluatePublicCcmSessionAvailability(record, "checkin");

  return <ChildrenSessionPage mode="checkin" record={record} availability={availability} />;
}
