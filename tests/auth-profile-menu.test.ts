import { describe, expect, test } from "bun:test";
import { profileDisplayName, profileInitial } from "@/lib/auth/profile-label";

describe("profile identity labels", () => {
  test("profileInitial prefers first name, else email local-part", () => {
    expect(profileInitial({ email: "ada@example.com", firstName: "Ada", lastName: "Lovelace" })).toBe(
      "A",
    );
    expect(profileInitial({ email: "ada@example.com", firstName: null, lastName: null })).toBe("A");
    expect(profileInitial({ email: "  ", firstName: null, lastName: null })).toBe("?");
  });

  test("profileDisplayName prefers full name, else email", () => {
    expect(
      profileDisplayName({ email: "ada@example.com", firstName: "Ada", lastName: "Lovelace" }),
    ).toBe("Ada Lovelace");
    expect(profileDisplayName({ email: "ada@example.com", firstName: "Ada", lastName: null })).toBe(
      "Ada",
    );
    expect(profileDisplayName({ email: "ada@example.com", firstName: null, lastName: null })).toBe(
      "ada@example.com",
    );
  });
});

describe("profile menu shell wiring", () => {
  test("AccountControls uses ProfileMenu and no longer mounts a standalone Sign out Button", async () => {
    const source = await Bun.file("components/auth/AccountControls.tsx").text();
    expect(source).toContain("ProfileMenu");
    expect(source).toContain("SignInLink");
    expect(source).not.toMatch(/from\s+"@\/components\/ui\/Button"/);
    expect(source).not.toMatch(/<Button[\s\S]*Sign out/);

    const signIn = await Bun.file("components/auth/SignInLink.tsx").text();
    expect(signIn).toContain("Sign in");
  });

  test("ProfileMenu is an accessible disclosure menu with compact theme controls", async () => {
    const source = await Bun.file("components/auth/ProfileMenu.tsx").text();
    expect(source).toContain('aria-expanded={open}');
    expect(source).toContain('aria-haspopup="menu"');
    expect(source).toContain('role="menu"');
    expect(source).toContain('role="menuitem"');
    expect(source).toContain("Escape");
    expect(source).toContain("Sign out");
    expect(source).toContain('href="/account"');
    expect(source).toContain("ProfileThemeControl");
    expect(source).not.toMatch(/console\.(log|info|debug|warn|error)/);

    const themeSource = await Bun.file("components/auth/ProfileThemeControl.tsx").text();
    expect(themeSource).toContain('variant="profile"');
    expect(themeSource).toContain("ThemePreferenceControl");
  });

  test("AppShell keeps guest theme in the footer, not the header", async () => {
    const source = await Bun.file("components/shell/AppShell.tsx").text();
    expect(source).toContain("ShellAppearanceFooter");
    expect(source).not.toContain("AccountControlsGate />\n          <ThemeToggle");
    const headerBlock = source.slice(source.indexOf("<header"), source.indexOf("</header>"));
    expect(headerBlock).not.toContain("ThemeToggle");
    expect(headerBlock).not.toContain("ShellAppearanceFooter");
    expect(headerBlock).toContain("AccountControlsGate");

    const footerSource = await Bun.file("components/shell/ShellAppearanceFooter.tsx").text();
    expect(footerSource).toContain("ThemeToggle");
    expect(footerSource).toContain("useAuth");
    // Guests only — hide while AuthKit resolves or the user is signed in.
    expect(footerSource).toMatch(/loading\s*\|\|\s*user/);

    const css = await Bun.file("components/shell/shell.module.css").text();
    expect(css).toMatch(/\.shellFooter\s*\{[^}]*justify-content:\s*center/s);
  });

  test("AccountControls delegates theme to ProfileMenu, not the footer", async () => {
    const source = await Bun.file("components/auth/AccountControls.tsx").text();
    expect(source).not.toContain("ThemeToggle");
    expect(source).toContain("SignInLink");
    expect(source).toContain("ProfileMenu");
  });

  test("header holds a stable skeleton while AuthKit loads (no Sign in flash)", async () => {
    const gate = await Bun.file("components/auth/AccountControlsGate.tsx").text();
    expect(gate).toContain("AccountControlsSkeleton");
    expect(gate).toContain("loading:");
    expect(gate).not.toContain("SignInLink");
    expect(gate).not.toMatch(/loading:\s*\(\)\s*=>\s*null/);

    const controls = await Bun.file("components/auth/AccountControls.tsx").text();
    expect(controls).toContain("AccountControlsSkeleton");
    expect(controls).toMatch(/if\s*\(\s*loading\s*\)/);
    expect(controls).toMatch(/if\s*\(\s*!user\s*\)/);
    expect(controls).not.toMatch(/loading\s*\|\|\s*!user/);
    expect(controls).toContain("SignInLink");

    const skeleton = await Bun.file("components/auth/AccountControlsSkeleton.tsx").text();
    expect(skeleton).toContain('aria-busy="true"');
    expect(skeleton).toContain("Loading account");

    const css = await Bun.file("components/auth/profile-menu.module.css").text();
    expect(css).toMatch(/\.skeleton\s*\{[^}]*width:\s*var\(--touch-target\)/s);
    expect(css).toMatch(/\.skeleton\s*\{[^}]*height:\s*var\(--touch-target\)/s);
  });

  test("mobile guest theme footer is compressed (no full-bleed glass strip)", async () => {
    const css = await Bun.file("components/shell/shell.module.css").text();
    const baseIdx = css.search(/\.shellFooter\s*\{/);
    const mobileIdx = css.search(/@media\s*\(max-width:\s*699px\)/);
    expect(baseIdx).toBeGreaterThanOrEqual(0);
    expect(mobileIdx).toBeGreaterThan(baseIdx);
    expect(css.slice(mobileIdx)).toMatch(/\.shellFooter\s*\{[^}]*border-top:\s*none/s);
    expect(css.slice(mobileIdx)).toMatch(/\.shellFooter\s*\{[^}]*background-color:\s*transparent/s);

    const themeCss = await Bun.file("components/shell/theme-control.module.css").text();
    expect(themeCss).toMatch(/\.option[\s\S]*?min-width:\s*var\(--touch-target\)/);
    expect(themeCss).toMatch(/\.option[\s\S]*?min-height:\s*var\(--touch-target\)/);
  });

  test("Sign in chip uses glass surface so it stays visible on the home frost", async () => {
    const link = await Bun.file("components/auth/SignInLink.tsx").text();
    expect(link).toContain("styles.signIn");
    const css = await Bun.file("components/auth/profile-menu.module.css").text();
    expect(css).toMatch(/\.signIn\s*\{[^}]*background-image:\s*var\(--glass-bg\)/s);
  });

  test("header actions are right-justified via shell CSS", async () => {
    const css = await Bun.file("components/shell/shell.module.css").text();
    expect(css).toMatch(/\.header\s*\{[^}]*justify-content:\s*space-between/s);
    expect(css).toMatch(/\.headerActions\s*\{[^}]*margin-inline-start:\s*auto/s);
    expect(css).toMatch(/\.headerActions\s*\{[^}]*justify-content:\s*flex-end/s);
    expect(css).toMatch(/\.shellFooter\s*\{[^}]*justify-content:\s*center/s);
  });

  test("profile menu styles separate theme from account actions", async () => {
    const css = await Bun.file("components/auth/profile-menu.module.css").text();
    expect(css).toMatch(/\.identity\s*\{[^}]*border-bottom/s);
    expect(css).toMatch(/\.themeSection\s*\{[^}]*border-bottom/s);
    expect(css).toContain(".themeRow");
  });
});
