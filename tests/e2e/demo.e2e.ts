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

  // The message/hash side of a row opens the commit view (the graph side traces).
  const message = page.getByText("Release v0.3.0", { exact: true });
  if (isMobile) await message.tap();
  else await message.click();
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

test("Glance mode hides landed branches and folds staged ones (COA-75)", async ({
  page,
  isMobile,
}) => {
  await page.goto("/demo");
  // Full history first (DOM is virtualized, so assert totals via the label).
  await expect(page.getByRole("listbox", { name: /Commit graph, 40 commits/ })).toBeVisible();
  await expect(page.getByText(/^2 commits$/)).toHaveCount(0);

  const glance = page.getByRole("button", { name: "Glance" });
  await expect(glance).toBeEnabled();
  if (isMobile) await glance.tap();
  else await glance.click();
  await expect(glance).toHaveAttribute("aria-pressed", "true");

  // Landed features drop out; a develop-staged feature folds to a capsule.
  await expect(page.getByRole("listbox", { name: /Commit graph, 23 commits/ })).toBeVisible();
  await expect(page.getByText(/^2 commits$/)).toBeVisible();
  // develop's own trunk stays expanded.
  await expect(page.getByText("Merge feature/open-edges into develop")).toBeVisible();

  if (isMobile) await glance.tap();
  else await glance.click();
  await expect(page.getByRole("listbox", { name: /Commit graph, 40 commits/ })).toBeVisible();
});

test("clicking a branch badge traces its line; clicking again clears (COA-84)", async ({
  page,
  isMobile,
}) => {
  await page.goto("/demo");
  const graph = page.getByRole("listbox", { name: /commit graph/i });
  await expect(graph).toBeVisible();

  const develop = page.getByRole("button", { name: /Trace develop/ });
  if (isMobile) await develop.tap();
  else await develop.click();

  // Pressed state flips and some rows dim (off-line commits recede).
  await expect(page.getByRole("button", { name: /Clear trace/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(await page.locator('[role="option"][data-dimmed]').count()).toBeGreaterThan(0);

  const toggled = page.getByRole("button", { name: /Clear trace/ });
  if (isMobile) await toggled.tap();
  else await toggled.click();
  await expect(page.locator('[role="option"][data-dimmed]')).toHaveCount(0);
});

test("switching branches then untoggling clears — no stale highlight resurfaces", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(page.getByRole("listbox", { name: /commit graph/i })).toBeVisible();

  await page.getByRole("button", { name: /Trace main/ }).click();
  await page.getByRole("button", { name: /Trace develop/ }).click(); // switch
  await expect(page.getByRole("button", { name: /Clear trace of develop/ })).toBeVisible();
  // Untoggle the active branch → back to default, NOT back to main.
  await page.getByRole("button", { name: /Clear trace of develop/ }).click();
  await expect(page.locator('[role="option"][data-dimmed]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Clear trace/ })).toHaveCount(0);
});

test("Escape clears an active trace from anywhere", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("listbox", { name: /commit graph/i })).toBeVisible();

  await page.getByRole("button", { name: /Trace develop/ }).click();
  await expect(page.locator('[role="option"][data-dimmed]').first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('[role="option"][data-dimmed]')).toHaveCount(0);
});

test("the graph side of a row traces; the message side opens the commit", async ({
  page,
  isMobile,
}) => {
  await page.goto("/demo");
  const release = page.getByRole("option", { name: /Release v0\.4\.0/ });
  const box = (await release.boundingBox())!;

  // Tap the far-left graph/lane gutter → highlights the branch (no commit view).
  if (isMobile) await release.tap({ position: { x: 4, y: box.height / 2 } });
  else await release.click({ position: { x: 4, y: box.height / 2 } });
  await expect(page.locator('[role="option"][data-dimmed]').first()).toBeVisible();
  await expect(page.getByRole("complementary", { name: /Commit/ })).toBeHidden();

  // Tap the message text → opens the commit view.
  const message = page.getByText("Release v0.4.0", { exact: true });
  if (isMobile) await message.tap();
  else await message.click();
  await expect(page.getByRole("complementary", { name: /Commit/ })).toBeVisible();
});

test("long-press a commit peeks it (no commit view); Escape collapses", async ({ page }) => {
  await page.goto("/demo");
  const row = page.getByRole("option", { name: /Spike: summarize a branch with ZDR-only AI/ });
  await expect(row).toBeVisible();
  await expect(row).not.toHaveAttribute("data-expanded", "true");

  // Long-press: pointer down, hold past the 450ms threshold, release.
  await row.dispatchEvent("pointerdown", { clientX: 300, clientY: 0 });
  await expect(row).toHaveAttribute("data-expanded", "true"); // peeked inline…
  await row.dispatchEvent("pointerup", {});
  await expect(page.getByRole("complementary", { name: /Commit/ })).toBeHidden(); // …no overlay

  await page.keyboard.press("Escape");
  await expect(row).not.toHaveAttribute("data-expanded", "true"); // collapsed
});

test("tapping the SHA in the commit view copies it", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permission API is chromium-only here");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/demo");

  await page.getByText("Release v0.4.0", { exact: true }).click(); // open the commit view
  const copy = page.getByRole("button", { name: "Copy full SHA" });
  await expect(copy).toBeVisible();
  await copy.click();

  await expect(copy).toContainText("Copied"); // feedback
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toMatch(/^[0-9a-f]{40}$/); // the full sha landed on the clipboard
});

test("the commit hash is hidden in the row meta on phones", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the hash column only collapses at the phone breakpoint");
  await page.goto("/demo");
  const row = page.getByRole("option", { name: /Release v0\.4\.0/ });
  await expect(row).toBeVisible();
  // The 7-char short sha shown in the row meta is not rendered on phones.
  await expect(row.locator("text=/^[0-9a-f]{7}$/")).toHaveCount(0);
});

test("the home page links to the demo", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /explore the demo repo/ }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("listbox", { name: /commit graph/i })).toBeVisible();
});
