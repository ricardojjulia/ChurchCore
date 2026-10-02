import type { Metadata } from "next";
import { cookies } from "next/headers";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

import { I18nProvider } from "@/components/i18n-provider";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { ThemeProvider } from "@/components/theme-provider";
import { DemoSessionProvider } from "@/lib/demo/context";
import { DemoErrorBoundary } from "@/components/demo/demo-error-boundary";
import { FeedbackButton } from "@/components/demo/feedback-button";
import { localeCookieName, normalizeLocale } from "@/lib/i18n";
import { siteConfig } from "@/lib/site";

import "./globals.css";

// Inter, the ChurchCore design system's face (ADR 0026).
const sans = localFont({
  src: "./fonts/inter-latin-var.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});

const serif = localFont({
  src: "./fonts/fraunces-latin-var.woff2",
  variable: "--font-fraunces",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: siteConfig.name,
  description: siteConfig.description,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ChurchCore",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(localeCookieName)?.value);

  return (
    <html
      lang={locale}
      // Dark-first (ADR 0026): rendered dark on the server, so there's no
      // light flash before the theme loads.
      suppressHydrationWarning
      data-mantine-color-scheme="dark"
      className={`${sans.variable} ${serif.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        <ServiceWorkerRegistration />
        <ThemeProvider>
          <DemoSessionProvider>
            <DemoErrorBoundary>
              <I18nProvider locale={locale}>{children}</I18nProvider>
              <FeedbackButton />
            </DemoErrorBoundary>
          </DemoSessionProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
