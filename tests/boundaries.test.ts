import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { dirname, relative, resolve } from "node:path";

/**
 * lib/graph must stay pure: no DOM, no network, no framework, no runtime
 * builtins. This is the architectural contract that keeps layout
 * unit-testable and lets the phase-2 zero-native shell reuse it
 * (docs/ARCHITECTURE.md "Module boundaries to preserve").
 */

const FORBIDDEN_IMPORT = /^(react|react-dom|next)(\/|$)|^(node|bun):|^@\/(app|components)\//;
const IMPORT_SPECIFIERS = /(?:from\s+|import\s+|require\()\s*["']([^"']+)["']/g;
const SERVER_IMPORT = /^(node|bun):|^server-only$/;
const LOCAL_IMPORT = /^(@\/|\.)/;

function directive(source: string): "client" | "server" | null {
  const match = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use (client|server)["']/.exec(source);
  return (match?.[1] as "client" | "server" | undefined) ?? null;
}

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

  /**
   * Bundlers polyfill node builtins for the browser without a warning, and
   * `server-only` only fails in `next build`. Stops at "use server" modules:
   * the client gets a network stub for those, not their code.
   */
  test("client components reach no server-only or node builtin modules", async () => {
    const queue: string[] = [];
    for await (const path of new Glob("{app,components,lib}/**/*.{ts,tsx}").scan(".")) {
      if (directive(await Bun.file(path).text()) === "client") queue.push(path);
    }
    const seen = new Set(queue);
    const violations: string[] = [];
    const transpilers = { ts: new Bun.Transpiler({ loader: "ts" }), tsx: new Bun.Transpiler({ loader: "tsx" }) };

    expect(queue.length).toBeGreaterThan(0);
    while (queue.length > 0) {
      const path = queue.shift()!;
      const source = await Bun.file(path).text();
      if (directive(source) === "server") continue;
      const transpiler = path.endsWith(".tsx") ? transpilers.tsx : transpilers.ts;
      for (const { path: specifier } of transpiler.scanImports(source)) {
        if (SERVER_IMPORT.test(specifier)) {
          violations.push(`${path} imports "${specifier}"`);
        } else if (LOCAL_IMPORT.test(specifier)) {
          const resolved = relative(".", Bun.resolveSync(specifier, resolve(dirname(path))));
          if (/\.tsx?$/.test(resolved) && !seen.has(resolved)) {
            seen.add(resolved);
            queue.push(resolved);
          }
        }
      }
    }

    expect(seen.has("lib/agent/starters/client-cache.ts")).toBe(true);
    expect(violations).toEqual([]);
  });
});
