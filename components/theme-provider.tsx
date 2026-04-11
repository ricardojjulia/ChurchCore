"use client";

import { createTheme, MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";

const theme = createTheme({
  primaryColor: "teal",
  defaultRadius: "md",
  fontFamily: "var(--font-manrope), sans-serif",
  headings: {
    fontFamily: "var(--font-fraunces), serif",
  },
  colors: {
    teal: [
      "#edf8f7",
      "#d7efec",
      "#b0dfda",
      "#86cec6",
      "#62c0b6",
      "#4bb8ad",
      "#3bb4a8",
      "#2a9c90",
      "#1f8b80",
      "#0f776d",
    ],
  },
  components: {
    Button: {
      defaultProps: {
        radius: "xl",
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
