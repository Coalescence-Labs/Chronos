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
    expect(source).toContain("Sign in");
    expect(source).not.toMatch(/from\s+"@\/components\/ui\/Button"/);
    expect(source).not.toMatch(/<Button[\s\S]*Sign out/);
  });

  test("ProfileMenu is an accessible disclosure menu with Ergon-style theme row", async () => {
    const source = await Bun.file("components/auth/ProfileMenu.tsx").text();
    expect(source).toContain("aria-expanded={open}");
    expect(source).toContain('aria-haspopup="menu"');
    expect(source).toContain('role="menu"');
    expect(source).toContain('role="menuitem"');
    expect(source).toContain("Escape");
    expect(source).toContain("Sign out");
    expect(source).toContain('href="/account"');
    expect(source).toContain("ProfileThemeControl");
    // Theme is its own section, not nested under identity.
    expect(source).toMatch(/<\/div>\s*<ProfileThemeControl/);
    expect(source).not.toMatch(/console\.(log|info|debug|warn|error)/);

    const themeSource = await Bun.file("components/auth/ProfileThemeControl.tsx").text();
    expect(themeSource).toContain('variant="profile"');
    expect(themeSource).toContain("labelledBy=");
    expect(themeSource).toContain("ThemePreferenceControl");
    expect(themeSource).toContain("themeSection");

    const control = await Bun.file("components/shell/ThemePreferenceControl.tsx").text();
    expect(control).toContain("labelledBy");
    expect(control).toContain("aria-labelledby={labelledBy}");
    // Profile variant: Left/Right only so Up/Down can reach Account.
    expect(control).toMatch(/compact[\s\S]*ArrowRight[\s\S]*ArrowLeft/);
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
    // Hide while AuthKit loads or when signed in (no flash of guest strip).
    expect(footerSource).toMatch(/loading\s*\|\|\s*user/);

    const css = await Bun.file("components/shell/shell.module.css").text();
    expect(css).toMatch(/\.shellFooter\s*\{[^}]*justify-content:\s*center/s);
  });

  test("AccountControls delegates theme to ProfileMenu, not the footer", async () => {
    const source = await Bun.file("components/auth/AccountControls.tsx").text();
    expect(source).not.toContain("ThemeToggle");
    expect(source).toContain("Sign in");
    expect(source).toContain("ProfileMenu");
  });

  test("header actions are right-justified via shell CSS", async () => {
    const css = await Bun.file("components/shell/shell.module.css").text();
    expect(css).toMatch(/\.header\s*\{[^}]*justify-content:\s*space-between/s);
    expect(css).toMatch(/\.headerActions\s*\{[^}]*margin-inline-start:\s*auto/s);
    expect(css).toMatch(/\.headerActions\s*\{[^}]*justify-content:\s*flex-end/s);
    expect(css).toMatch(/\.shellFooter\s*\{[^}]*justify-content:\s*center/s);
  });

  test("profile menu styles separate theme from identity and account actions", async () => {
    const css = await Bun.file("components/auth/profile-menu.module.css").text();
    expect(css).toMatch(/\.identity\s*\{[^}]*border-bottom/s);
    expect(css).toMatch(/\.themeSection\s*\{[^}]*border-bottom/s);
    expect(css).toMatch(/\.themeRow\s*\{[^}]*min-height:\s*var\(--touch-target\)/s);
    expect(css).toMatch(/\.themeLabel\s*\{[^}]*font-size:\s*var\(--text-sm\)/s);
    expect(css).not.toMatch(/\.themeLabel\s*\{[^}]*text-transform:\s*uppercase/s);
  });

  test("guest mobile theme footer drops the full-bleed glass strip", async () => {
    const css = await Bun.file("components/shell/shell.module.css").text();
    expect(css).toMatch(
      /@media\s*\(max-width:\s*699px\)\s*\{[\s\S]*?\.shellFooter\s*\{[^}]*border-top:\s*none/s,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*699px\)\s*\{[\s\S]*?\.shellFooter\s*\{[^}]*background-color:\s*transparent/s,
    );
  });
});
