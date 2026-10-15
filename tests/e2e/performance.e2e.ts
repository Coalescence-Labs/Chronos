import { expect, test } from "@playwright/test";
import { demoHistory } from "../../lib/demo/history";
import { applyGlance } from "../../lib/graph";
import { heavyMerge } from "../fixtures/history";

test("broad history stays interactive while the real Glance worker calculates", async ({ page }) => {
  const history = heavyMerge(2_500);
  history.refs = [
    { name: "HEAD", type: "head", sha: "t1250" },
    { name: "main", type: "branch", sha: "t1250" },
    { name: "develop", type: "branch", sha: "t0" },
    ...Array.from({ length: 1_000 }, (_, i) => ({ name: `feature/${i}`, type: "branch" as const, sha: `f${i}` })),
  ];
  for (const commit of history.commits) {
    if (commit.sha.startsWith("t") && commit.parents.length > 1) commit.message = `Merge feature/${commit.sha.slice(1)} into develop`;
  }
  const expected = applyGlance(history, { hideMergedIntoDefault: true, collapseMergedIntoNonDefault: true }, "main");
  await page.route("**/api/repo**", (route) => route.fulfill({ json: {
    repo: { owner: "acme", repo: "widgets", defaultBranch: "main" }, history, nextPage: null,
  } }));
  let workers = 0;
  page.on("worker", () => { workers++; });
  await page.goto("/repo/acme/widgets");
  await expect(page.getByRole("listbox", { name: /5005 commits/ })).toBeVisible();
  expect(workers).toBe(0);
  await page.getByRole("button", { name: "Glance" }).click();
  await expect(page.getByRole("button", { name: "Glance" })).toHaveAttribute("aria-busy", "true");
  await page.getByText("Merge feature/0 into develop", { exact: true }).click();
  await expect(page.getByRole("complementary")).toContainText("Merge feature/0 into develop");
  await expect(page.getByRole("listbox", { name: `Commit graph, ${expected.history.commits.length} commits` })).toBeVisible();
  expect(workers).toBe(1);
});

test("Glance creates no worker until requested and reuses its result", async ({ page }) => {
  const workers: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  await page.goto("/demo");
  await expect(page.getByRole("listbox", { name: /40 commits/ })).toBeVisible();
  expect(workers).toHaveLength(0);
  const glance = page.getByRole("button", { name: "Glance" });
  await glance.click();
  await expect(page.getByRole("listbox", { name: /23 commits/ })).toBeVisible();
  await expect(glance).toHaveAttribute("aria-pressed", "true");
  await expect(glance).toHaveAttribute("aria-busy", "false");
  expect(workers).toHaveLength(1);
  await glance.click();
  await expect(page.getByRole("listbox", { name: /40 commits/ })).toBeVisible();
  await glance.click();
  await expect(page.getByRole("listbox", { name: /23 commits/ })).toBeVisible();
  expect(workers).toHaveLength(1);
});

test("worker failure preserves the full graph and permits a retry", async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    let attempts = 0;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (attempts++ === 0) throw new Error("Worker temporarily unavailable");
        super(url, options);
      }
    };
  });
  await page.goto("/demo");
  const glance = page.getByRole("button", { name: "Glance" });
  await glance.click();
  await expect(page.getByRole("status")).toContainText("couldn't apply Glance");
  await expect(glance).toHaveAttribute("aria-pressed", "false");
  await expect(glance).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("listbox", { name: /40 commits/ })).toBeVisible();
  await page.getByText("Release v0.3.0", { exact: true }).click();
  await expect(page.getByRole("complementary")).toBeVisible();
  await page.getByRole("button", { name: "Close inspector" }).click();
  await glance.click();
  await expect(page.getByRole("listbox", { name: /23 commits/ })).toBeVisible();
});

test("pending Glance can be cancelled and cannot change a later view", async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message: unknown) {
        setTimeout(() => super.postMessage(message), 600);
      }
    };
  });
  await page.goto("/demo");
  const glance = page.getByRole("button", { name: "Glance" });
  await glance.click();
  await expect(glance).toHaveAttribute("aria-busy", "true");
  await expect(glance).toHaveAttribute("aria-pressed", "false");
  await page.getByText("Release v0.3.0", { exact: true }).click();
  await expect(page.getByRole("complementary")).toBeVisible();
  await page.getByRole("button", { name: "Close inspector" }).click();
  await glance.click();
  await expect(glance).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("listbox", { name: /40 commits/ })).toBeVisible();
  // Past the delayed reply: the cancelled result must remain unapplied.
  await page.waitForTimeout(800);
  await expect(page.getByRole("listbox", { name: /40 commits/ })).toBeVisible();
  await glance.click();
  await expect(page.getByRole("listbox", { name: /23 commits/ })).toBeVisible();
});

