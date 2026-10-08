import { redirect } from "next/navigation";

import { requireChurchSession } from "@/lib/auth";

import { startKioskAction } from "./actions";

// Start page for the family self check-in kiosk (G2.2). Minimal on purpose; the
// frontend builder wraps it in the app shell and adds the copy.
export default async function CcmKioskStartPage() {
  const session = await requireChurchSession("/app/church-admin/children/kiosk");
  if (session.appContext.roleId !== "church-admin") redirect(session.homePath);

  return (
    <main>
      <h1>Kiosk mode</h1>
      <form action={startKioskAction}>
        <label htmlFor="deviceNote">Device name (optional)</label>
        <input id="deviceNote" name="deviceNote" maxLength={80} />
        <button type="submit">Start kiosk mode</button>
      </form>
    </main>
  );
}
