import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * COA-71 acceptance, end to end in a real browser: paste a URL → graph
 * renders; pan/zoom/tap-to-inspect on phone (touch) and laptop (pointer +
 * keyboard); inspector is a sheet on phone, a panel on laptop. The BFF is
 * mocked so the run never leaves the machine.
 */

const BASE = Date.parse("2026-06-01T12:00:00Z");
const commit = (sha: string, parents: string[], minutesAgo: number, message: string) => ({
  sha,
  parents,
  author: "Ada Lovelace",
  date: new Date(BASE - minutesAgo * 60_000).toISOString(),
  message,
});

const repoResponse = {
  repo: { owner: "acme", repo: "widgets", defaultBranch: "main" },
  history: {
    commits: [
      commit("c5", ["c4", "c3"], 0, "Merge feature into main"),
      commit("c4", ["c2"], 1, "Tighten input validation"),
      commit("c3", ["c2"], 2, "Add feature flag"),
      commit("c2", ["c1"], 3, "Wire up storage"),
      commit("c1", [], 4, "Initial commit"),
    ],
    refs: [
      { name: "HEAD", type: "head", sha: "c5" },
      { name: "main", type: "branch", sha: "c5" },
      { name: "feature", type: "branch", sha: "c3" },
      { name: "v1.0.0", type: "tag", sha: "c2" },
    ],
  },
  nextPage: null,
};

async function mockBff(page: Page) {
  await page.route("**/api/repo**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/repo") return route.fulfill({ json: repoResponse });
    return route.fulfill({ json: { commits: [], nextPage: null } });
  });
}

const graphOf = (page: Page) => page.getByRole("listbox", { name: /commit graph/i });

test.beforeEach(async ({ page }) => {
  await mockBff(page);
});

test("pasting a public repo URL renders the branch graph", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Public GitHub repository").fill("https://github.com/acme/widgets");
  await page.getByRole("button", { name: "Visualize" }).click();

  await expect(page).toHaveURL(/\/repo\/acme\/widgets$/);
  await expect(graphOf(page)).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(5);
  await expect(graphOf(page).locator("svg circle")).toHaveCount(5);
  await expect(page.getByText("5 commits")).toBeVisible();
  await expect(page.getByText("main", { exact: true })).toBeVisible();
});

test("invalid input fails inline without navigating", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Public GitHub repository").fill("not a repo!!");
  await page.getByRole("button", { name: "Visualize" }).click();
  // filter: Next's route announcer is also a role="alert" element
  const alert = page.getByRole("alert").filter({ hasText: /GitHub repository/ });
  await expect(alert).toContainText(/doesn't look like a GitHub repository/);
  await expect(page).toHaveURL("/");
});

test("tapping a commit opens the inspector; closing returns to the graph", async ({
  page,
  isMobile,
}) => {
  await page.goto("/repo/acme/widgets");
  const row = page.getByRole("option", { name: /Merge feature into main/ });
  if (isMobile) await row.tap();
  else await row.click();

  const inspector = page.getByRole("complementary", { name: /Commit c5/ });
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText("Ada Lovelace");
  await expect(inspector).toContainText("c4, c3"); // both merge parents

  await page.getByRole("button", { name: "Close inspector" }).click();
  await expect(inspector).toBeHidden();
});

test("keyboard: arrows drive selection, Escape clears", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard navigation is the laptop posture");
  await page.goto("/repo/acme/widgets");
  const graph = graphOf(page);
  await graph.focus();

  await page.keyboard.press("ArrowDown");
  await expect(graph).toHaveAttribute("aria-activedescendant", "gv-c5");
  await page.keyboard.press("ArrowDown");
  await expect(graph).toHaveAttribute("aria-activedescendant", "gv-c4");
  await expect(page.getByRole("complementary", { name: /Commit c4/ })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary")).toBeHidden();
});

test("zoom controls scale the graph and meet the touch-target size", async ({ page }) => {
  await page.goto("/repo/acme/widgets");
  const zoomIn = page.getByRole("button", { name: "Zoom in" });

  const box = (await zoomIn.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);

  const rowBefore = (await page.getByRole("option").first().boundingBox())!;
  await zoomIn.click();
  await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveText("120%");
  const rowAfter = (await page.getByRole("option").first().boundingBox())!;
  expect(rowAfter.height).toBeGreaterThan(rowBefore.height);
});

