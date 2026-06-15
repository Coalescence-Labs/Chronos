import { describe, expect, test } from "bun:test";
import {
  CHROME_BG,
  CHROME_BG_LIGHT,
  isThemePreference,
  resolveTheme,
  THEME_INIT_SCRIPT,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

/**
 * COA-76: light mode. Three layers under test —
 *   1. the preference model in lib/theme.ts (persistence key, resolution),
 *   2. the pre-paint boot script (no theme flash, dark fallback on failure),
 *   3. the light token block in globals.css (completeness + WCAG AA contrast,
 *      so a palette tweak that washes out text or lanes fails CI).
 */

describe("theme preference model", () => {
  test("storage key is stable (persisted in user browsers)", () => {
    expect(THEME_STORAGE_KEY).toBe("chronos-theme");
  });

  test("offers exactly system, dark, light", () => {
    expect([...THEME_PREFERENCES]).toEqual(["system", "dark", "light"]);
  });

  test("isThemePreference accepts the three states and nothing else", () => {
    for (const value of THEME_PREFERENCES) expect(isThemePreference(value)).toBe(true);
    for (const value of [null, undefined, "", "auto", "LIGHT", 0]) {
      expect(isThemePreference(value)).toBe(false);
    }
  });

  test("explicit preferences ignore the system scheme", () => {
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
  });

  test("system follows prefers-color-scheme", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
  });
});

/** Executes the inline boot script against stubbed browser globals. */
function runInitScript(options: {
  stored?: string | null;
  systemPrefersLight?: boolean;
  storageThrows?: boolean;
}): string | undefined {
  const doc = { documentElement: { dataset: {} as Record<string, string> } };
  const storage = {
    getItem: () => {
      if (options.storageThrows) throw new Error("denied");
      return options.stored ?? null;
    },
  };
  const matchMedia = () => ({ matches: options.systemPrefersLight ?? false });
  new Function("localStorage", "matchMedia", "document", THEME_INIT_SCRIPT)(
    storage,
    matchMedia,
    doc,
  );
  return doc.documentElement.dataset.theme;
}

describe("theme boot script", () => {
  test("applies a stored explicit preference regardless of the OS", () => {
    expect(runInitScript({ stored: "light", systemPrefersLight: false })).toBe("light");
    expect(runInitScript({ stored: "dark", systemPrefersLight: true })).toBe("dark");
  });

  test("resolves system (or missing/garbage values) via prefers-color-scheme", () => {
    expect(runInitScript({ stored: "system", systemPrefersLight: true })).toBe("light");
    expect(runInitScript({ stored: null, systemPrefersLight: false })).toBe("dark");
    expect(runInitScript({ stored: "neon", systemPrefersLight: true })).toBe("light");
  });

  test("fails closed to the dark default when storage is unavailable", () => {
    expect(runInitScript({ storageThrows: true })).toBeUndefined();
  });

  test("is wired into the root layout head and embeds the storage key", async () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
    const layout = await Bun.file("app/layout.tsx").text();
    expect(layout).toContain("THEME_INIT_SCRIPT");
    expect(layout).toContain("dangerouslySetInnerHTML");
    expect(layout).toContain("suppressHydrationWarning");
    expect(layout).toContain("CHROME_BG_LIGHT");
  });
});

/* ---- token blocks ---- */

function parseBlock(css: string, selector: RegExp): Record<string, string> {
  const match = css.match(selector);
  if (!match) throw new Error(`token block not found: ${selector}`);
  const declarations: Record<string, string> = {};
  for (const declaration of match[1]!.split(";")) {
    const parsed = declaration.match(/(--[\w-]+|color-scheme)\s*:\s*([\s\S]+)/);
    if (parsed) declarations[parsed[1]!] = parsed[2]!.trim().replace(/\s+/g, " ");
  }
  return declarations;
}

const css = await Bun.file("app/globals.css").text();
const dark = parseBlock(css, /:root\s*\{([^}]*)\}/);
const light = parseBlock(css, /\[data-theme="light"\]\s*\{([^}]*)\}/);

const HAS_COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;

describe("light theme tokens", () => {
  test("light block opts the UA into light rendering", () => {
    expect(dark["color-scheme"]).toBe("dark");
    expect(light["color-scheme"]).toBe("light");
  });

  test("light block redefines every color-bearing token from :root", () => {
    const colorTokens = Object.keys(dark).filter((name) => HAS_COLOR.test(dark[name]!));
    expect(colorTokens.length).toBeGreaterThanOrEqual(30);
    const missing = colorTokens.filter((name) => light[name] === undefined);
    expect(missing).toEqual([]);
  });

  test("light block introduces no tokens that :root lacks", () => {
    const unknown = Object.keys(light).filter((name) => dark[name] === undefined);
    expect(unknown).toEqual([]);
  });

  test("browser-chrome constants mirror --bg per theme", () => {
    expect(dark["--bg"]).toBe(CHROME_BG);
    expect(light["--bg"]).toBe(CHROME_BG_LIGHT);
  });
});

/* ---- WCAG contrast (relative luminance per WCAG 2.x) ---- */

function luminance(hex: string): number {
  const value = hex.replace("#", "");
  expect(value).toHaveLength(6);
  const channel = (offset: number) => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const LANES = ["--lane-0", "--lane-1", "--lane-2", "--lane-3", "--lane-4", "--lane-5", "--lane-6", "--lane-7"];

// [foreground, background, minimum ratio]: 4.5 = AA body text, 3 = AA large
// text / UI components (lanes, icons, focus ring).
const REQUIREMENTS: Array<[string, string, number]> = [
  ["--fg", "--bg", 4.5],
  ["--fg", "--bg-elevated", 4.5],
  ["--fg", "--bg-raised", 4.5],
  ["--fg-muted", "--bg", 4.5],
  ["--fg-muted", "--bg-raised", 4.5],
  ["--fg-subtle", "--bg", 3],
  ["--fg-subtle", "--bg-raised", 3],
  ["--accent", "--bg", 3],
  ["--accent", "--bg-raised", 3],
  ["--accent-strong", "--bg", 3],
  ["--danger", "--bg", 4.5],
  ["--danger", "--bg-raised", 4.5],
  ["--success", "--bg", 3],
  ["--warning", "--bg", 3],
  ["--on-accent", "--accent", 4.5],
  ["--on-accent", "--accent-2", 4.5],
  ...LANES.flatMap((lane): Array<[string, string, number]> => [
    [lane, "--bg", 3],
    [lane, "--bg-raised", 3],
  ]),
];

describe.each([
  ["dark", dark],
  ["light", light],
] as const)("WCAG contrast — %s theme", (_theme, tokens) => {
  test.each(REQUIREMENTS)("%s on %s ≥ %s:1", (fg, bg, minimum) => {
    const ratio = contrast(tokens[fg]!, tokens[bg]!);
    expect(ratio).toBeGreaterThanOrEqual(minimum);
  });
});
