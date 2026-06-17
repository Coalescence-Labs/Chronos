import { afterEach, describe, expect, test } from "bun:test";
import { IngestError } from "@/lib/ingest/errors";
import { fetchCommitPage, fetchRepoMeta, MAX_COMMIT_PAGE } from "@/lib/ingest/github/fetch";
import { githubJson, mockGitHub } from "./fixtures/github";

/**
 * Upstream edge cases of the BFF fetcher (COA-94): the branches that the route
 * tests only exercise indirectly — empty repos, page bounds, and the rate-
 * limit mapping (including the computed retryAfterSeconds).
 */

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

const id = { owner: "acme", repo: "widgets" };

describe("fetchCommitPage", () => {
  test("409 (empty / unborn default branch) is an empty page, not an error", async () => {
    restore = mockGitHub(() => new Response(null, { status: 409 }));
    expect(await fetchCommitPage(id, "main", 1)).toEqual({ commits: [], hasMore: false });
  });

  test("a non-positive or non-integer page is rejected before any network call", async () => {
    let networkHit = false;
    restore = mockGitHub(() => {
      networkHit = true;
      return githubJson([]);
    });
    for (const page of [0, -1, 1.5]) {
      await expect(fetchCommitPage(id, "main", page)).rejects.toMatchObject({
        name: "IngestError",
        code: "invalid-input",
      });
    }
    expect(networkHit).toBe(false);
  });

  test("a page beyond the hard cap is refused as too-large", async () => {
    restore = mockGitHub(() => githubJson([]));
    await expect(fetchCommitPage(id, "main", MAX_COMMIT_PAGE + 1)).rejects.toMatchObject({
      code: "too-large",
    });
  });
});

describe("error mapping", () => {
  test("403 with remaining=0 → rate-limited, with retryAfterSeconds from the reset header", async () => {
    const reset = Math.floor(Date.now() / 1000) + 120;
    restore = mockGitHub(() =>
      githubJson(
        { message: "API rate limit exceeded" },
        { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) } },
      ),
    );
    const error = await fetchRepoMeta(id).then(
      () => null,
      (e: unknown) => e as IngestError,
    );
    expect(error).toBeInstanceOf(IngestError);
    expect(error!.code).toBe("rate-limited");
    expect(error!.retryAfterSeconds).toBeGreaterThan(110);
    expect(error!.retryAfterSeconds).toBeLessThanOrEqual(120);
  });

  test("429 → rate-limited", async () => {
    restore = mockGitHub(() => githubJson({}, { status: 429 }));
    await expect(fetchRepoMeta(id)).rejects.toMatchObject({ code: "rate-limited" });
  });

  test("403 with budget remaining is a generic upstream error, not rate-limit", async () => {
    restore = mockGitHub(() => githubJson({}, { status: 403, headers: { "x-ratelimit-remaining": "57" } }));
    await expect(fetchRepoMeta(id)).rejects.toMatchObject({ code: "upstream" });
  });

  test("404 / 451 → not-found", async () => {
    restore = mockGitHub((url) => githubJson({ message: "Not Found" }, { status: url.pathname.endsWith("widgets") ? 404 : 451 }));
    await expect(fetchRepoMeta(id)).rejects.toMatchObject({ code: "not-found" });
  });
});
