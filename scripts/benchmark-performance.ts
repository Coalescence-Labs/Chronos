import { chromium, type Page } from "@playwright/test";
import { cpus } from "node:os";
import { applyGlance, attributeBranches, layoutGraph } from "../lib/graph";
import { heavyMerge, linear } from "../tests/fixtures/history";

const origin = new URL(process.env.BENCH_ORIGIN ?? "http://127.0.0.1:3015");
if (origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname)) {
  throw new Error("BENCH_ORIGIN must be a local HTTP production server.");
}
const samples = Number(process.env.BENCH_SAMPLES ?? 5);
if (!Number.isInteger(samples) || samples < 1 || samples > 100) {
  throw new Error("BENCH_SAMPLES must be an integer between 1 and 100.");
}

function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => Math.round(sorted[Math.ceil(sorted.length * p) - 1]! * 10) / 10;
  return { p50: percentile(0.5), p95: percentile(0.95), max: percentile(1) };
}

const branchHeavy = heavyMerge(2_500);
branchHeavy.refs = [
  { name: "HEAD", type: "head", sha: "t1250" },
  { name: "main", type: "branch", sha: "t1250" },
  { name: "develop", type: "branch", sha: "t0" },
  ...Array.from({ length: 1_000 }, (_, i) => ({ name: `feature/${i}`, type: "branch" as const, sha: `f${i}` })),
];
for (const commit of branchHeavy.commits) {
  if (commit.sha.startsWith("t") && commit.parents.length > 1) {
    commit.message = `Merge feature/${commit.sha.slice(1)} into develop`;
  }
}
const compute = [linear(100), heavyMerge(500), heavyMerge(2_500), heavyMerge(10_000, 6), branchHeavy].map(
  (history) => {
    const measure = () => {
      const start = performance.now();
      applyGlance(history, { hideMergedIntoDefault: true, collapseMergedIntoNonDefault: true }, "main");
      const glanceEnd = performance.now();
      const layout = layoutGraph(history);
      const layoutEnd = performance.now();
      attributeBranches(history, layout);
      const end = performance.now();
      return { glance: glanceEnd - start, layout: layoutEnd - glanceEnd, attribution: end - layoutEnd, total: end - start };
    };
    measure();
    const runs = Array.from({ length: samples }, measure);
    return {
      commits: history.commits.length,
      refs: history.refs.length,
      glanceMs: distribution(runs.map((r) => r.glance)),
      layoutMs: distribution(runs.map((r) => r.layout)),
      attributionMs: distribution(runs.map((r) => r.attribution)),
      totalMs: distribution(runs.map((r) => r.total)),
    };
  },
);

// A local gateway keeps HTTP caching enabled (Playwright routing disables it).
// Only synthetic BFF data is served; no request reaches GitHub or an analytics endpoint.
const history = linear(100);
async function wireResponse(response: Response): Promise<Response> {
  if ([204, 304].includes(response.status)) return new Response(null, response);
  const headers = new Headers(response.headers);
  const body = await response.arrayBuffer();
  headers.delete("content-length");
  headers.delete("content-encoding");
  const compress = /text\/|javascript|json/.test(headers.get("content-type") ?? "");
  if (compress) headers.set("content-encoding", "gzip");
  return new Response(compress ? Bun.gzipSync(new Uint8Array(body)) : body, { status: response.status, headers });
}
const gateway = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/repo") {
      await Bun.sleep(200);
      return wireResponse(Response.json({
        repo: { owner: "acme", repo: "widgets", defaultBranch: "main" },
        history,
        nextPage: null,
      }, { headers: { "Cache-Control": "no-store" } }));
    }
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_vercel/")) {
      return new Response(null, { status: 204 });
    }
    const target = new URL(url.pathname + url.search, origin);
    const headers = new Headers(request.headers);
    headers.set("host", origin.host);
    headers.set("accept-encoding", "identity");
    const upstream = await fetch(target, { method: request.method, headers, redirect: "manual" });
    return wireResponse(upstream);
  },
});

interface Measurement {
  start: number;
  shellMs: number | null;
  graphMs: number | null;
  longTasks: { start: number; duration: number }[];
}
declare global {
  interface Window { __chronosBench: Measurement }
}

