"use client";

import { createTheme, MantineProvider, type CSSVariablesResolver } from "@mantine/core";
import { Notifications } from "@mantine/notifications";

// The ChurchCore design system (ADR 0026): dark-first slate surfaces, indigo
// primary, Inter, rounded-2xl containers and rounded-xl controls. The spec is
// written in Tailwind terms; ChurchCore keeps Mantine and maps the spec's
// values onto Mantine's theme here, and onto the CSS variables in
// app/globals.css. New screens take colours from the theme or those
// variables, never as hard-coded literals.

/** Tailwind's slate, lightest first (Mantine's palette order). */
const slate = [
  "#f8fafc",
  "#f1f5f9",
  "#e2e8f0",
  "#cbd5e1",
  "#94a3b8",
  "#64748b",
  "#475569",
  "#334155",
  "#1e293b",
  "#0f172a",
] as const;

/**
 * Mantine's dark palette, from the spec's slate roles: text (0), dimmed
 * text (2), borders (4), hover (5), inputs and default buttons (6), surfaces
 * (7: cards, modals, menus), and the page canvas (9). The canvas itself is
 * set on the page body in app/globals.css.
 */
const dark = [
  "#e2e8f0", // slate-200: body text
  "#cbd5e1", // slate-300
  "#94a3b8", // slate-400: dimmed text
  "#64748b", // slate-500
  "#334155", // slate-700: borders
  "#1e293b", // slate-800: hover, dividers
  "#0b1222", // inputs and default buttons, recessed below the surface
  "#0f172a", // slate-900: surfaces
  "#0a1020",
  "#020617", // slate-950: canvas
] as const;

/** Tailwind's indigo: the spec's primary (indigo-600 buttons, indigo-500 ring). */
const indigo = [
  "#eef2ff",
  "#e0e7ff",
  "#c7d2fe",
  "#a5b4fc",
  "#818cf8",
  "#6366f1",
  "#4f46e5",
  "#4338ca",
  "#3730a3",
  "#312e81",
] as const;

const theme = createTheme({
  primaryColor: "indigo",
  primaryShade: { light: 6, dark: 6 },
  defaultRadius: "lg",
  // rounded-md, rounded-lg, rounded-xl (controls), rounded-2xl (containers).
  radius: {
    xs: "0.25rem",
    sm: "0.375rem",
    md: "0.5rem",
    lg: "0.75rem",
    xl: "1rem",
  },
  fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  headings: {
    fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
    fontWeight: "700",
  },
  white: "#ffffff",
  black: "#020617",
  colors: {
    dark: dark as unknown as [string, string, string, string, string, string, string, string, string, string],
    slate: slate as unknown as [string, string, string, string, string, string, string, string, string, string],
    indigo: indigo as unknown as [string, string, string, string, string, string, string, string, string, string],
    // The old primary's name, used across the app as color="churchBlue": now
    // the indigo primary, so those components follow the design system.
    churchBlue: indigo as unknown as [string, string, string, string, string, string, string, string, string, string],
  },
  components: {
    Button: {
      defaultProps: { radius: "lg" },
    },
    Paper: {
      defaultProps: { radius: "xl" },
    },
    Card: {
      defaultProps: { radius: "xl" },
    },
    Modal: {
      defaultProps: { radius: "xl", overlayProps: { backgroundOpacity: 0.8, blur: 4 } },
    },
    Badge: {
      defaultProps: { radius: "xl" },
    },
    Title: {
      // Headings are crisp white and tight-tracked.
      styles: { root: { letterSpacing: "-0.015em" } },
    },
  },
});

// Headings white, body text slate-200, borders slate-800, per the spec.
const resolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {},
  dark: {
    "--mantine-color-text": "#e2e8f0",
    "--mantine-color-body": "#0f172a",
    "--mantine-color-default-border": "#1e293b",
    // slate-400: 6.9:1 on the input background (placeholders must meet 4.5:1 too).
    "--mantine-color-placeholder": "#94a3b8",
    "--mantine-color-anchor": "#818cf8",
  },
});

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={resolver} forceColorScheme="dark">
      <Notifications position="top-right" />
      {children}
    </MantineProvider>
  );
}
