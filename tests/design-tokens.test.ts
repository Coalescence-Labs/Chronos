import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * COA-69 acceptance: tokens are the single source of visual truth.
 * Components consume CSS variables only — no hard-coded colors anywhere
 * under components/ or in page-level styles.
 */

const TOKEN_GROUPS: Record<string, string[]> = {
  color: ["--bg:", "--bg-elevated:", "--bg-raised:", "--fg:", "--fg-muted:", "--accent:", "--accent-2:", "--danger:", "--success:", "--warning:"],
  type: ["--font-sans:", "--text-xs:", "--text-base:", "--text-3xl:", "--leading-base:", "--tracking-tight:"],
  spacing: ["--space-1:", "--space-4:", "--space-8:"],
  radii: ["--radius-sm:", "--radius:", "--radius-lg:", "--radius-full:"],
  elevation: ["--shadow-1:", "--shadow-2:", "--shadow-3:"],
  motion: ["--duration-fast:", "--duration-base:", "--duration-slow:", "--ease-out:", "--ease-spring:"],
  interaction: ["--touch-target:", "--focus-ring:"],
};

const HARDCODED_COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/;

describe("design tokens", () => {
  test("globals.css defines every token group", async () => {
    const css = await Bun.file("app/globals.css").text();
    for (const [group, tokens] of Object.entries(TOKEN_GROUPS)) {
      for (const token of tokens) {
        expect(css, `missing ${group} token ${token}`).toContain(token);
      }
    }
  });

  test("reduced motion is honored globally", async () => {
    const css = await Bun.file("app/globals.css").text();
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation-duration: 0.01ms !important");
    expect(css).toContain("transition-duration: 0.01ms !important");
  });

  test("focus-visible styling exists", async () => {
    const css = await Bun.file("app/globals.css").text();
    expect(css).toContain(":focus-visible");
  });

  test("components and page styles contain no hard-coded colors", async () => {
    const glob = new Glob("**/*.{tsx,ts,css}");
    // app/opengraph-image.tsx renders via next/og ImageResponse — outside the
    // DOM, with no stylesheet/CSS variables in scope — so the branded social
    // card carries literal hex by necessity (COA-126). The CSS/DOM surface
    // still must use tokens; that's what this scan enforces everywhere else.
    const exempt = new Set(["app/globals.css", "app/opengraph-image.tsx"]);
    const paths = [
      ...(await Array.fromAsync(glob.scan("components"))).map((p) => `components/${p}`),
      ...(await Array.fromAsync(glob.scan("app"))).map((p) => `app/${p}`),
    ].filter((p) => !exempt.has(p) && !p.startsWith("app/api/"));

    const violations: string[] = [];
    for (const path of paths) {
      const source = await Bun.file(path).text();
      for (const [index, line] of source.split("\n").entries()) {
        if (HARDCODED_COLOR.test(line)) violations.push(`${path}:${index + 1} ${line.trim()}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test("buttons and touch controls meet the 44px target", async () => {
    const buttonCss = await Bun.file("components/ui/button.module.css").text();
    expect(buttonCss).toContain("min-height: var(--touch-target)");
    const inspectionCss = await Bun.file("components/ui/inspection.module.css").text();
    expect(inspectionCss).toContain("min-height: var(--touch-target)");
  });
});
