import { describe, expect, test } from "bun:test";
import { IngestError } from "@/lib/ingest/errors";
import { parseRepoInput } from "@/lib/ingest/github/parse";

describe("parseRepoInput", () => {
  const expected = { owner: "acme", repo: "widgets" };

  test.each([
    "https://github.com/acme/widgets",
    "http://github.com/acme/widgets",
    "https://www.github.com/acme/widgets",
    "github.com/acme/widgets",
    "https://github.com/acme/widgets.git",
    "https://github.com/acme/widgets/",
    "https://github.com/acme/widgets/tree/main/src",
    "https://github.com/acme/widgets?tab=readme-ov-file",
    "git@github.com:acme/widgets.git",
    "acme/widgets",
    "  acme/widgets  ",
  ])("accepts %s", (input) => {
    expect(parseRepoInput(input)).toEqual(expected);
  });

  test("preserves dots and hyphens in repo names", () => {
    expect(parseRepoInput("vercel/next.js")).toEqual({ owner: "vercel", repo: "next.js" });
    expect(parseRepoInput("my-org/my-repo")).toEqual({ owner: "my-org", repo: "my-repo" });
  });

  test.each([
    "",
    "   ",
    "widgets",
    "acme/widgets/extra",
    "https://gitlab.com/acme/widgets",
    "https://github.com/acme",
    "git@gitlab.com:acme/widgets.git",
    "javascript:alert(1)",
    "acme/../secrets",
    "-acme/widgets",
    "acme/..",
  ])("rejects %j", (input) => {
    expect(() => parseRepoInput(input)).toThrow(IngestError);
    try {
      parseRepoInput(input);
    } catch (error) {
      expect((error as IngestError).code).toBe("invalid-input");
    }
  });
});
