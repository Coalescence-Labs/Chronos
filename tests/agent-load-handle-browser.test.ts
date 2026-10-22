import { describe, expect, test } from "bun:test";
import { buildLoadHandle } from "@/lib/agent/facts/load-handle";
import { buildLoadHandleBrowser } from "@/lib/agent/facts/load-handle-browser";
import type { RepoHistory } from "@/lib/graph";

const sampleHistory: RepoHistory = {
  commits: [
    {
      sha: "abc123def456",
      parents: [],
      author: "dev",
      date: "2024-01-01T00:00:00Z",
      message: "init",
    },
  ],
  refs: [{ name: "main", type: "branch", sha: "abc123def456" }],
};

describe("buildLoadHandleBrowser", () => {
  test("matches server load handle", async () => {
    const server = buildLoadHandle("acme", "widget", sampleHistory);
    const browser = await buildLoadHandleBrowser("acme", "widget", sampleHistory);
    expect(browser).toBe(server);
  });
});
