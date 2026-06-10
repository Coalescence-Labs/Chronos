import { expect, test } from "@playwright/test";

/** /demo runs entirely on synthetic history — no mocks, no GitHub. */

test("the demo repo renders and inspects without any network", async ({ page, isMobile }) => {
  let apiCalls = 0;
  await page.route("**/api/**", (route) => {
    apiCalls++;
    return route.abort();
  });

  await page.goto("/demo");
  const graph = page.getByRole("listbox", { name: /commit graph/i });
  await expect(graph).toBeVisible();
  expect(await page.getByRole("option").count()).toBeGreaterThan(20);
  await expect(page.getByText("main", { exact: true })).toBeVisible();
  await expect(page.getByText("develop", { exact: true })).toBeVisible();

  const row = page.getByRole("option", { name: /Release v0\.3\.0/ });
  if (isMobile) await row.tap();
  else await row.click();
  await expect(page.getByRole("complementary", { name: /Commit/ })).toContainText("v0.3.0");

  expect(apiCalls).toBe(0);
});

test("scrolling past a tip pins its badge; clicking it jumps back", async ({ page }) => {
  await page.goto("/demo");
  const graph = page.getByRole("listbox", { name: /commit graph/i });
  await expect(graph).toBeVisible();
  await expect(page.locator('[data-pinned="develop"]')).toHaveCount(0); // tip in view

  await graph.evaluate((el) => el.scrollTo({ top: 800 }));
  const pinnedDevelop = page.locator('[data-pinned="develop"]');
  await expect(pinnedDevelop).toBeVisible();
  await expect(page.locator('[data-pinned="main"]')).toBeVisible();

  await pinnedDevelop.click();
  await expect(pinnedDevelop).toHaveCount(0); // back at the tip → unpinned
  await expect(graph).toHaveJSProperty("scrollTop", 0);
});

test("the home page links to the demo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /explore the demo repo/ }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("listbox", { name: /commit graph/i })).toBeVisible();
});
