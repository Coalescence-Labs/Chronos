import { describe, expect, test } from "bun:test";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { metadata as styleguideMetadata } from "@/app/styleguide/layout";
import { repoMetadata } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

/**
 * SEO / indexing policy (COA-126). The privacy-critical invariant: the dynamic
 * /repo/* route is never indexed, never crawlable, and never shares a repo
 * identifier — while the static marketing surface is indexable.
 */

describe("repo route metadata", () => {
  const meta = repoMetadata("torvalds", "linux");

  test("is noindex + nofollow (privacy + crawl-budget)", () => {
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  test("shares no repo identifier — no openGraph/twitter override, generic inherit", () => {
    // Inherits the root generic card; nothing repo-specific is emitted to share.
    expect(meta.openGraph).toBeUndefined();
    expect(meta.twitter).toBeUndefined();
    expect(meta.alternates).toBeUndefined();
    // The only place owner/repo appears is the user's own tab title.
    expect(meta.title).toBe("torvalds/linux");
  });
});

describe("styleguide is internal-only", () => {
  test("noindex", () => {
    expect(styleguideMetadata.robots).toEqual({ index: false, follow: false });
  });
});

describe("robots policy", () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules[0]! : result.rules!;

  test("disallows /repo/, /styleguide, /api/ (privacy + budget)", () => {
    expect(rules.disallow).toContain("/repo/");
    expect(rules.disallow).toContain("/styleguide");
    expect(rules.disallow).toContain("/api/");
  });

  test("allows the marketing surface and points to the sitemap", () => {
    expect(rules.allow).toEqual(expect.arrayContaining(["/", "/demo"]));
    expect(result.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});

describe("sitemap", () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);

  test("lists only the stable public routes", () => {
    expect(urls).toEqual([`${SITE_URL}/`, `${SITE_URL}/demo`]);
  });

  test("never enumerates a /repo/* route", () => {
    expect(urls.some((u) => u.includes("/repo/"))).toBe(false);
  });
});
