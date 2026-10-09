import type { Metadata } from "next";

// The family check-in kiosk (G2.2) has its own minimal layout: no app shell, no
// navigation, and no 15-minute SessionTimeoutWrapper (inactivity returns the
// kiosk to its start screen instead of signing the admin out). The root layout
// already provides the Mantine, theme and i18n providers.
export const metadata: Metadata = {
  title: "Children's check-in",
  robots: { index: false, follow: false },
};

export default function KioskLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
