import { chromium } from "playwright";

// Prefer system Chrome channel if playwright browsers missing
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
} catch (e) {
  console.error("launch failed", e.message);
  process.exit(1);
}
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.addInitScript(() => localStorage.setItem("chronos-theme", "light"));
await page.goto("http://localhost:3005/demo", { waitUntil: "networkidle" });
await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
await page.waitForTimeout(500);

const glance = page.getByRole("button", { name: "Glance" });
await glance.click();
await page.waitForTimeout(400);

const info = await glance.evaluate((el) => {
  const cs = getComputedStyle(el);
  return {
    className: el.className,
    ariaPressed: el.getAttribute("aria-pressed"),
    htmlTheme: document.documentElement.getAttribute("data-theme"),
    backgroundColor: cs.backgroundColor,
    color: cs.color,
    borderColor: cs.borderColor,
    boxShadow: cs.boxShadow,
  };
});
console.log(JSON.stringify(info, null, 2));

// Side-by-side: clone idle + active for screenshot
await page.evaluate(() => {
  const btn = document.querySelector('button[aria-pressed="true"]');
  if (!btn || btn.textContent?.trim() !== "Glance") return;
  const wrap = document.createElement("div");
  wrap.id = "coa207-compare";
  wrap.style.cssText = "position:fixed;inset:0;z-index:99999;background:var(--bg);display:flex;gap:32px;align-items:center;justify-content:center;padding:40px;font-family:var(--font-sans);";
  const mk = (label, pressed) => {
    const col = document.createElement("div");
    col.style.cssText = "display:flex;flex-direction:column;gap:8px;align-items:center;";
    const l = document.createElement("div");
    l.textContent = label;
    l.style.cssText = "font-size:12px;color:var(--fg-muted);text-transform:uppercase;letter-spacing:0.04em;";
    const c = btn.cloneNode(true);
    c.setAttribute("aria-pressed", pressed ? "true" : "false");
    if (!pressed) {
      // force idle by removing pressed attribute styles — clone keeps classes
      c.setAttribute("aria-pressed", "false");
    }
    col.append(l, c);
    return col;
  };
  wrap.append(mk("Idle (aria-pressed=false)", false), mk("Active (aria-pressed=true)", true));
  document.body.append(wrap);
});
await page.waitForTimeout(200);
await page.locator("#coa207-compare").screenshot({ path: `${process.env.OUT}/light-idle-vs-active-live.png` });
console.log("screenshot ok");
await browser.close();
