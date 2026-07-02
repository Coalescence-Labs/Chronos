import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Crawl policy (COA-126). Only the static marketing surface is crawlable.
 *
 * /repo/* is disallowed for two reasons that both matter: (1) privacy —
 * indexing would leak which repos people viewed (docs/PRIVACY.md), and
 * (2) budget — a crawler hitting /repo/* triggers live BFF→GitHub calls, so
 * disallowing it protects the rate-limit budget (COA-74). /api/ and the
 * internal /styleguide are likewise off-limits.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/demo"],
      disallow: ["/repo/", "/styleguide", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
