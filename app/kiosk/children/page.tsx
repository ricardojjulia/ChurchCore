import { CcmSelfCheckinKiosk } from "@/components/application/ccm-self-checkin-kiosk";
import { requireKioskSession } from "@/lib/ccm-kiosk-core";
import { resolveKioskIdleMs } from "@/lib/kiosk-idle";

// Always rendered per request: the cc_kiosk cookie and the admin's session decide
// what shows. next.config.ts also sends Cache-Control: no-store for /kiosk.
export const dynamic = "force-dynamic";

export default async function KioskChildrenPage() {
  const idleMs = resolveKioskIdleMs({
    NODE_ENV: process.env.NODE_ENV,
    KIOSK_IDLE_MS_OVERRIDE: process.env.KIOSK_IDLE_MS_OVERRIDE,
  });

  let locked = false;
  try {
    await requireKioskSession();
  } catch {
    // No kiosk cookie, an ended or expired kiosk, or the admin's own session is
    // gone: the locked screen, with no family data and no way into the app.
    locked = true;
  }

  return <CcmSelfCheckinKiosk idleMs={idleMs} locked={locked} />;
}