test("older pages load lazily as the graph scrolls toward the end", async ({ page }) => {
  // Four pages of 20: pages 1–3 load eagerly (DEFAULT_INITIAL_PAGES) for 60
  // commits — taller than any viewport — and page 4 must wait for scroll.
  const trunkPage = (page: number, last: boolean) =>
    Array.from({ length: 20 }, (_, j) => {
      const i = (page - 1) * 20 + j;
      return commit(`a${i}`, last && i === page * 20 - 1 ? [] : [`a${i + 1}`], i, `Change ${i}`);
    });
  const commitsRequests: string[] = [];
  await page.unroute("**/api/repo**");
  await page.route("**/api/repo**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/repo") {
      return route.fulfill({
        json: {
          repo: { owner: "acme", repo: "widgets", defaultBranch: "main" },
          history: {
            commits: trunkPage(1, false),
            refs: [
              { name: "HEAD", type: "head", sha: "a0" },
              { name: "main", type: "branch", sha: "a0" },
            ],
          },
          nextPage: 2,
        },
      });
    }
    const pageNumber = Number(url.searchParams.get("page"));
    commitsRequests.push(String(pageNumber));
    return route.fulfill({
      json: {
        commits: trunkPage(pageNumber, pageNumber === 4),
        nextPage: pageNumber === 4 ? null : pageNumber + 1,
      },
    });
  });

  await page.goto("/repo/acme/widgets");
  // The DOM is virtualized, so assert totals via the listbox label.
  await expect(page.getByRole("listbox", { name: /60 commits/ })).toBeVisible();
  expect(commitsRequests).toEqual(["2", "3"]); // eager pages only

  await graphOf(page).evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect(page.getByRole("listbox", { name: /80 commits/ })).toBeVisible();
  expect(commitsRequests).toEqual(["2", "3", "4"]);
});

test("retry recovers from a failed initial load (COA-92)", async ({ page }) => {
  let attempts = 0;
  await page.unroute("**/api/repo**");
  await page.route("**/api/repo**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/repo") {
      attempts++;
      if (attempts === 1) {
        return route.fulfill({
          status: 502,
          json: { error: { code: "upstream", message: "Something went wrong." } },
        });
      }
      return route.fulfill({ json: repoResponse });
    }
    return route.fulfill({ json: { commits: [], nextPage: null } });
  });

  await page.goto("/repo/acme/widgets");
  await expect(page.getByRole("alert").filter({ hasText: /repository/ })).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(graphOf(page)).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(5);
  expect(attempts).toBe(2);
});

test("a failed loadMore re-arms and succeeds on the next scroll (COA-92)", async ({ page }) => {
  const trunkPage = (n: number, last: boolean) =>
    Array.from({ length: 20 }, (_, j) => {
      const i = (n - 1) * 20 + j;
      return commit(`a${i}`, last && i === n * 20 - 1 ? [] : [`a${i + 1}`], i, `Change ${i}`);
    });
  const pageRequests: number[] = [];
  await page.unroute("**/api/repo**");
  await page.route("**/api/repo**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/repo") {
      return route.fulfill({
        json: {
          repo: { owner: "acme", repo: "widgets", defaultBranch: "main" },
          history: {
            commits: trunkPage(1, false),
            refs: [
              { name: "HEAD", type: "head", sha: "a0" },
              { name: "main", type: "branch", sha: "a0" },
            ],
          },
          nextPage: 2,
        },
      });
    }
    const n = Number(url.searchParams.get("page"));
    pageRequests.push(n);
    // The first lazy page (4) fails once, then succeeds on retry.
    if (n === 4 && pageRequests.filter((p) => p === 4).length === 1) {
      return route.fulfill({
        status: 429,
        json: { error: { code: "rate-limited", message: "Slow down.", retryAfterSeconds: 1 } },
      });
    }
    return route.fulfill({
      json: { commits: trunkPage(n, n === 4), nextPage: n === 4 ? null : n + 1 },
    });
  });

  await page.goto("/repo/acme/widgets");
  const graph = graphOf(page);
  await expect(page.getByRole("listbox", { name: /60 commits/ })).toBeVisible(); // pages 1–3 eager

  // Reach the bottom → page 4 loadMore fails → stays at 60 (re-armed, no crash).
  await graph.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect.poll(() => pageRequests.filter((p) => p === 4).length).toBe(1);
  await expect(page.getByRole("listbox", { name: /60 commits/ })).toBeVisible();

  // Scroll away and back to re-trigger → page 4 retried → succeeds → 80.
  await graph.evaluate((el) => el.scrollTo({ top: 0 }));
  await graph.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect(page.getByRole("listbox", { name: /80 commits/ })).toBeVisible();
  expect(pageRequests.filter((p) => p === 4).length).toBe(2); // failed once, then succeeded
});

