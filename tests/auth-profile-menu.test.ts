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

  test("ProfileMenu embeds theme controls and accessible disclosure menu", async () => {
    const source = await Bun.file("components/auth/ProfileMenu.tsx").text();
    expect(source).toContain('aria-expanded={open}');
    expect(source).toContain('aria-haspopup="menu"');
    expect(source).toContain('role="menu"');
    expect(source).toContain('role="menuitem"');
    expect(source).toContain('Escape');
    expect(source).toContain("Sign out");
    expect(source).toContain('href="/account"');
    expect(source).toContain('layout="menu"');
    expect(source).toContain("ThemeToggle");
    expect(source).not.toMatch(/console\.(log|info|debug|warn|error)/);
  });

  test("signed-out AccountControls keeps header ThemeToggle; AppShell does not duplicate it", async () => {
    const controls = await Bun.file("components/auth/AccountControls.tsx").text();
    expect(controls).toContain("ThemeToggle");
    expect(controls).toContain("Sign in");

    const shell = await Bun.file("components/shell/AppShell.tsx").text();
    expect(shell).toContain("AccountControlsGate");
    expect(shell).not.toMatch(/<ThemeToggle/);

    const gate = await Bun.file("components/auth/AccountControlsGate.tsx").text();
    expect(gate).toContain("ThemeToggle");
  });
});