async function arm(page: Page, destination: "demo" | "repo" | "home") {
  await page.evaluate((destination) => {
    const result: Measurement = { start: 0, shellMs: null, graphMs: null, longTasks: [] };
    window.__chronosBench = result;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        result.longTasks.push({ start: entry.startTime, duration: entry.duration });
      }
    });
    observer.observe({ type: "longtask" });
    document.addEventListener("click", () => {
      result.start = performance.now();
      const check = () => {
        const graph = document.querySelector('[role="listbox"] [role="option"]');
        const heading = document.querySelector("#main h1");
        const shell = destination === "home"
          ? document.querySelector("#repo-url")
          : destination === "demo"
            ? heading?.textContent?.includes("chronos/demo")
            : /Reading acme\/widgets|Opening repository/.test(document.querySelector('#main [role="status"]')?.textContent ?? "") || heading?.textContent?.includes("acme/widgets");
        const pathMatches = destination === "home" ? location.pathname === "/" : location.pathname === (destination === "demo" ? "/demo" : "/repo/acme/widgets");
        if (pathMatches && shell && result.shellMs === null) {
          // The next frame is an approximation of a painted destination, not a DOM-mount timestamp.
          requestAnimationFrame(() => { result.shellMs = performance.now() - result.start; });
        }
        if (pathMatches && graph && destination !== "home") {
          requestAnimationFrame(() => {
            result.graphMs = performance.now() - result.start;
            observer.disconnect();
          });
          return;
        }
        if (pathMatches && shell && destination === "home") {
          requestAnimationFrame(() => observer.disconnect());
          return;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    }, { once: true, capture: true });
  }, destination);
}

const profiles = [
  { name: "laptop-local", width: 1440, height: 900, latency: 0, down: -1, up: -1, cpu: 1 },
  { name: "phone-slow", width: 390, height: 844, latency: 150, down: 1_600_000 / 8, up: 750_000 / 8, cpu: 4 },
];
const scenarios = (["home-demo-immediate", "home-demo-idle", "home-repo", "home-repo-intent", "demo-home"] as const)
  .filter((scenario) => !process.env.BENCH_SCENARIO || scenario.startsWith(process.env.BENCH_SCENARIO));
