import { describe, expect, test } from "bun:test";
import {
  AGENT_PUBLIC_ONLY_ERROR,
  assertPublicRepoForAgent,
  isSyntheticDemoRepo,
} from "@/lib/agent/public-repo";
import { generateAgentStarters } from "@/lib/agent/starters/generate";
import type { RepoHistory } from "@/lib/graph";

const history: RepoHistory = {
  commits: [
    {
      sha: "deadbeef",
      parents: [],
      author: "x",
      date: "2026-01-01T00:00:00Z",
      message: "PRIVATE_MARKER_SHOULD_NOT_REACH_GATEWAY",
    },
  ],
  refs: [{ name: "main", type: "branch", sha: "deadbeef" }],
};

describe("agent public-repo gate", () => {
  test("synthetic demo repo is treated as public", () => {
    expect(isSyntheticDemoRepo("chronos", "demo")).toBe(true);
    expect(isSyntheticDemoRepo("acme", "secret")).toBe(false);
  });

  test("assertPublicRepoForAgent fails closed for private meta", async () => {
    const result = await assertPublicRepoForAgent({
      owner: "acme",
      repo: "secret",
      auth: {
        privateAccessVerified: true,
        repoMeta: { defaultBranch: "main", private: true },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(AGENT_PUBLIC_ONLY_ERROR);
  });

  test("assertPublicRepoForAgent allows explicit public meta", async () => {
    const result = await assertPublicRepoForAgent({
      owner: "acme",
      repo: "widgets",
      auth: {
        repoMeta: { defaultBranch: "main", private: false },
      },
    });
    expect(result.ok).toBe(true);
  });

  test("generateAgentStarters refuses private without sending graph facts", async () => {
    const result = await generateAgentStarters({
      workosUserId: "user_test",
      owner: "acme",
      repo: "secret",
      history,
      repoIsPublic: false,
    });
    expect(result.ok).toBe(false);
    expect(result.starters).toEqual([]);
    expect(result.error).toBe(AGENT_PUBLIC_ONLY_ERROR);
  });
});
