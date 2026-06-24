/*
 * Dev screenshot helper for eyeballing layout against the running dev server.
 *
 * Usage:
 *   bun run shot <path> [size] [name]
 *     path  route to capture, e.g. "/", "/demo", "/repo/acme/widgets"
 *     size  "phone" (390x844, default) | "laptop" (1440x900) | "WxH"
 *     name  output basename (default: derived from path+size)
 *
 *   bun run shot <path> [size] --full      full-page capture
 *
 * Writes PNGs to /tmp/chronos-shots/ and prints the absolute path plus the
 * main-region scroll metrics (so overflow is obvious without opening the file).
 * Capture-only: it never mutates the app. Base URL defaults to the dev server
 * (http://localhost:3005); override with CHRONOS_BASE.
 */

import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const OUT_DIR = "/tmp/chronos-shots";
const BASE = process.env.CHRONOS_BASE ?? "http://localhost:3005";

const SIZES = {
  phone: { width: 390, height: 844 },
  laptop: { width: 1440, height: 900 },
};

const args = process.argv.slice(2).filter((a) => a !== "--");
const fullPage = args.includes("--full");
const positional = args.filter((a) => !a.startsWith("--"));
const [path = "/", sizeArg = "phone", nameArg] = positional;

function parseSize(s) {
  if (SIZES[s]) return SIZES[s];
  const m = /^(\d+)x(\d+)$/.exec(s);
  if (m) return { width: Number(m[1]), height: Number(m[2]) };
  console.error(`Unknown size "${s}". Use phone | laptop | WxH.`);
  process.exit(1);
}

const viewport = parseSize(sizeArg);
const slug = path.replace(/^\/+|\/+$/g, "").replace(/[^\w.-]+/g, "-") || "home";
const name = (nameArg ?? `${slug}-${sizeArg}`).replace(/\.png$/, "");
const outPath = `${OUT_DIR}/${name}.png`;

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: outPath, fullPage });

  const metrics = await page.evaluate(() => {
    const main = document.querySelector("main");
    const de = document.documentElement;
    return {
      status: undefined,
      docOverflowX: de.scrollWidth - de.clientWidth,
      main: main ? { scrollH: main.scrollHeight, clientH: main.clientHeight } : null,
    };
  });
  console.log(`saved ${outPath}`);
  console.log(`http ${res?.status() ?? "?"}  viewport ${viewport.width}x${viewport.height}`);
  console.log(
    `docOverflowX ${metrics.docOverflowX}` +
      (metrics.main
        ? `  main ${metrics.main.scrollH}/${metrics.main.clientH}` +
          (metrics.main.scrollH > metrics.main.clientH ? " (SCROLLS)" : "")
        : ""),
  );
} finally {
  await browser.close();
}
