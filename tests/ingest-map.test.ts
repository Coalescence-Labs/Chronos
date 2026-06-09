import { describe, expect, test } from "bun:test";
import { toBranchRefs, toCommitNode, toTagRefs } from "@/lib/ingest/github/map";
import { commitItem, refItem } from "./fixtures/github";

describe("GitHub → normalized model mapping", () => {
  test("maps a regular commit to the graph-relevant minimum", () => {
    const node = toCommitNode(commitItem("abc123", ["def456"]));
    expect(node).toEqual({
      sha: "abc123",
      parents: ["def456"],
      author: "Ada Lovelace",
      date: "2026-06-01T12:00:00Z",
      message: "feat: change for abc123",
    });
    // Exactly the model's keys — proves GitHub's extra fields are stripped
    // and no message body leaves the server (docs/PRIVACY.md).
    expect(Object.keys(node).sort()).toEqual(["author", "date", "message", "parents", "sha"]);
  });

  test("keeps parent order on merge commits (first parent first)", () => {
    const node = toCommitNode(commitItem("merge1", ["main1", "feature1"]));
    expect(node.parents).toEqual(["main1", "feature1"]);
  });

  test("root commits have no parents", () => {
    expect(toCommitNode(commitItem("root1", [])).parents).toEqual([]);
  });

  test("falls back to login, then unknown, when git author is missing", () => {
    const noName = commitItem("a1", [], {
      commit: { author: { date: "2026-01-01T00:00:00Z" }, message: "msg" },
    });
    expect(toCommitNode(noName).author).toBe("ada");

    const nobody = commitItem("a2", [], {
      commit: { author: null, message: "msg" },
      author: null,
    });
    expect(toCommitNode(nobody).author).toBe("unknown");
  });

  test("maps branches and tags to typed refs", () => {
    expect(toBranchRefs([refItem("main", "c5")])).toEqual([
      { name: "main", type: "branch", sha: "c5" },
    ]);
    expect(toTagRefs([refItem("v1.0.0", "c2")])).toEqual([
      { name: "v1.0.0", type: "tag", sha: "c2" },
    ]);
  });
});
