import { chromium } from "@playwright/test";
import { mkdir } from "fs/promises";

const out = "/Users/alexjoshua/csci/projects/Chronos/.tmp/coa207";
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
await page.addInitScript(() => {
  localStorage.setItem("chronos-theme", "light");
});
await page.goto("http://localhost:3005/styleguide", { waitUntil: "networkidle" });
await page.evaluate(() => {
  document.documentElement.dataset.theme = "light";
});
const section = page.locator("[data-option-b-states]");
await section.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await section.screenshot({ path: `${out}/option-b-states-light.png` });
const buttons = section.getByRole("button", { name: "Glance" });
const labels = ["idle", "hover", "active", "active-hover"];
for (let i = 0; i < 4; i++) {
  await buttons.nth(i).screenshot({ path: `${out}/option-b-${labels[i]}.png` });
}
console.log("ok", out);
await browser.close();