test("refresh re-syncs a moved branch tip in place (COA-100)", async ({ page, isMobile }) => {
  let repoCalls = 0;
  await page.unroute("**/api/repo**");
  await page.route("**/api/repo**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/repo") {
      repoCalls++;
      // First load: 5 commits, main@c5. After refresh: main advanced to c6.
      if (repoCalls === 1) return route.fulfill({ json: repoResponse });
      return route.fulfill({
        json: {
          repo: { owner: "acme", repo: "widgets", defaultBranch: "main" },
          history: {
            commits: [commit("c6", ["c5"], -1, "Add refresh button"), ...repoResponse.history.commits],
            refs: [
              { name: "HEAD", type: "head", sha: "c6" },
              { name: "main", type: "branch", sha: "c6" },
              { name: "feature", type: "branch", sha: "c3" },
              { name: "v1.0.0", type: "tag", sha: "c2" },
            ],
          },
          nextPage: null,
        },
      });
    }
    return route.fulfill({ json: { commits: [], nextPage: null } });
  });

  await page.goto("/repo/acme/widgets");
  await expect(page.getByText("5 commits")).toBeVisible();

  const refresh = page.getByRole("button", { name: /Refresh/ });
  if (isMobile) await refresh.tap();
  else await refresh.click();

  // The new tip merges into the existing view: count grows, commit renders.
  await expect(page.getByRole("listbox", { name: /6 commits/ })).toBeVisible();
  await expect(page.getByText("Add refresh button")).toBeVisible();
  await expect(page.getByText(/updated just now/)).toBeVisible();
});

test("refreshing an unchanged repo costs one request and says up to date (COA-100)", async ({
  page,
}) => {
  let repoCalls = 0;
  let commitCalls = 0;
  await page.unroute("**/api/repo**");
  await page.route("**/api/repo**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/repo") {
      repoCalls++;
      return route.fulfill({ json: repoResponse });
    }
    commitCalls++;
    return route.fulfill({ json: { commits: [], nextPage: null } });
  });

  await page.goto("/repo/acme/widgets");
  await expect(page.getByText("5 commits")).toBeVisible();
  expect(repoCalls).toBe(1); // initial load; every tip already in trunk
  expect(commitCalls).toBe(0);

  await page.getByRole("button", { name: /Refresh/ }).click();
  await expect(page.getByText(/up to date/)).toBeVisible();
  expect(repoCalls).toBe(2); // exactly one more /api/repo — the happy path
  expect(commitCalls).toBe(0); // nothing moved → no per-tip pages
});

test("refresh prunes a squash-merged + deleted branch; selection survives (COA-127)", async ({
  page,
  isMobile,
}) => {
  // Before: an unmerged feature line (f2 ← f1) only its ref can reach.
  // After: the branch was squash-merged (s1 on main) and deleted upstream.
  const before = {
    repo: { owner: "acme", repo: "widgets", defaultBranch: "main" },
    history: {
      commits: [
        commit("m3", ["m2"], 0, "Ship dashboard"),
        commit("f2", ["f1"], 1, "Polish login form"),
        commit("m2", ["m1"], 2, "Wire up storage"),
        commit("f1", ["m2"], 3, "Add login form"),
        commit("m1", [], 4, "Initial commit"),
      ],
      refs: [
        { name: "HEAD", type: "head", sha: "m3" },
        { name: "main", type: "branch", sha: "m3" },
        { name: "feature/login", type: "branch", sha: "f2" },
      ],
    },
    nextPage: null,
  };
  const after = {
    repo: { owner: "acme", repo: "widgets", defaultBranch: "main" },
    history: {
      commits: [
        commit("s1", ["m3"], -1, "Add login (squash #42)"),
        commit("m3", ["m2"], 0, "Ship dashboard"),
        commit("m2", ["m1"], 2, "Wire up storage"),
        commit("m1", [], 4, "Initial commit"),
      ],
      refs: [
        { name: "HEAD", type: "head", sha: "s1" },
        { name: "main", type: "branch", sha: "s1" },
      ],
    },
    nextPage: null,
  };
  let repoCalls = 0;
  await page.unroute("**/api/repo**");
  await page.route("**/api/repo**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/repo") {
      repoCalls++;
      return route.fulfill({ json: repoCalls === 1 ? before : after });
    }
    return route.fulfill({ json: { commits: [], nextPage: null } });
  });

  await page.goto("/repo/acme/widgets");
  await expect(page.getByText("5 commits")).toBeVisible();
  await expect(page.getByText("Polish login form")).toBeVisible();

  // Select a trunk commit that survives the refresh.
  const row = page.getByRole("option", { name: /Wire up storage/ });
  if (isMobile) await row.tap();
  else await row.click();
  await expect(page.getByRole("complementary", { name: /Commit m2/ })).toBeVisible();

  // With the inspector panel open the laptop layout overlaps the header
  // actions, so activate Refresh via keyboard — a real user path either way.
  const refresh = page.getByRole("button", { name: /Refresh/ });
  if (isMobile) await refresh.tap();
  else {
    await refresh.focus();
    await page.keyboard.press("Enter");
  }

  // The stale feature line is gone, the squash commit is in, in place.
  await expect(page.getByRole("listbox", { name: /4 commits/ })).toBeVisible();
  await expect(page.getByText("Add login (squash #42)")).toBeVisible();
  await expect(page.getByText("Polish login form")).toHaveCount(0);
  await expect(page.getByText("Add login form")).toHaveCount(0);
  await expect(page.getByText(/updated just now/)).toBeVisible();
  // Selection survived the reconcile: the inspector is still on m2.
  await expect(page.getByRole("complementary", { name: /Commit m2/ })).toBeVisible();
});

