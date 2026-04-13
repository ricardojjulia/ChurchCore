import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ChurchForge",
    short_name: "ChurchForge",
    description:
      "Your church portal — events, ministries, directory, and profile in one place.",
    start_url: "/portal",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbfcfe",
    theme_color: "#1a56db",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
