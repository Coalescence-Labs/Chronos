import { expect, test } from "@playwright/test";

test("production CSP nonces change per document and block injected inline scripts", async ({ page }) => {
  await page.route("**/demo", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace("</head>", "<script>window.__chronosInjected = true</script></head>");
    await route.fulfill({ response, body });
  });
  const first = await page.goto("/demo");
  const policy = first!.headers()["content-security-policy"] ?? "";
  expect(policy).toContain("'strict-dynamic'");
  expect(first!.headers()["referrer-policy"]).toBe("no-referrer");
  expect(first!.headers()["x-content-type-options"]).toBe("nosniff");
  const nonce = policy.match(/'nonce-([^']+)'/)![1];
  expect(await page.locator("script").first().evaluate((element) => (element as HTMLScriptElement).nonce)).toBe(nonce);
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__chronosInjected)).toBeUndefined();
  const second = await page.reload();
  expect(second!.headers()["content-security-policy"]).not.toContain(`'nonce-${nonce}'`);
  await expect(page.getByRole("listbox", { name: /commit graph/i })).toBeVisible();
});

test("mutation API routes reject browser requests without a same-origin proof", async ({ request }) => {
  for (const path of ["/api/github/disconnect", "/api/auth/sign-out"]) {
    const response = await request.post(path, { headers: { Origin: "https://sibling.chronos.test" } });
    expect(response.status()).toBe(403);
    expect(await response.text()).not.toContain("token");
  }
});