test("refresh invalidates the worker result for the old history", async ({ page }) => {
  let loads = 0;
  await page.route("**/api/repo**", (route) => {
    loads++;
    const history = loads === 1 ? demoHistory() : {
      commits: [{ sha: "new-tip", parents: [], author: "Ada", date: "2026-10-13T12:00:00Z", message: "Rewritten history" }],
      refs: [{ name: "main", type: "branch", sha: "new-tip" }],
    };
    return route.fulfill({ json: { repo: { owner: "acme", repo: "widgets", defaultBranch: "main" }, history, nextPage: null } });
  });
  await page.goto("/repo/acme/widgets");
  const glance = page.getByRole("button", { name: "Glance" });
  await glance.click();
  await expect(page.getByRole("listbox", { name: /23 commits/ })).toBeVisible();
  await page.getByRole("button", { name: "Refresh — re-sync branch tips" }).click();
  await expect(page.getByRole("listbox", { name: /1 commits/ })).toBeVisible();
  await expect(glance).toHaveAttribute("aria-busy", "false");
  await expect(page.getByText("Rewritten history")).toBeVisible();
});

test("Glance preserves the displayed snapshot while refreshed history is calculated", async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      postMessage(message: unknown) { setTimeout(() => super.postMessage(message), 600); }
    };
  });
  let loads = 0;
  await page.route("**/api/repo**", (route) => {
    const history = demoHistory();
    if (++loads > 1) {
      const main = history.refs.find((ref) => ref.name === "main")!;
      history.commits.unshift({ sha: "advanced-tip", parents: [main.sha], author: "Ada", date: "2026-10-13T12:00:00Z", message: "Advance main" });
      for (const ref of history.refs) if (ref.name === "main" || ref.type === "head") ref.sha = "advanced-tip";
    }
    return route.fulfill({ json: { repo: { owner: "acme", repo: "widgets", defaultBranch: "main" }, history, nextPage: null } });
  });
  await page.goto("/repo/acme/widgets");
  const glance = page.getByRole("button", { name: "Glance" });
  await glance.click();
  await expect(page.getByRole("listbox", { name: /23 commits/ })).toBeVisible();
  await page.getByRole("button", { name: "Refresh — re-sync branch tips" }).click();
  await expect(glance).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("listbox", { name: /23 commits/ })).toBeVisible();
  await expect(page.getByRole("listbox", { name: /24 commits/ })).toBeVisible();
  await expect(glance).toHaveAttribute("aria-busy", "false");
});

test("intent prefetch warms the validated repo route without ingestion", async ({ page }) => {
  const prefetched: string[] = [];
  let apiCalls = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/repo/") && request.headers()["rsc"] === "1") prefetched.push(url.pathname);
  });
  await page.route("**/api/**", (route) => { apiCalls++; return route.abort(); });
  await page.goto("/");
  await page.getByLabel("Public GitHub repository").fill("https://github.com/acme/widgets");
  await page.getByLabel("Public GitHub repository").press("Tab");
  await expect.poll(() => prefetched.includes("/repo/acme/widgets")).toBe(true);
  await page.waitForLoadState("networkidle");
  const count = prefetched.length;
  await page.getByRole("button", { name: "Visualize" }).dispatchEvent("pointerenter");
  await page.waitForLoadState("networkidle");
  expect(prefetched).toHaveLength(count);
  expect(apiCalls).toBe(0);
  await expect(page).toHaveURL("/");
});

test("paste prefetch validates the resulting field value and never navigates", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/repo/")) requests.push(url.pathname);
  });
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/");
  const input = page.getByLabel("Public GitHub repository");
  await input.evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text", "not a repository!!");
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true }));
  });
  await page.waitForLoadState("networkidle");
  expect(requests).toHaveLength(0);
  await input.evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text", "https://github.com/acme/pasted");
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true }));
  });
  await expect.poll(() => requests.includes("/repo/acme/pasted")).toBe(true);
  await expect(page).toHaveURL("/");
});

test("a prepared repository keeps the shell usable while history waits", async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/repo**", async (route) => {
    await gate;
    await route.fulfill({ json: {
      repo: { owner: "acme", repo: "widgets", defaultBranch: "main" }, history: demoHistory(), nextPage: null,
    } });
  });
  await page.goto("/");
  await page.getByLabel("Public GitHub repository").fill("acme/widgets");
  await page.getByLabel("Public GitHub repository").press("Tab");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Public GitHub repository").press("Enter");
  try {
    await expect(page.getByRole("status")).toContainText("Reading acme/widgets…");
    await expect(page.locator("#main")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Chronos", exact: true })).toBeVisible();
    await expect(page).toHaveTitle("acme/widgets — Chronos");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  } finally {
    release();
  }
  await expect(page.getByRole("listbox")).toBeVisible();
});