if (scenarios.length === 0) throw new Error("BENCH_SCENARIO matches no navigation scenario.");
const browser = await chromium.launch({ headless: true });
const navigation = [];
try {
  for (const profile of profiles) {
    for (const scenario of scenarios) {
      const runs = [];
      for (let i = 0; i < samples; i++) {
        const context = await browser.newContext({
          viewport: { width: profile.width, height: profile.height },
          serviceWorkers: "block",
        });
        try {
          const page = await context.newPage();
          const cdp = await context.newCDPSession(page);
          await cdp.send("Network.enable");
          await cdp.send("Network.setBlockedURLs", { urls: ["https://*", "http://api.github.com/*"] });
          await cdp.send("Network.emulateNetworkConditions", {
            offline: false, latency: profile.latency, downloadThroughput: profile.down, uploadThroughput: profile.up,
          });
          await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
          const fromDemo = scenario === "demo-home";
          const destination = fromDemo ? "home" : scenario.startsWith("home-repo") ? "repo" : "demo";
          const errors: string[] = [];
          page.on("pageerror", (error) => errors.push(error.message));
          page.on("requestfailed", (request) => console.error(`Request failed: ${new URL(request.url()).pathname} ${request.failure()?.errorText}`));
          if (process.env.BENCH_DEBUG) {
            page.on("request", (request) => console.error(`Request: ${new URL(request.url()).pathname}`));
            page.on("response", (response) => console.error(`Response: ${response.status()} ${new URL(response.url()).pathname}`));
          }
          const before = performance.now();
          await page.goto(`${gateway.url.origin}${fromDemo ? "/demo" : "/"}`, { waitUntil: "load" });
          // An interaction confirms hydration without starting a navigation.
          if (profile.width < 700) await page.getByRole("button", { name: /Change theme/ }).click();
          await page.getByRole("radio", { name: "Light theme", exact: true }).click();
          await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
          if (fromDemo) await page.getByRole("listbox").waitFor();
          const coldLoadMs = performance.now() - before;
          if (scenario === "home-demo-idle") await page.waitForLoadState("networkidle");
          if (destination === "repo") await page.getByLabel("Public GitHub repository").fill("acme/widgets");
          if (scenario === "home-repo-intent") {
            await page.getByLabel("Public GitHub repository").press("Tab");
            await page.waitForLoadState("networkidle");
          }
          await arm(page, destination);
          if (destination === "home") await page.getByRole("link", { name: "Chronos", exact: true }).click();
          else if (destination === "repo") await page.getByRole("button", { name: "Visualize" }).click();
          else await page.getByRole("link", { name: "explore the demo repo" }).click();
          await page.waitForFunction((destination) => destination === "home"
            ? window.__chronosBench.shellMs !== null
            : window.__chronosBench.graphMs !== null, destination);
          const result = await page.evaluate(() => {
            const result = window.__chronosBench;
            const end = result.start + (result.graphMs ?? result.shellMs ?? 0);
            const tasks = result.longTasks.filter((task) => task.start >= result.start && task.start < end);
            const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
            const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
            return {
              shellMs: result.shellMs!, graphMs: result.graphMs,
              longestTaskMs: Math.max(0, ...tasks.map((task) => task.duration)),
              transitionBytes: resources.filter((entry) => entry.startTime >= result.start).reduce((total, entry) => total + entry.transferSize, 0),
              coldBytes: navigation.transferSize + resources.filter((entry) => entry.startTime < result.start).reduce((total, entry) => total + entry.transferSize, 0),
              fontBytes: resources.filter((entry) => entry.name.endsWith(".woff2")).reduce((total, entry) => total + entry.encodedBodySize, 0),
              prefetchCompleted: resources.some((entry) => entry.name.includes("/demo?") && entry.responseEnd < result.start),
            };
          });
          if (process.env.BENCH_DEBUG) {
            console.error("Transition resources:", JSON.stringify(await page.evaluate(() => {
              const start = window.__chronosBench.start;
              return (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
                .filter((entry) => entry.responseEnd > start)
                .map((entry) => ({ path: new URL(entry.name).pathname, start: entry.startTime - start, end: entry.responseEnd - start, bytes: entry.transferSize }));
            })));
          }
          if (destination !== "home") {
            // Prove the painted graph is interactive, rather than crediting a placeholder.
            const row = page.getByRole("option").first();
            const box = await row.boundingBox();
            if (!box) throw new Error("First graph row has no visible bounds.");
            await row.click({ position: { x: box.width - 20, y: box.height / 2 } });
            await page.getByRole("complementary").waitFor();
          }
          if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
          runs.push({ ...result, coldLoadMs });
        } finally {
          await context.close();
        }
      }
      navigation.push({
        profile: profile.name, scenario,
        shellMs: distribution(runs.map((r) => r.shellMs)),
        graphMs: scenario === "demo-home" ? null : distribution(runs.map((r) => r.graphMs!)),
        longestTaskMs: distribution(runs.map((r) => r.longestTaskMs)),
        coldLoadMs: distribution(runs.map((r) => r.coldLoadMs)),
        coldBytes: distribution(runs.map((r) => r.coldBytes)),
        transitionBytes: distribution(runs.map((r) => r.transitionBytes)),
        fontBytes: distribution(runs.map((r) => r.fontBytes)),
        prefetchCompletedRuns: runs.filter((r) => r.prefetchCompleted).length,
        runs,
      });
      console.error(`Measured ${profile.name}: ${scenario}`);
    }
  }
  console.log(JSON.stringify({
    measuredAt: new Date().toISOString(), samples, bun: Bun.version, chromium: browser.version(),
    platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model,
    profiles, compute, navigation,
    limitations: "Local production build via buffering gateway with gzip for text/JS/JSON; anonymous auth-disabled session; synthetic 100-commit BFF with fixed 200ms delay; fresh browser context per sample; source page loaded before transition; default prefetch; service workers blocked; rAF paint approximation; graph interaction verified after timing. Pure compute runs in Bun, not CPU-throttled Chromium. Not deployment, upstream, streaming, real-device, or competitor results.",
  }, null, 2));
} finally {
  await browser.close();
  gateway.stop(true);
}
