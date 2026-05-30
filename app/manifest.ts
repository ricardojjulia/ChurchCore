import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ChurchCore",
    short_name: "ChurchCore",
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
