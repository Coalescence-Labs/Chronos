import { defineConfig, devices } from "@playwright/test";

/**
 * E2E: phone (touch) + laptop (pointer/keyboard) — the two postures the
 * acceptance criteria name. Specs are hermetic: the BFF routes are mocked
 * with page.route, so no GitHub traffic leaves the machine.
 *
 * Files are *.e2e.ts (not *.spec.ts) so `bun test` doesn't pick them up.
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3005",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "phone",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "laptop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "bun run build && bun run start",
    url: "http://localhost:3005",
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
