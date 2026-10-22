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

  test("ProfileMenu is an accessible disclosure menu without theme controls", async () => {
    const source = await Bun.file("components/auth/ProfileMenu.tsx").text();
    expect(source).toContain('aria-expanded={open}');
    expect(source).toContain('aria-haspopup="menu"');
    expect(source).toContain('role="menu"');
    expect(source).toContain('role="menuitem"');
    expect(source).toContain("Escape");
    expect(source).toContain("Sign out");
    expect(source).toContain('href="/account"');
    expect(source).not.toContain("ThemeToggle");
    expect(source).not.toMatch(/console\.(log|info|debug|warn|error)/);
  });

  test("AppShell keeps ThemeToggle in the footer, not the header", async () => {
    const source = await Bun.file("components/shell/AppShell.tsx").text();
    expect(source).toContain("shellFooter");
    expect(source).toContain("ThemeToggle");
    expect(source).not.toContain("AccountControlsGate />\n          <ThemeToggle");
    const headerBlock = source.slice(source.indexOf("<header"), source.indexOf("</header>"));
    expect(headerBlock).not.toContain("ThemeToggle");
    expect(headerBlock).toContain("AccountControlsGate");
    const footerBlock = source.slice(source.indexOf("<footer"), source.indexOf("</footer>"));
    expect(footerBlock).toContain("ThemeToggle");
    expect(footerBlock).not.toContain("AccountControls");
    expect(footerBlock).not.toContain("Sign in");

    const css = await Bun.file("components/shell/shell.module.css").text();
    expect(css).toMatch(/\.shellFooter\s*\{[^}]*justify-content:\s*center/s);
  });

  test("AccountControls never mounts ThemeToggle (auth stays out of footer)", async () => {
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

  test("mobile theme footer is compressed (no full-bleed glass strip)", async () => {
    const css = await Bun.file("components/shell/shell.module.css").text();
    expect(css).toMatch(/@media\s*\(max-width:\s*699px\)\s*\{[\s\S]*?\.shellFooter\s*\{[^}]*border-top:\s*none/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*699px\)\s*\{[\s\S]*?\.shellFooter\s*\{[^}]*background-color:\s*transparent/s);
    expect(css).toMatch(/\.themeOption[\s\S]*?min-width:\s*var\(--touch-target\)/);
    expect(css).toMatch(/\.themeOption[\s\S]*?min-height:\s*var\(--touch-target\)/);
  });

  test("header actions are right-justified via shell CSS", async () => {
    const css = await Bun.file("components/shell/shell.module.css").text();
    expect(css).toMatch(/\.header\s*\{[^}]*justify-content:\s*space-between/s);
    expect(css).toMatch(/\.headerActions\s*\{[^}]*margin-inline-start:\s*auto/s);
    expect(css).toMatch(/\.headerActions\s*\{[^}]*justify-content:\s*flex-end/s);
    expect(css).toMatch(/\.shellFooter\s*\{[^}]*justify-content:\s*center/s);
  });
});
