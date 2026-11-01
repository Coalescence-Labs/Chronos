import { describe, expect, test } from "bun:test";
import { questionRequestsPullRequestFacts } from "@/lib/agent/pr-tools";

describe("agent pr tools", () => {
  test("detects PR-capable questions", () => {
    expect(questionRequestsPullRequestFacts("Any open pull requests?")).toBe(true);
    expect(questionRequestsPullRequestFacts("What is on main?")).toBe(false);
  });
});
