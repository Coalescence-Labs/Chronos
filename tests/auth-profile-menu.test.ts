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
});
