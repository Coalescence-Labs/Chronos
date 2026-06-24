import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Sitemap (COA-126): only the stable, public marketing routes. The dynamic
 * /repo/* space is deliberately excluded — it's noindex/disallowed (privacy +
 * rate-limit budget), and enumerating repos here would defeat that.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/demo`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
  ];
}
