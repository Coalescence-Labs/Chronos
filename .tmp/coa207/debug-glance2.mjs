import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.addInitScript(() => localStorage.setItem("chronos-theme", "light"));
await page.goto("http://localhost:3005/demo", { waitUntil: "networkidle" });
await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
const glance = page.getByRole("button", { name: "Glance" });
await glance.click();
// Move pointer away so :hover does not apply
await page.mouse.move(0, 0);
await page.waitForTimeout(300);

const info = await glance.evaluate((el) => {
  const cs = getComputedStyle(el);
  const rules = [];
  for (const sheet of document.styleSheets) {
    let rulesList;
    try { rulesList = sheet.cssRules; } catch { continue; }
    for (const rule of rulesList) {
      if (!rule.selectorText || !rule.selectorText.includes("glanceHoverB") && !rule.selectorText.includes("glanceToggle")) continue;
      if (!rule.selectorText.includes("aria-pressed")) continue;
      try {
        if (el.matches(rule.selectorText.split(",")[0].trim()) || rule.selectorText.split(",").some(s => { try { return el.matches(s.trim()); } catch { return false; } })) {
          rules.push({ sel: rule.selectorText, bg: rule.style.background || rule.style.backgroundColor, color: rule.style.color });
        }
      } catch {}
    }
  }
  return {
    className: el.className,
    ariaPressed: el.getAttribute("aria-pressed"),
    htmlTheme: document.documentElement.getAttribute("data-theme"),
    backgroundColor: cs.backgroundColor,
    color: cs.color,
    borderColor: cs.borderColor,
    boxShadow: cs.boxShadow,
    matchingPressedRules: rules,
  };
});
console.log(JSON.stringify(info, null, 2));

await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find(b => b.textContent?.trim() === "Glance");
  const wrap = document.createElement("div");
  wrap.id = "coa207-compare";
  wrap.style.cssText = "position:fixed;inset:0;z-index:99999;background:var(--bg);display:flex;gap:40px;align-items:center;justify-content:center;padding:48px;font-family:var(--font-sans);";
  const mk = (label, pressed) => {
    const col = document.createElement("div");
    col.style.cssText = "display:flex;flex-direction:column;gap:10px;align-items:center;";
    const l = document.createElement("div");
    l.textContent = label;
    l.style.cssText = "font-size:12px;font-weight:600;color:var(--fg-muted);text-transform:uppercase;letter-spacing:0.04em;";
    const c = btn.cloneNode(true);
    c.setAttribute("aria-pressed", pressed ? "true" : "false");
    // clones aren't hovered
    col.append(l, c);
    return col;
  };
  wrap.append(mk("Idle", false), mk("Active", true));
  document.body.append(wrap);
});
await page.locator("#coa207-compare").screenshot({ path: "/Users/alexjoshua/csci/projects/Chronos/.tmp/coa207/light-idle-vs-active-live.png" });

// Also dump colors of both clones
const colors = await page.evaluate(() => {
  const wrap = document.getElementById("coa207-compare");
  const btns = [...wrap.querySelectorAll("button")];
  return btns.map(b => {
    const cs = getComputedStyle(b);
    return { pressed: b.getAttribute("aria-pressed"), bg: cs.backgroundColor, color: cs.color, border: cs.borderColor };
  });
});
console.log("clones", JSON.stringify(colors, null, 2));
await browser.close();
