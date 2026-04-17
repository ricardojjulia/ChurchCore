import type { Metadata } from "next";
import localFont from "next/font/local";
import { mantineHtmlProps } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { ThemeProvider } from "@/components/theme-provider";
import { siteConfig } from "@/lib/site";

import "./globals.css";

const sans = localFont({
  src: "./fonts/manrope-latin-var.woff2",
  variable: "--font-manrope",
  display: "swap",
  weight: "200 800",
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
    statusBarStyle: "default",
    title: "ChurchForge",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      {...mantineHtmlProps}
      className={`${sans.variable} ${serif.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        <ServiceWorkerRegistration />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
