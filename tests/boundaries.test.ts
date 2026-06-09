import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * lib/graph must stay pure: no DOM, no network, no framework, no runtime
 * builtins. This is the architectural contract that keeps layout
 * unit-testable and lets the phase-2 zero-native shell reuse it
 * (docs/ARCHITECTURE.md "Module boundaries to preserve").
 */

const FORBIDDEN_IMPORT = /^(react|react-dom|next)(\/|$)|^(node|bun):|^@\/(app|components)\//;
const IMPORT_SPECIFIERS = /(?:from\s+|import\s+|require\()\s*["']([^"']+)["']/g;

describe("module boundaries", () => {
  test("lib/graph imports nothing impure", async () => {
    const glob = new Glob("lib/graph/**/*.{ts,tsx}");
    const violations: string[] = [];
    let filesChecked = 0;

    for await (const path of glob.scan(".")) {
      filesChecked++;
      const source = await Bun.file(path).text();
      for (const match of source.matchAll(IMPORT_SPECIFIERS)) {
        const specifier = match[1];
        if (specifier !== undefined && FORBIDDEN_IMPORT.test(specifier)) {
          violations.push(`${path} imports "${specifier}"`);
        }
      }
    }

    expect(filesChecked).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });
});
