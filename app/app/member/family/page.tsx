import { redirect } from "next/navigation";

import { MemberFamilyWorkspace } from "@/components/application/member-family-workspace";
import { requireChurchSession } from "@/lib/auth";
import { getMyFamilyCheckinCodeAction } from "@/app/app/family-checkin-code-actions";
import { FAMILY_CHECKIN_CODE_PATTERN } from "@/lib/family-checkin-code";
import QRCode from "qrcode";
import { getMemberPortalData } from "@/lib/member-portal-data";

export default async function MemberFamilyPage() {
  const session = await requireChurchSession("/app/member/family");

  if (session.appContext.roleId !== "member") {
    redirect(session.homePath);
  }

  const data = await getMemberPortalData(session);

  // The family's children's check-in code and its QR (G2.2), made on the server.
  // A failure here must not take the Family page down: the card shows a notice.
  let checkinCode: string | null = null;
  let checkinQr: string | null = null;
  let checkinUnavailable = false;
  try {
    const result = await getMyFamilyCheckinCodeAction();
    if (result.status === "ok" && FAMILY_CHECKIN_CODE_PATTERN.test(result.code)) {
      checkinCode = result.code;
      checkinQr = await QRCode.toDataURL(result.code, { margin: 2, scale: 8, errorCorrectionLevel: "M" });
    } else if (result.status === "error") {
      checkinUnavailable = true;
    }
  } catch {
    checkinUnavailable = true;
  }

  return (
    <MemberFamilyWorkspace
      session={session}
      data={data}
      checkinCode={checkinCode}
      checkinQr={checkinQr}
      checkinUnavailable={checkinUnavailable}
    />
  );
}
