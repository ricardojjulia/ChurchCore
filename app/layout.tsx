import type { Metadata } from "next";
import {
  ColorSchemeScript,
  mantineHtmlProps,
} from "@mantine/core";
import { Fraunces, Manrope } from "next/font/google";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { ThemeProvider } from "@/components/theme-provider";
import { siteConfig } from "@/lib/site";

import "./globals.css";

const sans = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const serif = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
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
      <head>
        <ColorSchemeScript forceColorScheme="light" />
      </head>
      <body className="min-h-full bg-background font-sans text-foreground">
        <ServiceWorkerRegistration />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
