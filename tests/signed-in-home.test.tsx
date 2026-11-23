import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RepoLibraryView } from "@/components/home/RepoLibrary";
import { SignedInHome } from "@/components/home/SignedInHome";
import { isSignedIn } from "@/lib/auth/home-session";
import { formatRelative } from "@/lib/relative-time";

const NOW = Date.UTC(2026, 10, 22, 12);
const noop = () => {};

const view = (library: Parameters<typeof RepoLibraryView>[0]["library"]) =>
  renderToStaticMarkup(
    <RepoLibraryView library={library} now={NOW} onOpen={noop} onPin={noop} onClear={noop} />,
  );

describe("signed-in home", () => {
  test("renders the centered repo field and no library before the user is adopted", () => {
    const html = renderToStaticMarkup(<SignedInHome />);
    expect(html).toContain('id="repo-url"');
    expect(html).toContain("github.com/owner/repo");
    expect(html).not.toContain("Recent");
    expect(html).not.toContain("Repos you open will show up here");
    // The public hero copy belongs to the signed-out page only.
    expect(html).not.toContain("See your git history at a glance");
  });

  test("shows an honest empty state with the demo link", () => {
    const html = view({ pinned: [], recent: [] });
    expect(html).toContain("Repos you open will show up here");
    expect(html).toContain('href="/demo"');
  });

  test("groups pinned and recent repos with accessible, non-nested controls", () => {
    const html = view({
      pinned: [{ owner: "octocat", repo: "Hello-World", lastViewedAt: NOW - 3_600_000, pinned: true }],
      recent: [{ owner: "vercel", repo: "next.js", lastViewedAt: NOW - 60_000, pinned: false }],
    });
    expect(html).toContain(">Pinned<");
    expect(html).toContain(">Recent<");
    expect(html).toContain('href="/repo/octocat/Hello-World"');
    expect(html).toContain('href="/repo/vercel/next.js"');
    expect(html).toContain('aria-label="Pin octocat/Hello-World"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("1 hour ago");
    expect(html).toContain("Clear recents");
    // The pin button must be a sibling of the link, never nested inside it.
    expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>).)*<button/s);
  });

  test("hides Clear recents when only pins exist", () => {
    const html = view({
      pinned: [{ owner: "o", repo: "r", lastViewedAt: NOW, pinned: true }],
      recent: [],
    });
    expect(html).not.toContain("Clear recents");
    expect(html).not.toContain(">Recent<");
  });
});

describe("isSignedIn", () => {
  const withEnv = async (run: () => Promise<void>) => {
    const keys = ["WORKOS_CLIENT_ID", "WORKOS_API_KEY", "WORKOS_COOKIE_PASSWORD", "NEXT_PUBLIC_WORKOS_REDIRECT_URI"] as const;
    const saved = keys.map((key) => process.env[key]);
    process.env.WORKOS_CLIENT_ID = "client";
    process.env.WORKOS_API_KEY = "key";
    process.env.WORKOS_COOKIE_PASSWORD = "x".repeat(32);
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI = "http://localhost:3005/callback";
    try {
      await run();
    } finally {
      keys.forEach((key, index) => {
        if (saved[index] === undefined) delete process.env[key];
        else process.env[key] = saved[index];
      });
    }
  };

  test("is false when auth is not configured, without consulting the session", async () => {
    let called = false;
    expect(await isSignedIn(async () => ((called = true), { user: { id: "u" } }))).toBe(false);
    expect(called).toBe(false);
  });

  test("is true only for a confirmed user and fails closed on errors", async () => {
    await withEnv(async () => {
      expect(await isSignedIn(async () => ({ user: { id: "u1" } }))).toBe(true);
      expect(await isSignedIn(async () => ({ user: null }))).toBe(false);
      expect(
        await isSignedIn(async () => {
          throw new Error("workos down");
        }),
      ).toBe(false);
    });
  });
});

describe("formatRelative", () => {
  test("buckets elapsed time", () => {
    expect(formatRelative(NOW - 10_000, NOW)).toBe("just now");
    expect(formatRelative(NOW - 5 * 60_000, NOW)).toBe("5 minutes ago");
    expect(formatRelative(NOW - 2 * 86_400_000, NOW)).toBe("2 days ago");
    expect(formatRelative(NOW - 14 * 86_400_000, NOW)).toBe("2 weeks ago");
    expect(formatRelative(NOW - 90 * 86_400_000, NOW)).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });
});

describe("recents privacy wiring", () => {
  test("the store and library never touch the network or send repo names to analytics", async () => {
    const store = await Bun.file("lib/recent-repos.ts").text();
    const library = await Bun.file("components/home/RepoLibrary.tsx").text();
    const hook = await Bun.file("components/repo/useRepoLibrary.ts").text();
    for (const source of [store, library, hook]) {
      expect(source).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon/);
    }
    expect(store).not.toMatch(/from ["']@\/lib\/analytics/);
    // Only the entry source is reported when a library row is opened.
    const calls = library.match(/track\(\{[^)]*\}\)/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('props: { source }');
    expect(calls[0]).not.toMatch(/owner|item\b|path\b/);
  });

  test("RepoScreen never records private repos", async () => {
    const screen = await Bun.file("components/repo/RepoScreen.tsx").text();
    expect(screen).toMatch(/result\.private !== true\) recordVisit/);
  });
});
