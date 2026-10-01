import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 400 } });
await page.addInitScript(() => localStorage.setItem("chronos-theme", "dark"));
await page.goto("http://localhost:3005/demo", { waitUntil: "networkidle" });
await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
const glance = page.getByRole("button", { name: "Glance" });
await glance.click();
await page.mouse.move(0, 0);
await page.waitForTimeout(300);

const info = await glance.evaluate((el) => {
  const cs = getComputedStyle(el);
  return {
    theme: document.documentElement.dataset.theme,
    bg: cs.backgroundColor,
    color: cs.color,
    border: cs.borderColor,
  };
});
console.log(JSON.stringify(info));

await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === "Glance");
  const wrap = document.createElement("div");
  wrap.id = "coa207-dark";
  wrap.style.cssText = "position:fixed;inset:0;z-index:99999;background:var(--bg);display:flex;gap:40px;align-items:center;justify-content:center;padding:48px;font-family:var(--font-sans);";
  const mk = (label, pressed) => {
    const col = document.createElement("div");
    col.style.cssText = "display:flex;flex-direction:column;gap:10px;align-items:center;";
    const l = document.createElement("div");
    l.textContent = label;
    l.style.cssText = "font-size:12px;font-weight:600;color:var(--fg-muted);text-transform:uppercase;letter-spacing:0.04em;";
    const c = btn.cloneNode(true);
    c.setAttribute("aria-pressed", pressed ? "true" : "false");
    col.append(l, c);
    return col;
  };
  wrap.append(mk("Idle", false), mk("Active", true));
  document.body.append(wrap);
});
await page.locator("#coa207-dark").screenshot({ path: "/Users/alexjoshua/csci/projects/Chronos/.tmp/coa207/dark-idle-vs-active.png" });
const colors = await page.evaluate(() => {
  return [...document.querySelectorAll("#coa207-dark button")].map(b => {
    const cs = getComputedStyle(b);
    return { pressed: b.getAttribute("aria-pressed"), bg: cs.backgroundColor, color: cs.color };
  });
});
console.log(JSON.stringify(colors));
await browser.close();
