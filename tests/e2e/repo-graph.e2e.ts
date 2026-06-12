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
