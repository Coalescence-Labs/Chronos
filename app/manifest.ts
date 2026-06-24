import type { MetadataRoute } from "next";
import { CHROME_BG } from "@/lib/theme";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Chronos — git history at a glance",
    short_name: "Chronos",
    description:
      "A beautiful, fast git branch-graph visualizer. High information density, low cognitive load.",
    lang: "en",
    dir: "ltr",
    categories: ["developer", "productivity", "utilities"],
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: CHROME_BG,
    theme_color: CHROME_BG,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
