"use client";

import { createTheme, MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";

const theme = createTheme({
  primaryColor: "churchBlue",
  defaultRadius: "lg",
  fontFamily: "var(--font-manrope), sans-serif",
  headings: {
    fontFamily: "var(--font-manrope), sans-serif",
    fontWeight: "700",
  },
  black: "#14213d",
  colors: {
    churchBlue: [
      "#edf4ff",
      "#dbe8ff",
      "#bdd4ff",
      "#93b8ff",
      "#6697ff",
      "#4a80ff",
      "#2563eb",
      "#1d4ed8",
      "#1e40af",
      "#1b357f",
    ],
    slate: [
      "#f6f7f9",
      "#eef2f6",
      "#dde4eb",
      "#c6d1dc",
      "#9fb0c2",
      "#7f93a7",
      "#5c6b7a",
      "#465463",
      "#2d3c4f",
      "#14213d",
    ],
    teal: [
      "#eefbf8",
      "#d5f4ee",
      "#aee8dc",
      "#7ed8c5",
      "#59c8b4",
      "#42bfaa",
      "#31b39f",
      "#219a88",
      "#158777",
      "#0f766e",
    ],
  },
  components: {
    Button: {
      defaultProps: {
        radius: "xl",
        color: "churchBlue",
      },
    },
    Paper: {
      defaultProps: {
        radius: "xl",
      },
    },
    Card: {
      defaultProps: {
        radius: "xl",
      },
    },
    Badge: {
      defaultProps: {
        radius: "sm",
      },
    },
    NavLink: {
      styles: {
        root: {
          borderRadius: 16,
        },
      },
    },
  },
});

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MantineProvider theme={theme} forceColorScheme="light">
      <Notifications position="top-right" />
      {children}
    </MantineProvider>
  );
}
