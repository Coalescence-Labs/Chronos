import { describe, expect, test } from "bun:test";
import { runAgentFactTool } from "@/lib/agent/facts/tools";
import {
  mergeContextRefs,
  parseAgentContextRef,
  resolveAgentAnchorSha,
  serializeAgentContextRef,
} from "@/lib/agent/chat-context";
import type { RepoHistory } from "@/lib/graph";

const history: RepoHistory = {
  commits: [
    { sha: "aaa1111", parents: [], author: "a", date: "2026-01-01T00:00:00Z", message: "root" },
    { sha: "bbb2222", parents: ["aaa1111"], author: "b", date: "2026-01-02T00:00:00Z", message: "feat" },
  ],
  refs: [
    { name: "main", type: "branch", sha: "bbb2222" },
    { name: "feature/x", type: "branch", sha: "bbb2222" },
  ],
};

describe("agent chat context", () => {
  test("serializes and parses graph context refs", () => {
    const ref = {
      kind: "commit" as const,
      sha: "bbb2222",
      label: "bbb2222",
      message: "feat",
    };
    const parsed = parseAgentContextRef(serializeAgentContextRef(ref));
    expect(parsed).toEqual(ref);
  });

  test("mergeContextRefs dedupes by kind, sha, and label", () => {
    const a = { kind: "branch" as const, sha: "bbb2222", label: "main" };
    const b = { kind: "branch" as const, sha: "bbb2222", label: "feature/x" };
    expect(mergeContextRefs([a], [a, b])).toEqual([a, b]);
  });

  test("resolveAgentAnchorSha prefers commit chips over selection and focus", () => {
    expect(
      resolveAgentAnchorSha({
        selectedSha: "aaa1111",
        focusedBranch: { name: "main", tipSha: "bbb2222" },
        contextRefs: [{ kind: "commit", sha: "ccc3333", label: "ccc3333" }],
      }),
    ).toBe("ccc3333");
    expect(
      resolveAgentAnchorSha({
        selectedSha: "aaa1111",
        focusedBranch: { name: "main", tipSha: "bbb2222" },
      }),
    ).toBe("aaa1111");
    expect(
      resolveAgentAnchorSha({
        focusedBranch: { name: "main", tipSha: "bbb2222" },
      }),
    ).toBe("bbb2222");
  });

  test("fact tools include focused branch and context refs in summary", () => {
    const summary = runAgentFactTool("graph_summary", {
      owner: "o",
      repo: "r",
      history,
      focusedBranch: { name: "main", tipSha: "bbb2222" },
      contextRefs: [{ kind: "branch", sha: "bbb2222", label: "feature/x" }],
    });
    expect(summary.data).toMatchObject({
      focusedBranch: { name: "main", tipSha: "bbb2222" },
      contextRefs: [{ kind: "branch", sha: "bbb2222", label: "feature/x" }],
    });
  });

  test("anchored_commit uses focused tip when no chip or selection", () => {
    const anchor = runAgentFactTool("anchored_commit", {
      owner: "o",
      repo: "r",
      history,
      focusedBranch: { name: "main", tipSha: "bbb2222" },
    });
    expect(anchor.data).toMatchObject({ selectedSha: "bbb2222", anchor: { sha: "bbb2222" } });
  });
});