test("refresh replaces a rebased branch line without duplicates (COA-127)", async ({
  page,
  isMobile,
}) => {
  // Before: feature/x (f2 ← f1) forked at m1 while main sits at m2.
  // After: the branch was rebased onto m2 — new shas r2 ← r1, old line gone.
  const before = {
    repo: { owner: "acme", repo: "widgets", defaultBranch: "main" },
    history: {
      commits: [
        commit("f2", ["f1"], 1, "Old: polish login"),
        commit("f1", ["m1"], 2, "Old: add login"),
        commit("m2", ["m1"], 3, "Wire up storage"),
        commit("m1", [], 5, "Initial commit"),
      ],
      refs: [
        { name: "HEAD", type: "head", sha: "m2" },
        { name: "main", type: "branch", sha: "m2" },
        { name: "feature/x", type: "branch", sha: "f2" },
      ],
    },
    nextPage: null,
  };
  const afterRepo = {
    repo: { owner: "acme", repo: "widgets", defaultBranch: "main" },
    history: {
      commits: [
        commit("m2", ["m1"], 3, "Wire up storage"),
        commit("m1", [], 5, "Initial commit"),
      ],
      refs: [
        { name: "HEAD", type: "head", sha: "m2" },
        { name: "main", type: "branch", sha: "m2" },
        { name: "feature/x", type: "branch", sha: "r2" },
      ],
    },
    nextPage: null,
  };
  const rebasedTipPage = {
    commits: [
      commit("r2", ["r1"], 0, "Rework: polish login"),
      commit("r1", ["m2"], 1, "Rework: add login"),
      commit("m2", ["m1"], 3, "Wire up storage"),
    ],
    nextPage: null,
  };
  let repoCalls = 0;
  const tipRequests: string[] = [];
  await page.unroute("**/api/repo**");
  await page.route("**/api/repo**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/repo") {
      repoCalls++;
      return route.fulfill({ json: repoCalls === 1 ? before : afterRepo });
    }
    tipRequests.push(url.searchParams.get("sha") ?? "");
    return route.fulfill({ json: rebasedTipPage });
  });

  await page.goto("/repo/acme/widgets");
  await expect(page.getByText("4 commits")).toBeVisible();
  await expect(page.getByText("Old: add login")).toBeVisible();

  const refresh = page.getByRole("button", { name: /Refresh/ });
  if (isMobile) await refresh.tap();
  else await refresh.click();

  // Old line pruned, rebased line in — never both, still 4 rows.
  await expect(page.getByText("Rework: polish login")).toBeVisible();
  await expect(page.getByText("Old: polish login")).toHaveCount(0);
  await expect(page.getByText("Old: add login")).toHaveCount(0);
  await expect(page.getByRole("listbox", { name: /4 commits/ })).toBeVisible();
  expect(tipRequests).toEqual(["feature/x"]); // one page anchors the moved tip
  await expect(page.getByText(/updated just now/)).toBeVisible();
});

test("an empty repository shows the empty state, not an error", async ({ page }) => {
  await page.unroute("**/api/repo**");
  await page.route("**/api/repo**", (route) =>
    route.fulfill({
      json: {
        repo: { owner: "acme", repo: "blank", defaultBranch: "main" },
        history: { commits: [], refs: [] },
        nextPage: null,
      },
    }),
  );
  await page.goto("/repo/acme/blank");
  await expect(page.getByText("No commits yet")).toBeVisible();
  await expect(page.getByRole("listbox")).toHaveCount(0); // no graph, no error
});

test("upstream errors surface as a designed error state with retry", async ({ page }) => {
  await page.unroute("**/api/repo**");
  await page.route("**/api/repo**", (route) =>
    route.fulfill({
      status: 404,
      json: { error: { code: "not-found", message: "That repository doesn't exist or is private." } },
    }),
  );
  await page.goto("/repo/acme/missing");
  const alert = page.getByRole("alert").filter({ hasText: /repository/ });
  await expect(alert).toContainText("Couldn't load that repository");
  await expect(alert).toContainText("doesn't exist or is private");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});
