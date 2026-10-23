import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import manifest from "@/app/manifest";

/**
 * PWA shell (COA-69): installable manifest + offline app shell whose cache
 * can never become a durable store of repo data (docs/PRIVACY.md, open
 * decision #6). Full installability is gated manually via Lighthouse — see
 * the PR checklist.
 */

function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  expect(view.getUint32(0)).toBe(0x89504e47); // PNG signature
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe("pwa manifest", () => {
  const m = manifest();

  test("is installable: name, standalone display, start_url, theme", () => {
    expect(m.name).toContain("Chronos");
    expect(m.short_name).toBe("Chronos");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.theme_color).toBe(m.background_color);
  });

  test("declares 192 + 512 icons including a maskable one", () => {
    const sizes = (m.icons ?? []).map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect((m.icons ?? []).some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  test("every declared icon exists with the declared dimensions", async () => {
    for (const icon of m.icons ?? []) {
      const bytes = new Uint8Array(await Bun.file(`public${icon.src}`).arrayBuffer());
      const [w, h] = (icon.sizes ?? "0x0").split("x").map(Number);
      expect(pngSize(bytes)).toEqual({ width: w!, height: h! });
    }
  });

  test("manifest icons are Chronos brand paths under /icons, never GitHub/octocat", () => {
    for (const icon of m.icons ?? []) {
      expect(icon.src).toMatch(/^\/icons\/icon-/);
      expect(icon.src.toLowerCase()).not.toMatch(/octocat|github|gh[-_]?logo/);
    }
  });
});

describe("site brand icons", () => {
  test("favicon.ico + apple-touch + svg mark exist as Chronos assets", async () => {
    const favicon = new Uint8Array(await Bun.file("app/favicon.ico").arrayBuffer());
    expect(favicon.byteLength).toBeGreaterThan(100);
    // ICO: reserved=0, type=1 (icon)
    expect(favicon[0]).toBe(0);
    expect(favicon[1]).toBe(0);
    expect(favicon[2]).toBe(1);
    expect(favicon[3]).toBe(0);

    const apple = new Uint8Array(await Bun.file("app/apple-icon.png").arrayBuffer());
    expect(pngSize(apple)).toEqual({ width: 180, height: 180 });

    const mark = await Bun.file("app/icon.svg").text();
    expect(mark).toContain("#7c9cff"); // Chronos accent
    expect(mark).toContain("#0a0c10"); // Chronos bg
    expect(mark.toLowerCase()).not.toMatch(/octocat|github/);
  });

  test("no public icon asset filename suggests GitHub brand", async () => {
    const names = await readdir("public/icons");
    for (const name of names) {
      expect(name.toLowerCase()).not.toMatch(/octocat|github|gh[-_]?logo/);
    }
  });
});

describe("service worker privacy posture", () => {
  test("sw.js never caches /api responses and only caches the allowlisted shell", async () => {
    const source = await Bun.file("public/sw.js").text();
    // /api short-circuits before any cache logic.
    expect(source).toContain('url.pathname.startsWith("/api/")');
    expect(source).toMatch(/startsWith\("\/api\/"\)\)\s*return;/);
    // Caching is gated to the shell + hashed static allowlist — anything else
    // (notably /repo/* navigations, which would reveal a viewed repo) is
    // network-only and never written to the cache.
    expect(source).toContain("SHELL_PATHS");
    expect(source).toContain("STATIC_PREFIXES");
    expect(source).toMatch(/if \(!isStatic && !isShell\) return;/);
    // Cache writes happen in exactly one place (the bounded helper).
    expect(source.split("cache.put").length - 1).toBe(1);
  });

  test("registration is production-only and silent", async () => {
    const source = await Bun.file("components/pwa/ServiceWorkerRegistrar.tsx").text();
    expect(source).toContain('process.env.NODE_ENV !== "production"');
    expect(source).not.toContain("console.");
  });
});
